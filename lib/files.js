import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const MAT_DIR = path.join(DATA_DIR, "materials");
export const REC_DIR = path.join(DATA_DIR, "recordings");
export const MOCK_DIR = path.join(DATA_DIR, "mock_answers");
export const CHATFILE_DIR = path.join(DATA_DIR, "chat_files");
export const BUG_DIR = path.join(DATA_DIR, "bug_files");
export const BUGREC_DIR = path.join(DATA_DIR, "bug_recordings");
export const BUGDEV_DIR = path.join(DATA_DIR, "bug_dev_answers");

export const UPLOAD_TMP_DIR = path.join(DATA_DIR, "uploads_tmp");
export function ensureMatDir() { if (!fs.existsSync(MAT_DIR)) fs.mkdirSync(MAT_DIR, { recursive: true }); }
// 【分块上传·临时拼盘】每个进行中的上传按 uploadId 存一个临时文件,分块 append 进来;收齐后 rename 成资料文件(同卷、零内存)。
export function ensureUploadTmp() { if (!fs.existsSync(UPLOAD_TMP_DIR)) fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true }); }
export function chunkTmpPath(uploadId) { return path.join(UPLOAD_TMP_DIR, String(uploadId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)); }
export function appendChunk(uploadId, buffer) { ensureUploadTmp(); fs.appendFileSync(chunkTmpPath(uploadId), buffer); }
export function finalizeChunkTo(uploadId, destPath) { const src = chunkTmpPath(uploadId); ensureMatDir(); fs.renameSync(src, destPath); }
export function discardChunk(uploadId) { try { fs.unlinkSync(chunkTmpPath(uploadId)); } catch {} }
export function chunkTmpSize(uploadId) { try { return fs.statSync(chunkTmpPath(uploadId)).size; } catch { return 0; } }
export function matPath(id) { return path.join(MAT_DIR, String(id)); }
export function saveMat(id, buffer) { ensureMatDir(); fs.writeFileSync(matPath(id), buffer); }
export function readMat(id) { const p = matPath(id); return fs.existsSync(p) ? fs.readFileSync(p) : null; }
export function delMat(id) { try { fs.unlinkSync(matPath(id)); } catch {} }
export function saveRec(id, buffer) { if (!fs.existsSync(REC_DIR)) fs.mkdirSync(REC_DIR, { recursive: true }); fs.writeFileSync(path.join(REC_DIR, String(id)), buffer); }
export function readRec(id) { const p = path.join(REC_DIR, String(id)); return fs.existsSync(p) ? fs.readFileSync(p) : null; }
// 模拟考某道题的作答附件(手写/上传),原样(未压缩)永久存盘,按 attemptId 归档
export function saveMockAtt(id, arr) { if (!fs.existsSync(MOCK_DIR)) fs.mkdirSync(MOCK_DIR, { recursive: true }); fs.writeFileSync(path.join(MOCK_DIR, String(id)), JSON.stringify(arr)); }
export function readMockAtt(id) { const p = path.join(MOCK_DIR, String(id)); try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; } catch { return null; } }
// 杀手生成、发给用户下载的文件
export function saveChatFile(id, buffer) { if (!fs.existsSync(CHATFILE_DIR)) fs.mkdirSync(CHATFILE_DIR, { recursive: true }); fs.writeFileSync(path.join(CHATFILE_DIR, String(id)), buffer); }
export function readChatFile(id) { const p = path.join(CHATFILE_DIR, String(id)); return fs.existsSync(p) ? fs.readFileSync(p) : null; }
// bug 反馈里附带的图片/文件(用户草稿、手写、上传),原样存
export function saveBugAtt(id, arr) { if (!fs.existsSync(BUG_DIR)) fs.mkdirSync(BUG_DIR, { recursive: true }); fs.writeFileSync(path.join(BUG_DIR, String(id)), JSON.stringify(arr)); }
export function readBugAtt(id) { const p = path.join(BUG_DIR, String(id)); try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; } catch { return null; } }
export function saveBugRec(id, buffer) { if (!fs.existsSync(BUGREC_DIR)) fs.mkdirSync(BUGREC_DIR, { recursive: true }); fs.writeFileSync(path.join(BUGREC_DIR, String(id)), buffer); }
export function readBugRec(id) { const p = path.join(BUGREC_DIR, String(id)); return fs.existsSync(p) ? fs.readFileSync(p) : null; }
export function saveBugDevRec(id, buffer) { if (!fs.existsSync(BUGDEV_DIR)) fs.mkdirSync(BUGDEV_DIR, { recursive: true }); fs.writeFileSync(path.join(BUGDEV_DIR, String(id)), buffer); }
export function readBugDevRec(id) { const p = path.join(BUGDEV_DIR, String(id)); return fs.existsSync(p) ? fs.readFileSync(p) : null; }

const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  heic: "image/heic", gif: "image/gif", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
  aac: "audio/aac", flac: "audio/flac", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain", md: "text/markdown" };
export function guessMime(filename, fallback) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return (fallback && fallback !== "application/octet-stream" ? fallback : null) || MIME[ext] || "application/octet-stream";
}
export function kindOf(filename, mime) {
  const m = mime || guessMime(filename);
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  if (m.includes("word")) return "docx";
  return "txt";
}
