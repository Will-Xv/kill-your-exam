import { GoogleGenAI } from "@google/genai";
import { getSetting } from "./db";
import { AiError, classifyError } from "./errors";

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
  const contents = opts.contents || [{ role: "user", parts: [{ text: prompt }] }];
  return withRetry(async () => {
    const res = await ai.models.generateContent({ model: opts.model || getModelName(), contents, config });
    return res;
  });
}

export async function generateText(prompt, opts = {}) {
  const res = await generate(prompt, opts);
  return res.text || "";
}

export async function generateJson(prompt, jsonSchema, opts = {}) {
  for (let i = 0; i < 2; i++) {
    const res = await generate(prompt, { ...opts, jsonSchema });
    try {
      return JSON.parse(res.text);
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

export const LANG_NAMES = { zh: "中文", en: "English", fr: "français", es: "español", ru: "русский язык", ar: "العربية", id: "Bahasa Indonesia" };
export function langInstruction(lang) {
  const name = LANG_NAMES[lang] || "中文";
  return `\n\n[输出语言要求 / Output language requirement]: 你的全部输出必须使用 ${name}。All of your output must be written in ${name}.`;
}
