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
  else { h["Authorization"] = "Bearer " + cfg.key; h["X-Auth-Token"] = cfg.key; } // 官方云(Bearer)+ 自建(X-Auth-Token)都带上,各取所需、互不干扰
  return h;
}

function finalize(d, expected) {
  const sid = d.status && d.status.id;                      // 3=Accepted, 4=Wrong Answer, 5=TLE, 6=Compile err...
  const passed = expected != null ? sid === 3 : (sid === 3 || sid === 4);
  return { ok: true, status: d.status && d.status.description, statusId: sid, stdout: d.stdout || "", stderr: d.stderr || "", compile_output: d.compile_output || "", time: d.time, passed };
}

// 跑一次:返回 {ok, status, stdout, stderr, compile_output, time, passed}
export async function runOnce({ source, language, languageId: lid, stdin = "", expected = null, cpuLimit = 5 }) {
  const cfg = judge0Config();
  if (!cfg.configured) return { ok: false, notConfigured: true };
  const id = lid || languageId(language);
  if (!id) return { ok: false, error: "unsupported_language" };
  const body = { source_code: source, language_id: id, stdin: stdin || "", cpu_time_limit: cpuLimit };
  if (expected != null) body.expected_output = String(expected);
  // 创建提交(不依赖 wait=true,很多托管实例禁用了它)→ 拿 token → 轮询结果。
  const create = await fetch(`${cfg.url}/submissions?base64_encoded=false&wait=false`, { method: "POST", headers: headers(cfg), body: JSON.stringify(body) });
  if (!create.ok) return { ok: false, error: `judge0_http_${create.status}`, detail: (await create.text().catch(() => "")).slice(0, 300) };
  const cj = await create.json().catch(() => ({}));
  if (cj && cj.status && cj.status.id > 2) return finalize(cj, expected); // 实例支持 wait,直接给了结果
  const token = cj && cj.token;
  if (!token) return { ok: false, error: "no_token", detail: JSON.stringify(cj).slice(0, 200) };
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 650));
    const res = await fetch(`${cfg.url}/submissions/${token}?base64_encoded=false&fields=stdout,stderr,compile_output,status,time`, { headers: headers(cfg) });
    if (!res.ok) return { ok: false, error: `judge0_http_${res.status}` };
    const d = await res.json().catch(() => ({}));
    if (d && d.status && d.status.id > 2) return finalize(d, expected); // 3+ = 判完
  }
  return { ok: false, error: "timeout" };
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
