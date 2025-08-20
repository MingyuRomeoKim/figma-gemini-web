import { spawnSync } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

function whichCmdPath(cmd) {
  try {
    const tool = process.platform === "win32" ? "where" : "which";
    const r = spawnSync(tool, [cmd], { encoding: "utf-8" });
    if (r.status === 0) {
      const p = String(r.stdout || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
      return p || null;
    }
  } catch {}
  return null;
}

function findGeminiBinary() {
  if (process.env.GEMINI_BIN) return process.env.GEMINI_BIN;
  const resolved = whichCmdPath("gemini");
  return resolved; // may be null
}

function explain(r) {
  const parts = [];
  if (r.error) parts.push(`error=${r.error.message}`);
  if (r.status !== null && r.status !== 0) parts.push(`status=${r.status}`);
  if (r.signal) parts.push(`signal=${r.signal}`);
  const std = (r.stderr || r.stdout || "").toString();
  if (std.trim()) parts.push(std.trim());
  return parts.join("\n");
}

export async function runGemini({
  inputPath,
  promptText,
  outPath = "review.md",
  model = process.env.GEMINI_MODEL || "gemini-1.5-flash",
  inputCharLimit = parseInt(process.env.INPUT_CHAR_LIMIT || "120000", 10)
}) {
  const geminiBin = findGeminiBinary();
  let stdinData = fs.readFileSync(inputPath, "utf-8");
  if (stdinData.length > inputCharLimit) {
    stdinData = stdinData.slice(0, inputCharLimit);
  }

  const telemetryFile = path.join(process.cwd(), "telemetry.log");
  const baseArgs = ["--telemetry-outfile", telemetryFile, "--telemetry=false", "-m", model, "-p", promptText];
  const opts = { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, input: stdinData };

  let stdout = "";

  if (geminiBin) {
    const r = spawnSync(geminiBin, baseArgs, opts);
    if (r.status === 0) {
      stdout = (r.stdout || "") + (r.stderr || "");
    } else {
      const info = explain(r);
      const r2 = spawnSync("npx", ["-y", "@google/gemini-cli", ...baseArgs], opts);
      if (r2.status !== 0) {
        const info2 = explain(r2);
        throw new Error(`gemini failed and npx fallback also failed:\n--- gemini ---\n${info}\n--- npx ---\n${info2}`);
      }
      stdout = (r2.stdout || "") + (r2.stderr || "");
    }
  } else {
    const r = spawnSync("npx", ["-y", "@google/gemini-cli", ...baseArgs], opts);
    if (r.status !== 0) {
      const std = (r.stderr || r.stdout || "").toString();
      throw new Error(`npx @google/gemini-cli failed with code ${r.status}:\n${std}`);
    }
    stdout = (r.stdout || "") + (r.stderr || "");
  }

  const cleaned = stdout
    .replace(/^\s*Data collection is disabled\.\s*$/gmi, "")
    .trim();

  if (!cleaned) {
    throw new Error("Empty Gemini output. Check GEMINI_API_KEY and network. See telemetry.log for details.");
  }

  await fsp.writeFile(outPath, cleaned + "\n", "utf-8");
  return outPath;
}
