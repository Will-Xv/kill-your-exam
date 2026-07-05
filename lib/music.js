// 给"给定音乐"的表演题(舞蹈/形体等)联网找一首免版权/公共版权的完整器乐曲,
// 下载存为该考试的音频素材,录制时自动外放、评分时用它对齐节拍。
// 数据源:Internet Archive(archive.org)——无需 API key,含大量公共版权/CC 音频。
import db from "@/lib/db";
import { saveMat } from "@/lib/files";

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
    const ex = db.prepare("SELECT id FROM materials WHERE exam_id=? AND kind='audio' AND status='ready' AND filename=? ORDER BY id DESC LIMIT 1").get(examId, tag);
    if (ex?.id) return ex.id;
  } catch {}
  let found;
  try { found = await searchArchive(styleQuery(styleText)); } catch { found = null; }
  if (!found) { try { found = await searchArchive("instrumental music"); } catch { found = null; } }
  if (!found) return null;
  try {
    const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status,mime,stored,source_url) VALUES(?,?,?,?,?,0,?)")
      .run(examId, tag, "audio", "processing", "audio/mpeg", found.url);
    const id = ins.lastInsertRowid;
    saveMat(id, found.buffer);
    db.prepare("UPDATE materials SET status='ready', stored=1 WHERE id=?").run(id);
    return id;
  } catch { return null; }
}
