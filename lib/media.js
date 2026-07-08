import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export function hasFfmpeg() {
  try { return spawnSync("ffmpeg", ["-version"]).status === 0; } catch { return false; }
}
function tmpDir() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "perf-")); return d; }

// 从录像抽帧:fps 帧/秒、缩放到 height(默认720),返回 [{ t, jpeg }]
export function extractFrames(inputPath, { fps = 5, height = 720, maxFrames = 200 } = {}) {
  const dir = tmpDir();
  try {
    const r = spawnSync("ffmpeg", ["-nostdin", "-i", inputPath, "-vf", `fps=${fps},scale=-2:${height}`, "-q:v", "5", "-y", path.join(dir, "f_%05d.jpg")], { timeout: 120000, maxBuffer: 1 << 28 });
    if (r.status !== 0) return [];
    let files = fs.readdirSync(dir).filter((n) => n.endsWith(".jpg")).sort();
    // 太多则均匀抽样,控制体积/数量
    if (files.length > maxFrames) { const step = files.length / maxFrames; files = Array.from({ length: maxFrames }, (_, i) => files[Math.floor(i * step)]); }
    return files.map((n) => {
      const idx = parseInt(n.match(/(\d+)/)[1], 10); // 1-based
      return { t: +((idx - 1) / fps).toFixed(2), jpeg: fs.readFileSync(path.join(dir, n)) };
    });
  } catch { return []; }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// 从录像里提取音轨(单声道 aac/m4a),返回 Buffer 或 null
export function transcodeToMp3(inputBuffer) {
  const dir = tmpDir(); const inp = path.join(dir, "in"); const out = path.join(dir, "a.mp3");
  try {
    fs.writeFileSync(inp, inputBuffer);
    const r = spawnSync("ffmpeg", ["-nostdin", "-i", inp, "-vn", "-ac", "1", "-ar", "24000", "-b:a", "96k", "-y", out], { timeout: 120000, maxBuffer: 1 << 28 });
    if (r.status !== 0 || !fs.existsSync(out)) return null;
    return fs.readFileSync(out);
  } catch { return null; }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

export function extractAudio(inputPath) {
  const dir = tmpDir(); const out = path.join(dir, "a.m4a");
  try {
    const r = spawnSync("ffmpeg", ["-nostdin", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", "-y", out], { timeout: 60000 });
    if (r.status !== 0 || !fs.existsSync(out)) return null;
    return fs.readFileSync(out);
  } catch { return null; }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// 用能量起始点粗测节拍:返回 { bpm, beats:[秒...] }
export function detectBeats(inputBuffer) {
  const dir = tmpDir(); const inp = path.join(dir, "m");
  try {
    fs.writeFileSync(inp, inputBuffer);
    const r = spawnSync("ffmpeg", ["-nostdin", "-i", inp, "-ac", "1", "-ar", "22050", "-f", "f32le", "-"], { timeout: 60000, maxBuffer: 1 << 28 });
    if (r.status !== 0 || !r.stdout || !r.stdout.length) return null;
    const buf = r.stdout, sr = 22050, n = Math.floor(buf.length / 4);
    const win = 1024, hop = 512, frames = Math.floor((n - win) / hop);
    if (frames < 8) return null;
    const energy = new Float32Array(frames);
    for (let f = 0; f < frames; f++) { let e = 0; const base = f * hop; for (let i = 0; i < win; i++) { const v = buf.readFloatLE((base + i) * 4); e += v * v; } energy[f] = Math.sqrt(e / win); }
    // 移动平均 + 峰值起始
    const avgWin = 20; const onsets = [];
    for (let f = 1; f < frames - 1; f++) {
      let m = 0, c = 0; for (let k = Math.max(0, f - avgWin); k < Math.min(frames, f + avgWin); k++) { m += energy[k]; c++; } m /= c || 1;
      if (energy[f] > m * 1.4 && energy[f] >= energy[f - 1] && energy[f] > energy[f + 1]) onsets.push((f * hop) / sr);
    }
    if (onsets.length < 4) return null;
    // BPM:相邻起始间隔中位数
    const diffs = []; for (let i = 1; i < onsets.length; i++) { const d = onsets[i] - onsets[i - 1]; if (d > 0.2 && d < 2) diffs.push(d); }
    diffs.sort((a, b) => a - b); const med = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
    const bpm = med ? Math.round(60 / med) : null;
    return { bpm, beats: onsets.slice(0, 48).map((x) => +x.toFixed(2)) };
  } catch { return null; }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}
