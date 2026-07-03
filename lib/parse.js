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
    const text = await readImage(buffer, mime || "image/jpeg", "请把这张图片中的全部文字内容完整转写为纯文本,保留标题和条目结构。只输出转写内容。");
    return { kind: "image", text };
  }
  // txt / md / 其他按文本
  return { kind: "txt", text: buffer.toString("utf-8") };
}
