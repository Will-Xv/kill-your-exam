import { GoogleGenAI } from "@google/genai";
import { getSetting } from "./db";
import { AiError, classifyError } from "./errors";
import fs from "fs";
import os from "os";
import path from "path";

function getKey() {
  return getSetting("gemini_api_key", process.env.GEMINI_API_KEY || "");
}
export function getModelName() {
  return getSetting("gemini_model", process.env.GEMINI_MODEL || "gemini-2.5-flash");
}
function getClient() {
  const key = getKey();
  if (!key) throw new AiError("no_key", "missing api key");
  return new GoogleGenAI({ apiKey: key });
}

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = classifyError(e);
      if (!last.retryable || i === tries - 1) throw last;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

// 通用文本生成。opts: { system, jsonSchema, useSearch, tools, contents(覆盖), temperature }
export async function generate(prompt, opts = {}) {
  const ai = getClient();
  const config = {};
  if (opts.system) config.systemInstruction = opts.system;
  if (opts.temperature != null) config.temperature = opts.temperature;
  if (opts.maxOutputTokens) config.maxOutputTokens = opts.maxOutputTokens;
  if (opts.jsonSchema) {
    config.responseMimeType = "application/json";
    config.responseSchema = opts.jsonSchema;
  }
  if (opts.useSearch) config.tools = [{ googleSearch: {} }];
  if (opts.tools) config.tools = opts.tools;
  const model = opts.model || getModelName();
  const contents = opts.contents || [{ role: "user", parts: [{ text: prompt }] }];
  const timeoutMs = opts.timeoutMs || 240000; // 单次调用【卡死侦测】阈值:超过就抛可重试错误→withRetry 立刻换连接重试(不是放弃);默认给得很宽,只兜底真正的挂死
  return withRetry(async () => {
    const res = await Promise.race([
      ai.models.generateContent({ model, contents, config }),
      new Promise((_, rej) => setTimeout(() => rej(new AiError("network", `AI 响应超时(>${Math.round(timeoutMs / 1000)}s)`, true)), timeoutMs)),
    ]);
    // 【轻量 token 日志】打印每次调用的 token 用量与【缓存命中】(cached)。
    //  ①验证隐式缓存有没有生效:cached 连续几万=生效省钱;一直 0=没命中(可能撞'带tools不缓存'的坑,需改显式缓存)。
    //  ②将来给用户计费也用这些数(prompt/cached/output 都在 res.usageMetadata 里)。
    try {
      const u = res && res.usageMetadata;
      if (u) {
        const p = u.promptTokenCount || 0, cch = u.cachedContentTokenCount || 0, o = u.candidatesTokenCount || 0, tot = u.totalTokenCount || 0;
        const hit = p ? Math.round((cch / p) * 100) : 0;
        console.log(`[TOKENS] model=${model} prompt=${p} cached=${cch}(${hit}%) output=${o} total=${tot}`);
      }
    } catch {}
    return res;
  }, opts.tries);
}

export async function generateText(prompt, opts = {}) {
  const res = await generate(prompt, opts);
  return res.text || "";
}

// 模型偶尔把 LaTeX 命令写成单反斜杠;JSON 解析时 \r \t \b \f 会被当成控制字符,吃掉命令(如 \right -> 回车+ight、\text -> 制表符+ext)。
// 解析前:把"未被转义(前面不是反斜杠)、且后面紧跟字母"的这些反斜杠补成双反斜杠,保住 LaTeX。不动 \n,以免破坏正常换行。
function repairJsonLatex(t) {
  return typeof t === "string" ? t.replace(/(?<!\\)\\(?![nu"\\/])([A-Za-z])/g, "\\\\$1") : t;
}

export async function generateJson(prompt, jsonSchema, opts = {}) {
  for (let i = 0; i < 2; i++) {
    const res = await generate(prompt, { ...opts, jsonSchema });
    try {
      try { return JSON.parse(repairJsonLatex(res.text)); } catch { return JSON.parse(res.text); }
    } catch {
      if (i === 1) throw new AiError("bad_response", "invalid JSON from model");
    }
  }
}

// 联网搜索(grounding),返回 { text, sources:[{title,url}] }
export async function searchWeb(prompt, opts = {}) {
  const res = await generate(prompt, { ...opts, useSearch: true });
  const sources = [];
  const grounding = res.candidates?.[0]?.groundingMetadata;
  for (const c of grounding?.groundingChunks || []) {
    if (c.web?.uri) sources.push({ title: c.web.title || c.web.uri, url: c.web.uri });
  }
  return { text: res.text || "", sources };
}

// 多模态:读图片(OCR/理解)。fileBuffer: Buffer, mime: string
export async function readImage(fileBuffer, mime, instruction, opts = {}) {
  // 一律走 File API(见 CLAUDE.md):突破 20MB/PDF 50MB;仅上传失败且文件小时才 inline 兜底。
  let part;
  try {
    const ext = /pdf/i.test(mime) ? "pdf" : /png/i.test(mime) ? "png" : /audio|mpeg/i.test(mime) ? "mp3" : "jpg";
    const up = await uploadMedia(fileBuffer, mime, ext);
    part = { fileData: { fileUri: up.fileUri, mimeType: up.mimeType } };
  } catch (e) {
    if (fileBuffer.length <= 14 * 1024 * 1024) part = { inlineData: { mimeType: mime, data: fileBuffer.toString("base64") } };
    else throw (e && e.isAiError ? e : new AiError("upload_failed", "file too large and upload failed"));
  }
  const res = await generate(null, { contents: [{ role: "user", parts: [part, { text: instruction }] }], maxOutputTokens: opts.maxOutputTokens });
  return res.text || "";
}

export async function embed(texts) {
  const ai = getClient();
  const model = getSetting("gemini_embed_model", "gemini-embedding-001");
  return withRetry(async () => {
    const res = await ai.models.embedContent({
      model,
      contents: texts,
      config: { outputDimensionality: 768 }
    });
    return res.embeddings.map((e) => new Float32Array(e.values));
  });
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export const LANG_NAMES = { zh: "中文", "zh-TW": "繁體中文(臺灣用語)", "zh-HK": "繁體中文(香港用語)", en: "English", fr: "français", es: "español", ru: "русский язык", ar: "العربية", id: "Bahasa Indonesia" };
export function examLangInstruction() {
  return "\n【出题语言 · 重要】题干、选项、标准答案、评分要点、解析全部使用『这门考试真正考试时所用的语言』——根据考试名称/档案/资料自行判断(例:IELTS/TOEFL→英语,DELF/TCF→法语,JLPT→日语,DELE→西班牙语,国内学科/资格考试→中文)。不要使用用户的界面语言,除非这门考试本身就用界面语言考。若某语言考试要考「译入母语」,该部分可含母语。";
}
export function langInstruction(lang) {
  const name = LANG_NAMES[lang] || "中文";
  return `\n\n[输出语言要求 / Output language requirement]: 你的全部输出必须使用 ${name}。All of your output must be written in ${name}.`;
}

// 把前端上传的附件(base64)转成 Gemini 的 inlineData parts(限大小)
// 【手写长图的附件说明·判卷提示用】拉长过的手写会附【整页 + 若干切片】。
// ★必须明确告诉模型:两者是【同一份内容的两种呈现】,不是两份作答、也没有额外信息——
// 否则模型会把同一段字识别两遍(浪费时间和算力),甚至误以为考生写了两遍、重复计分。
// 默认只读一遍(优先切片,更清晰),只在看不清或要确认位置时才回头对照整页。
const MAX_ATTACH = 64; // 纯安全保险丝:挡住畸形/恶意的超多附件请求,正常手写作答(整页+十几片)远达不到

export function handSliceNote(attachments) {
  if (!(attachments || []).some((a) => /-p\d+of\d+\./.test((a && a.name) || ""))) return "";   // handwriting-p1of3.png / draft-p1of3.png
  return "【关于手写/草稿图片附件·先看这条】第1张是整页手写的【完整图】,后面几张是【同一页从上到下切开的切片】。★两者【内容完全一样】,只是同一份作答的两种呈现(整页看得全、切片看得清),【不是两份答案,切片里也没有整页之外的新内容】。因此:①【默认只读一遍就够】——优先看切片(字迹更清晰),按从上到下的顺序接起来就是完整作答;整页不必再逐字重看一遍。②【不要把同一段内容识别两遍、不要重复计分】,更不要因为同一句话出现两次就以为考生写了两遍。③只有当【切片里某处看不清】,或需要【确认某段写在整页的什么位置、跟哪道题/哪一步对应】时,才回头看整页核对那一处——不必整体交叉比对。④相邻切片之间可能有【重叠】,重叠处是同一段内容,同样只算一次。";
}

export async function attachParts(attachments) {
  const out = [];
  // 【不按条数截断】以前写死只取前 4 条,手写长图的「整页+若干切片」会被无声截掉——
  // 而切片张数本就随手写拉多长而定、没有上限,任何固定条数都可能砍掉考生真写了的内容。
  // 这里改为【全部处理】;下面那道 MAX_ATTACH 只是防畸形/恶意请求的保险丝(正常作答远够不到),不是产品限制。
  for (const a of (attachments || []).slice(0, MAX_ATTACH)) {
    if (!a?.data || !a?.mime) continue;
    try {
      const buf = Buffer.from(a.data, "base64");
      const ext = /pdf/i.test(a.mime) ? "pdf" : /png/i.test(a.mime) ? "png" : /audio|mpeg/i.test(a.mime) ? "mp3" : /video/i.test(a.mime) ? "mp4" : "jpg";
      const up = await uploadMedia(buf, a.mime, ext);
      out.push({ fileData: { fileUri: up.fileUri, mimeType: up.mimeType } });
    } catch { if (a.data.length <= 8_000_000) out.push({ inlineData: { mimeType: a.mime, data: a.data } }); } // 上传失败且小 → inline 兜底
  }
  return out;
}

// 通过 File API 上传大文件(视频/音频),突破 20MB 内联上限;返回可在 parts 里引用的 fileData
export async function uploadMedia(buffer, mimeType, ext = "bin") {
  const ai = getClient();
  const tmp = path.join(os.tmpdir(), `up-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(tmp, buffer);
  try {
    let file = await ai.files.upload({ file: tmp, config: { mimeType } });
    let tries = 0;
    while (String(file.state) === "PROCESSING" && tries < 90) {
      await new Promise((r) => setTimeout(r, 2000));
      file = await ai.files.get({ name: file.name });
      tries++;
    }
    if (String(file.state) !== "ACTIVE") throw new AiError("upload_failed", "file not active: " + file.state);
    return { fileUri: file.uri, mimeType: file.mimeType || mimeType, name: file.name };
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}
export async function deleteMedia(name) { try { await getClient().files.delete({ name }); } catch {} }
