// 给"给定音乐"的表演题(舞蹈/形体等)联网找一首免版权/公共版权的完整器乐曲,
// 下载存为该考试的音频素材,录制时自动外放、评分时用它对齐节拍。
// 数据源:Internet Archive(archive.org)——无需 API key,含大量公共版权/CC 音频。
import db from "@/lib/db";
import { saveMat, readMat } from "@/lib/files";
import { generateJson } from "@/lib/gemini";

// 舞种/风格 -> 搜索关键词
function styleQuery(text = "") {
  const s = String(text);
  if (/(古典舞|古典|水袖|身韵)/.test(s)) return "guqin erhu chinese classical instrumental";
  if (/(民族舞|民间舞|中国舞|民族)/.test(s)) return "chinese folk traditional instrumental";
  if (/(现代舞|当代舞|现代|当代)/.test(s)) return "contemporary modern instrumental dance";
  if (/(武术|武打|拳|棍|剑)/.test(s)) return "chinese martial arts instrumental";
  if (/(戏曲|京剧|身段|戏|昆曲)/.test(s)) return "peking opera chinese traditional instrumental";
  if (/(芭蕾|ballet)/i.test(s)) return "ballet classical instrumental";
  return "instrumental music dance rhythm";
}

async function fetchJson(url, ms = 9000) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "kill-your-exam/1.0" } });
    if (!r.ok) return null; return await r.json();
  } catch { return null; } finally { clearTimeout(to); }
}

async function download(url, ms = 20000, maxBytes = 18 * 1024 * 1024) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "kill-your-exam/1.0" } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200 * 1024 || buf.length > maxBytes) return null; // 太小/太大都跳过
    return buf;
  } catch { return null; } finally { clearTimeout(to); }
}

// 在 archive.org 上搜一首 mp3,返回 {buffer,title,url}
async function searchArchive(query) {
  const q = encodeURIComponent(`(${query}) AND mediatype:audio AND (licenseurl:*creativecommons* OR collection:opensource_audio)`);
  const searchUrl = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&sort[]=downloads+desc&rows=8&page=1&output=json`;
  const j = await fetchJson(searchUrl);
  const docs = j?.response?.docs || [];
  for (const d of docs.slice(0, 5)) {
    const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`);
    const files = (meta?.files || []).filter((f) => /\.mp3$/i.test(f.name || ""));
    const cand = files.map((f) => ({ ...f, size: Number(f.size) || 0 }))
      .filter((f) => f.size > 1e6 && f.size < 18e6)
      .sort((a, b) => a.size - b.size)[0] || files[0];
    if (!cand) continue;
    const url = `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(cand.name)}`;
    const buffer = await download(url);
    if (buffer) return { buffer, title: (cand.title || d.title || cand.name || "配乐").toString().slice(0, 80), url };
  }
  return null;
}

// 主入口:为某考试的某风格找/复用一首配乐,返回素材 id(失败返回 null)
export async function findAndStoreMusic(examId, styleText) {
  const tag = `[配乐] ${styleQuery(styleText)}`;
  try {
    const ex = db.prepare("SELECT id, ai_style FROM materials WHERE exam_id=? AND kind='audio' AND status='ready' AND filename=? ORDER BY id DESC LIMIT 1").get(examId, tag);
    if (ex?.id) {
      if (!ex.ai_style) { try { const buf = readMat(ex.id); if (buf) { const st = await identifyStyle(buf); if (st) db.prepare("UPDATE materials SET ai_style=? WHERE id=?").run(st, ex.id); } } catch {} }
      return ex.id;
    }
  } catch {}
  let found;
  try { found = await searchArchive(styleQuery(styleText)); } catch { found = null; }
  if (!found) { try { found = await searchArchive("instrumental music"); } catch { found = null; } }
  if (!found) return null;
  try {
    const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status,mime,stored,source_url,auto) VALUES(?,?,?,?,?,0,?,1)")
      .run(examId, tag, "audio", "processing", "audio/mpeg", found.url);
    const id = ins.lastInsertRowid;
    saveMat(id, found.buffer);
    // 让 AI 真正"听"这首曲子,识别它的实际风格(曲库的关键词标签常常不准),供出题时对齐,避免"说是二胡放的却是电音"
    const style = await identifyStyle(found.buffer);
    db.prepare("UPDATE materials SET status='ready', stored=1, ai_style=? WHERE id=?").run(style || null, id);
    return id;
  } catch { return null; }
}

// 用 Gemini 多模态听音频,返回不超过 ~20 字的实际风格描述(乐器/速度/情绪)
async function identifyStyle(buffer) {
  try {
    const prompt = "听这段音乐,用不超过20个字客观描述它【实际听到】的风格:主奏乐器、速度(快/中/慢)、大致情绪。例如\"古筝独奏 中速 古典雅致\"或\"电子器乐 快节奏 现代\"。只描述实际听到的,不要臆测用途或乐种归属。";
    const out = await generateJson(prompt, { type: "object", properties: { style: { type: "string" } }, required: ["style"] },
      { contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "audio/mpeg", data: buffer.toString("base64") } }] }] });
    return (out.style || "").slice(0, 40);
  } catch { return ""; }
}

// 把"跟随所给音乐即兴"的题干/说明,改写得与配乐的【实际风格】一致(消除"说是A乐种、实际是B"的矛盾)
export async function alignStemToMusic(stem, instructions, style) {
  if (!style || !stem) return null;
  try {
    const out = await generateJson(
      `所给配乐经AI试听,实际风格是:「${style}」。下面是一道"跟随所给音乐即兴"的表演/形体题。如果题干或说明里声称的乐种/乐器/曲风与该实际风格不符(比如写了"戏曲打击乐/二胡古典"但实际并非),请据实改写:要么改成与实际风格一致,要么不指定乐种、只说"所给音乐"。保持它仍是"跟随所给音乐即兴"的形体/舞蹈类题,考核维度不变,不要新增具体曲名。\n题干:${stem}\n说明:${instructions || "(无)"}\n返回改写后的 stem 与 instructions。`,
      { type: "object", properties: { stem: { type: "string" }, instructions: { type: "string" } }, required: ["stem"] });
    return { stem: out.stem || stem, instructions: (out.instructions ?? instructions) || "" };
  } catch { return null; }
}


// ==== 听力素材:只抓【公有领域 / 开放许可】的真人语音(LibriVox 公有领域 + CC),合法可用 ====
async function searchArchivePD(query) {
  const q = encodeURIComponent(`(${query}) AND mediatype:audio AND (collection:librivoxaudio OR licenseurl:*creativecommons* OR licenseurl:*publicdomain*)`);
  const searchUrl = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&sort[]=downloads+desc&rows=8&page=1&output=json`;
  const j = await fetchJson(searchUrl);
  const docs = j?.response?.docs || [];
  for (const d of docs.slice(0, 5)) {
    const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`);
    const files = (meta?.files || []).filter((f) => /\.mp3$/i.test(f.name || ""));
    const cand = files.map((f) => ({ ...f, size: Number(f.size) || 0 })).filter((f) => f.size > 5e5 && f.size < 12e6).sort((a, b) => a.size - b.size)[0] || files[0];
    if (!cand) continue;
    const url = `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(cand.name)}`;
    const buffer = await download(url, 20000, 12 * 1024 * 1024);
    if (buffer) return { buffer, title: (cand.title || d.title || cand.name || "listening").toString().slice(0, 70), url };
  }
  return null;
}

// 给某考试找/复用一段公有领域听力音频,存成可播放的音频素材,返回素材 id(失败 null)
export async function findAndStoreListening(examId) {
  try { const ex = db.prepare("SELECT id FROM materials WHERE exam_id=? AND kind='audio' AND status='ready' AND filename LIKE '[听力素材]%' ORDER BY id DESC LIMIT 1").get(examId); if (ex?.id) return ex.id; } catch {}
  let found = null;
  for (const query of ["english short story reading", "english conversation dialogue", "spoken english lecture"]) {
    try { found = await searchArchivePD(query); } catch { found = null; }
    if (found) break;
  }
  if (!found) return null;
  try {
    const tag = ("[听力素材·公开授权] " + (found.title || "public-domain audio")).slice(0, 90);
    const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status,mime,stored,source_url,auto) VALUES(?,?,?,?,?,0,?,0)").run(examId, tag, "audio", "processing", "audio/mpeg", found.url);
    const id = ins.lastInsertRowid; saveMat(id, found.buffer);
    db.prepare("UPDATE materials SET status='ready', stored=1 WHERE id=?").run(id);
    return id;
  } catch { return null; }
}
