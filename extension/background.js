// 后台服务:轮询"备考助手"网站的浏览器采集任务,自动在当前登录的标签页里执行采集。
const POLL_ALARM = "beikao_poll";

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === POLL_ALARM) tick(); });

let running = false;
async function cfg() { return new Promise((res) => chrome.storage.local.get(["base", "token"], (d) => res({ base: (d.base || "").replace(/\/$/, ""), token: d.token || "" }))); }

async function tick() {
  if (running) return;
  const { base, token } = await cfg();
  if (!base || !token) return;
  let job;
  try {
    const r = await fetch(base + "/api/browser/poll", { method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Token": token } });
    const d = await r.json(); job = d.job;
  } catch { return; }
  if (!job) return;
  running = true;
  try { await runJob(base, token, job); }
  catch (e) { await update(base, token, job.id, { status: "failed", logLine: "✗ " + (e.message || e) }); }
  running = false;
}

async function update(base, token, jobId, patch) {
  try { await fetch(base + "/api/browser/update", { method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Token": token }, body: JSON.stringify({ jobId, ...patch }) }); } catch {}
}

function extractContent() {
  const bad = ["nav", "header", "footer", "script", "style", "aside", "noscript", "iframe"];
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(bad.join(",")).forEach((e) => e.remove());
  const main = document.querySelector("main,article,[role=main],.content,#content") || clone;
  return { title: document.title, url: location.href, text: (main.innerText || clone.innerText || "").replace(/\n{3,}/g, "\n\n").trim() };
}
function collectLinks() {
  const out = [];
  document.querySelectorAll("a[href]").forEach((a) => {
    const text = (a.textContent || "").trim().replace(/\s+/g, " ");
    if (!a.href || a.href.startsWith("javascript:") || (!text && !a.getAttribute("aria-label"))) return;
    out.push({ text: text || a.getAttribute("aria-label"), href: a.href });
  });
  return out.slice(0, 80);
}
function clickHref(href) { const a = [...document.querySelectorAll("a[href]")].find((x) => x.href === href); if (a) { a.click(); return true; } return false; }
function scrollDown() { window.scrollBy(0, window.innerHeight * 0.9); return true; }

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || (await chrome.tabs.query({ active: true }))[0];
}
async function inPage(tabId, func, args = []) { const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args }); return r.result; }
function waitLoad(tabId, ms = 1500) {
  return new Promise((res) => {
    const l = (id, info) => { if (id === tabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(l); setTimeout(res, ms); } };
    chrome.tabs.onUpdated.addListener(l);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); res(); }, 8000);
  });
}
async function ingest(base, token, payload) {
  const r = await fetch(base + "/api/ingest", { method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Token": token }, body: JSON.stringify(payload) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.friendly || d.error || ("HTTP " + r.status)); return d;
}

async function runJob(base, token, job) {
  const tab = await activeTab();
  if (!tab || !tab.id || /^chrome/.test(tab.url || "")) { await update(base, token, job.id, { status: "failed", logLine: "找不到可用的网页标签。请先在浏览器里打开并登录要采集的学习网站,再让 AI 执行。" }); return; }
  await update(base, token, job.id, { logLine: "▶ 开始:" + job.goal });
  const history = []; let collected = 0; const maxSteps = 30;
  for (let step = 0; step < maxSteps; step++) {
    const t = await activeTab();
    const content = await inPage(t.id, extractContent);
    const links = await inPage(t.id, collectLinks);
    let dec;
    try {
      const r = await fetch(base + "/api/agent/step", { method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Token": token },
        body: JSON.stringify({ goal: job.goal, url: content.url, title: content.title, pageText: content.text, links, history, collected }) });
      dec = await r.json();
      if (!r.ok || dec.aiError) { await update(base, token, job.id, { status: "failed", logLine: "✗ " + (dec.friendly || dec.error || "AI 出错") }); return; }
    } catch (e) { await update(base, token, job.id, { status: "failed", logLine: "✗ " + e.message }); return; }
    await update(base, token, job.id, { logLine: `[${step + 1}] ${dec.thought || dec.action}` });
    if (dec.action === "done") { await update(base, token, job.id, { status: "done", logLine: `✓ 完成:${dec.reason_done || ""}(共 ${collected} 页)` }); return; }
    if (dec.action === "collect") {
      try { const d = await ingest(base, token, content); collected++; history.push("collect: " + content.title); await update(base, token, job.id, { collected, logLine: `  ✓ 采集(${d.chunks} 段)` }); }
      catch (e) { history.push("collect failed"); await update(base, token, job.id, { logLine: "  ✗ 采集失败:" + e.message }); }
    } else if (dec.action === "scroll") { await inPage(t.id, scrollDown); await new Promise((r) => setTimeout(r, 1000)); history.push("scroll"); }
    else if (dec.action === "click") {
      const link = links[dec.index]; if (!link) { await update(base, token, job.id, { status: "done", logLine: "链接无效,结束" }); return; }
      history.push("click: " + link.text); await update(base, token, job.id, { logLine: "  → 点击:" + link.text });
      const ok = await inPage(t.id, clickHref, [link.href]); if (!ok) await chrome.tabs.update(t.id, { url: link.href }); await waitLoad(t.id);
    } else { await update(base, token, job.id, { status: "done", logLine: "结束" }); return; }
  }
  await update(base, token, job.id, { status: "done", logLine: `已达上限,共 ${collected} 页` });
}
