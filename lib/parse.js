import mammoth from "mammoth";
import { readImage } from "./gemini";

export async function parseUpload(filename, buffer, mime) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") {
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const out = await pdfParse(buffer);
    return { kind: "pdf", text: out.text || "" };
  }
  if (ext === "docx") {
    const out = await mammoth.extractRawText({ buffer });
    return { kind: "docx", text: out.value || "" };
  }
  if (["png", "jpg", "jpeg", "webp", "heic"].includes(ext) || (mime || "").startsWith("image/")) {
    const text = await readImage(buffer, mime || "image/jpeg", "请把这张图片的内容转成便于检索的文本:①完整转写其中所有文字(保留标题与条目结构);②对图里的示意图/图表/流程图/插图,用简短文字描述它画的是什么、关键组成与关系(如箭头方向、流程步骤、结构层次、坐标轴含义),每个用「图:…」起头。只输出这些内容,不要额外说明。");
    return { kind: "image", text };
  }
  // txt / md / 其他按文本
  return { kind: "txt", text: buffer.toString("utf-8") };
}
