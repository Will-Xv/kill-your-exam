import mammoth from "mammoth";

// 摄取策略(Will 定):PDF 与图片【一律不抽文字、不 OCR】,原文件保存后通过 File API 交给 Gemini 多模态直读;
// 只有【原生数字文本】(docx / txt / md 等)才抽文字入库做分块检索(RAG)。
export async function parseUpload(filename, buffer, mime) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") {
    return { kind: "pdf", text: "" }; // 不抽文字:PDF 一律走 File API 多模态直读
  }
  if (["png", "jpg", "jpeg", "webp", "heic"].includes(ext) || (mime || "").startsWith("image/")) {
    return { kind: "image", text: "" }; // 不 OCR:图片一律走 File API 多模态直读
  }
  if (ext === "docx") {
    const out = await mammoth.extractRawText({ buffer });
    return { kind: "docx", text: out.value || "" };
  }
  // txt / md / 其他按文本
  return { kind: "txt", text: buffer.toString("utf-8") };
}
