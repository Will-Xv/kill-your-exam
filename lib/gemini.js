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
  if (opts.jsonSchema) {
    config.responseMimeType = "application/json";
    config.responseSchema = opts.jsonSchema;
  }
  if (opts.useSearch) config.tools = [{ googleSearch: {} }];
  if (opts.tools) config.tools = opts.tools;
  const model = opts.model || getModelName();
  // 关闭"思考"以大幅降低延迟(gemini-2.5-flash 默认会先思考再回答,拖慢每一次调用)。pro 类模型需要最小预算,不强关;个别调用可用 opts.thinkingBudget 覆盖。
  if (opts.thinkingBudget != null) config.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
  else if (/flash/i.test(model)) config.thinkingConfig = { thinkingBudget: 0 };
  const contents = opts.contents || [{ role: "user", parts: [{ text: prompt }] }];
  return withRetry(async () => {
    const res = await ai.models.generateContent({ model, contents, config });
    return res;
  });
}

export async function generateText(prompt, opts = {}) {
  const res = await generate(prompt, opts);
  return res.text || "";
}

// 模型偶尔把 LaTeX 命令写成单反斜杠;JSON 解析时 \r \t \b \f 会被当成控制字符,吃掉命令(如 \right -> 回车+ight、\text -> 制表符+ext)。
// 解析前:把"未被转义(前面不是反斜杠)、且后面紧跟字母"的这些反斜杠补成双反斜杠,保住 LaTeX。不动 \n,以免破坏正常换行。
function repairJsonLatex(t) {
  return typeof t === "string" ? t.replace(/(?<!\\)\\([bfrt])(?=[A-Za-z])/g, "\\\\$1") : t;
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
export async function readImage(fileBuffer, mime, instruction) {
  const res = await generate(null, {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mime, data: fileBuffer.toString("base64") } },
          { text: instruction }
        ]
      }
    ]
  });
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
export function attachParts(attachments) {
  const out = [];
  for (const a of (attachments || []).slice(0, 4)) {
    if (!a?.data || !a?.mime) continue;
    if (a.data.length > 8_000_000) continue; // ~6MB 原始
    out.push({ inlineData: { mimeType: a.mime, data: a.data } });
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
