import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { exportFigmaToMarkdown } from "./src/figma2md.js";
import { runGemini } from "./src/runGemini.js";
import { buildPromptFromUser, defaultRubric } from "./src/util.js";
import { marked } from "marked";
import crypto from "crypto";

// 단일 줄바꿈도 유지되게
marked.setOptions({ gfm: true, breaks: true });

function prettifyMarkdown(md) {
  // 1) 모든 헤딩 뒤에 빈 줄 하나 보장 (문단 들러붙음 방지)
  md = md.replace(/^(#{1,6}\s.+)\n(?!\n)/gm, '$1\n\n');

  // 2) "요약" 섹션만 골라서 문장 끝(., !, ?, CJK 마침표) 뒤에 줄바꿈 추가
  //   - "## 요약" 또는 "📋 요약" 라인을 헤딩처럼 취급
  const re = /((?:^|\n)(?:##\s*요약[^\n]*|📋\s*요약[^\n]*)\n)([\s\S]*?)(?=\n(?:##\s|[✅🔧⚠️🚀📈]|$))/m;
  md = md.replace(re, (_, head, body) => {
    const normalized = body
        .replace(/\r/g, '')
        // 영문/숫자 문장부호 뒤에 줄바꿈 (다음 문자가 개행이 아닌 경우)
        .replace(/([.!?])\s+(?=[^\n])/g, '$1\n')
        // CJK 마침표/느낌표/물음표 뒤에 줄바꿈
        .replace(/([。．！？」］）］〕〉》」’”])(?=[^\n])/g, '$1\n')
        // 연속 개행 정리
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return head + normalized + '\n';
  });

  return md;
}

import fs from "fs/promises";

function userHashFromPat(pat) {
  // 토큰 그대로 노출 피하려고 해시 사용 (앞 12자리)
  return crypto.createHash("sha256").update(pat).digest("hex").slice(0, 12);
}

async function makeJobPaths(figmaPat) {
  const uid = userHashFromPat(figmaPat);
  const userDir = path.join(DATA_DIR, uid);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  const jobId = `${ts}-${rand}`;
  const jobDir = path.join(userDir, jobId);

  await fs.mkdir(userDir, { recursive: true });
  await fs.mkdir(jobDir, { recursive: true });

  return {
    uid, jobId, userDir, jobDir,
    mdPath: path.join(jobDir, "figma.md"),
    reviewPath: path.join(jobDir, "review.md"),
    telemetryPath: path.join(jobDir, "telemetry.log"),
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const reviewPath = path.join(__dirname, "review.md");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// in-memory config (per-process)
let CONFIG = {
  figmaPat: "",
  geminiApiKey: "",
  model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  inputCharLimit: parseInt(process.env.INPUT_CHAR_LIMIT || "120000", 10),
  prompt: ""
};

app.post("/api/config", (req, res) => {
  const { figmaPat, geminiApiKey, prompt, model, inputCharLimit } = req.body || {};
  if (!figmaPat || !geminiApiKey || !prompt) {
    return res.status(400).json({ ok: false, error: "FIGMA_PAT, GEMINI_API_KEY, prompt are required" });
  }
  CONFIG.figmaPat = figmaPat.trim();
  CONFIG.geminiApiKey = geminiApiKey.trim();
  CONFIG.prompt = prompt;
  if (model) CONFIG.model = model;
  if (inputCharLimit) CONFIG.inputCharLimit = parseInt(inputCharLimit, 10) || CONFIG.inputCharLimit;
  return res.json({ ok: true, model: CONFIG.model, inputCharLimit: CONFIG.inputCharLimit });
});

app.post("/api/review", async (req, res) => {
  try {
    const { link } = req.body || {};
    if (!CONFIG.figmaPat || !CONFIG.geminiApiKey || !CONFIG.prompt) {
      return res.status(400).json({ ok: false, error: "config not set. call /api/config first." });
    }
    if (!link) return res.status(400).json({ ok: false, error: "link is required" });

    // 1) Figma -> MD

    const { uid, jobId, jobDir, mdPath, reviewPath, telemetryPath } = await makeJobPaths(CONFIG.figmaPat);
    await exportFigmaToMarkdown({ linkOrKey: link, token: CONFIG.figmaPat, outPath: mdPath });

    // 2) Build prompt from user + rubric
    const prompt = buildPromptFromUser(CONFIG.prompt, defaultRubric);

    // 3) Run Gemini CLI (stdin)
    process.env.GEMINI_API_KEY = CONFIG.geminiApiKey; // ensure child sees it
    await runGemini({
      inputPath: mdPath,
      promptText: prompt,
      outPath: reviewPath,
      model: CONFIG.model,
      inputCharLimit: CONFIG.inputCharLimit,
      // runGemini가 telemetry 디렉터리 인자(telemetryOutDir)를 지원하면 주석 해제:
      // telemetryOutDir: jobDir,
    });

    let md = await fs.readFile(reviewPath, "utf-8");
    md = prettifyMarkdown(md);
    const html = marked.parse(md);
    res.json({ ok: true, markdown: md, html, meta: { model: CONFIG.model, inputCharLimit: CONFIG.inputCharLimit } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/ping", (_, res) => res.json({ ok: true }));

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Figma-Gemini Web running on http://localhost:${PORT}`);
});
