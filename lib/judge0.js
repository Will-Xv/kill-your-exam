// 托管 Judge0 代码执行判分。密钥/地址在设置里配置(judge0_url / judge0_key),不写死。
import { getSetting } from "@/lib/db";

// 常用语言 → Judge0 CE language_id(稳定)。
export const JUDGE0_LANGS = { python: 71, python3: 71, javascript: 63, js: 63, node: 63, typescript: 74, c: 50, cpp: 54, "c++": 54, java: 62, go: 60, ruby: 72, rust: 73, php: 68, "c#": 51, csharp: 51, kotlin: 78, swift: 83, bash: 46, sql: 82 };
export function languageId(lang) { return JUDGE0_LANGS[String(lang || "").toLowerCase().trim()] || null; }

export function judge0Config() {
  const url = getSetting("judge0_url", process.env.JUDGE0_URL || "");
  const key = getSetting("judge0_key", process.env.JUDGE0_KEY || "");
  return { url: url.replace(/\/+$/, ""), key, configured: !!url };
}

function headers(cfg) {
  const h = { "Content-Type": "application/json" };
  if (!cfg.key) return h;
  if (/rapidapi/i.test(cfg.url)) { h["X-RapidAPI-Key"] = cfg.key; try { h["X-RapidAPI-Host"] = new URL(cfg.url).host; } catch {} }
  else h["X-Auth-Token"] = cfg.key;               // 自托管 Judge0 的鉴权头
  return h;
}

// 跑一次:返回 {ok, status, stdout, stderr, compile_output, time, passed}
export async function runOnce({ source, language, languageId: lid, stdin = "", expected = null, cpuLimit = 5 }) {
  const cfg = judge0Config();
  if (!cfg.configured) return { ok: false, notConfigured: true };
  const id = lid || languageId(language);
  if (!id) return { ok: false, error: "unsupported_language" };
  const body = { source_code: source, language_id: id, stdin: stdin || "", cpu_time_limit: cpuLimit };
  if (expected != null) body.expected_output = String(expected);
  const res = await fetch(`${cfg.url}/submissions?base64_encoded=false&wait=true`, { method: "POST", headers: headers(cfg), body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, error: `judge0_http_${res.status}`, detail: (await res.text().catch(() => "")).slice(0, 300) };
  const d = await res.json();
  const statusId = d.status && d.status.id;                 // 3=Accepted, 4=Wrong Answer, 6=Compile err, 5=TLE...
  const passed = expected != null ? statusId === 3 : (statusId === 3 || statusId === 4);
  return { ok: true, status: d.status && d.status.description, statusId, stdout: d.stdout || "", stderr: d.stderr || "", compile_output: d.compile_output || "", time: d.time, passed };
}

// 跑一组测试用例(stdin/expected),返回逐个结果 + 是否全过。
export async function runTests({ source, language, tests }) {
  const cfg = judge0Config();
  if (!cfg.configured) return { ok: false, notConfigured: true };
  const list = Array.isArray(tests) && tests.length ? tests : [{ stdin: "", expected: null }];
  const results = [];
  for (const tc of list.slice(0, 12)) {
    const r = await runOnce({ source, language, stdin: tc.stdin || "", expected: tc.expected != null ? tc.expected : null });
    results.push({ stdin: tc.stdin || "", expected: tc.expected ?? null, stdout: r.stdout || "", stderr: r.stderr || r.compile_output || "", passed: !!r.passed, status: r.status });
    if (r.notConfigured) return { ok: false, notConfigured: true };
  }
  const passedCount = results.filter((r) => r.passed).length;
  return { ok: true, results, passedCount, total: results.length, allPassed: passedCount === results.length };
}
