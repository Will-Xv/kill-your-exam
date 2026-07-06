import fs from "fs";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

// 在系统里找一个支持中日韩的字体(Dockerfile 里装了 fonts-noto-cjk)
const CJK_CANDIDATES = [
  ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"],
  ["/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc", "Noto Serif CJK SC"],
  ["/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc", "Noto Serif CJK SC"],
  ["/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"],
];
function findCjkFont() {
  for (const [p, name] of CJK_CANDIDATES) { try { if (fs.existsSync(p)) return [p, name]; } catch {} }
  return null;
}

// 把常见 Markdown 行拆成结构(标题/列表/普通段)
function parseLines(md) {
  return String(md || "").replace(/\r\n/g, "\n").split("\n").map((raw) => {
    const line = raw.replace(/\s+$/,"");
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) return { type: "h", level: m[1].length, text: m[2] };
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) return { type: "li", text: m[1] };
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) return { type: "oli", text: m[1] };
    if (!line.trim()) return { type: "blank" };
    return { type: "p", text: line };
  });
}
// 去掉行内 **bold** / `code` 标记(纯文本渲染)
const plain = (t) => String(t || "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/`(.*?)`/g, "$1");

export async function buildDocx(md) {
  const nodes = parseLines(md);
  const children = [];
  for (const n of nodes) {
    if (n.type === "blank") { children.push(new Paragraph({ text: "" })); continue; }
    if (n.type === "h") { children.push(new Paragraph({ text: plain(n.text), heading: n.level === 1 ? HeadingLevel.HEADING_1 : n.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 })); continue; }
    if (n.type === "li") { children.push(new Paragraph({ text: plain(n.text), bullet: { level: 0 } })); continue; }
    if (n.type === "oli") { children.push(new Paragraph({ text: plain(n.text), numbering: undefined, bullet: { level: 0 } })); continue; }
    children.push(new Paragraph({ children: [new TextRun(plain(n.text))] }));
  }
  const doc = new Document({ sections: [{ children }] });
  return await Packer.toBuffer(doc);
}

export function buildPdf(md) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const cjk = findCjkFont();
    if (cjk) { try { doc.registerFont("body", cjk[0], cjk[1]); doc.font("body"); } catch {} }
    for (const n of parseLines(md)) {
      if (n.type === "blank") { doc.moveDown(0.5); continue; }
      if (n.type === "h") { doc.fontSize(n.level === 1 ? 20 : n.level === 2 ? 16 : 13).text(plain(n.text)); doc.moveDown(0.3); doc.fontSize(11); continue; }
      if (n.type === "li") { doc.fontSize(11).text("• " + plain(n.text), { indent: 14 }); continue; }
      if (n.type === "oli") { doc.fontSize(11).text(plain(n.text), { indent: 14 }); continue; }
      doc.fontSize(11).text(plain(n.text)); doc.moveDown(0.2);
    }
    doc.end();
  });
}
