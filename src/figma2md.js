import fs from "fs/promises";

const FIGMA_API_BASE = "https://api.figma.com/v1";

export async function exportFigmaToMarkdown({ linkOrKey, token, outPath = "figma.md" }) {
  const { fileKey } = parseFigmaLink(linkOrKey);
  if (!fileKey) throw new Error("Invalid Figma link or fileKey");

  const headers = { "X-Figma-Token": token };
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API error: ${res.status} ${res.statusText} - ${body}`);
  }
  const file = await res.json();
  if (!file.document || !file.document.children) {
    throw new Error("Unexpected Figma response: missing document.children");
  }

  const lines = [];
  const pages = file.document.children;
  for (const page of pages) {
    const pageName = page.name || "Untitled Page";
    traverse(page, (node, parents) => {
      if (node.type === "TEXT" && node.characters && node.characters.trim()) {
        const frameName = parents.find(p => p.type === "FRAME" || p.type === "COMPONENT" || p.type === "GROUP")?.name || "Root";
        const anchor = `[#page:${escapeBrackets(pageName)}][#frame:${escapeBrackets(frameName)}][#node:${node.id}]`;
        const text = node.characters.replace(/\r\n|\r/g, "\n").split("\n").map(s => s.trim()).join("\n").trim();
        if (text) lines.push(`${anchor}\n${text}\n`);
      }
    });
  }

  const md = `# Figma Extract (${fileKey})\n\n` + lines.join("\n");
  await fs.writeFile(outPath, md, "utf-8");
  return outPath;
}

function traverse(node, visit, parents = []) {
  visit(node, parents);
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      traverse(child, visit, [node, ...parents]);
    }
  }
}

function escapeBrackets(s) { return String(s).replace(/[\[\]]/g, "_"); }

export function parseFigmaLink(linkOrKey) {
  if (!linkOrKey) return { fileKey: null, nodeId: null };
  if (/^[A-Za-z0-9-_]{10,}$/.test(linkOrKey) && !linkOrKey.includes("figma.com")) return { fileKey: linkOrKey, nodeId: null };
  try {
    const u = new URL(linkOrKey);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex(p => p === "file" || p === "design");
    const key = idx >= 0 && parts[idx+1] ? parts[idx+1] : null;
    const nodeId = u.searchParams.get("node-id");
    return { fileKey: key, nodeId };
  } catch { return { fileKey: null, nodeId: null }; }
}
