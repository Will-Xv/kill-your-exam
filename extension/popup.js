const $ = (id) => document.getElementById(id);
const setS = (el, msg, cls = "muted") => { const s = $(el); s.textContent = msg; s.className = cls; };
const logA = (msg) => { const s = $("astatus"); s.textContent = (s.textContent + "\n" + msg).split("\n").slice(-40).join("\n"); s.className = "muted"; s.scrollTop = s.scrollHeight; };

chrome.storage.local.get(["base", "token"], (d) => {
  $("base").value = d.base || "https://killyourexam.up.railway.app";
  $("token").value = d.token || "";
});
const save = () => chrome.storage.local.set({ base: $("base").value.trim().replace(/\/$/, ""), token: $("token").value.trim() });
$("base").addEventListener("change", save);
$("token").addEventListener("change", save);

// Tabs
$("tabManual").addEventListener("click", () => { $("tabManual").classList.add("on"); $("tabAgent").classList.remove("on"); $("paneManual").classList.remove("hidden"); $("paneAgent").classList.add("hidden"); });
$("tabAgent").addEventListener("click", () => { $("tabAgent").classList.add("on"); $("tabManual").classList.remove("on"); $("paneAgent").classList.remove("hidden"); $("paneManual").classList.add("hidden"); });

// ---- page-context functions ----
function extractContent() {
  const bad = ["nav", "header", "footer", "script", "style", "aside", "noscript", "iframe"];
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(bad.join(",")).forEach((e) => e.remove());
  const main = document.querySelector("main,article,[role=main],.content,#content") || clone;
  const mediaUrls = [...new Set([
    ...[...document.querySelectorAll("audio,audio source,video,video source")].map((e) => e.currentSrc || e.src),
    ...[...document.querySelectorAll("img")].filter((i) => (i.naturalWidth || i.width || 0) >= 200).map((i) => i.currentSrc || i.src),
    ...[...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => /\.(mp3|wav|m4a|ogg|aac|flac|pdf)(\?|$)/i.test(h)),
  ])].filter((u) => /^https?:/i.test(u)).slice(0, 12);
  return { title: document.title, url: location.href, text: (main.innerText || clone.innerText || "").replace(/\n{3,}/g, "\n\n").trim(), mediaUrls };
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
function clickLinkByHref(href) {
  const a = [...document.querySelectorAll("a[href]")].find((x) => x.href === href);
  if (a) { a.click(); return true; }
  return false;
}
function scrollDown() { window.scrollBy(0, window.innerHeight * 0.9); return true; }

// ---- helpers ----
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }
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
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.friendly || d.error || ("HTTP " + r.status));
  return d;
}

// ---- MANUAL ----
$("grab").addEventListener("click", async () => {
  save();
  try {
    setS("status", "采集中…");
    const tab = await activeTab();
    const c = await inPage(tab.id, extractContent);
    const d = await ingest($("base").value.trim().replace(/\/$/, ""), $("token").value.trim(), c);
    setS("status", `✓ 已采集到「${d.exam}」(${d.chunks} 段)\n${c.title}`, "ok");
  } catch (e) { setS("status", "✗ " + e.message, "err"); }
});
$("auto").addEventListener("click", async () => {
  save();
  const max = parseInt(prompt("最多采集多少页?", "10") || "0", 10);
  if (!max) return;
  const base = $("base").value.trim().replace(/\/$/, ""), token = $("token").value.trim();
  try {
    const tab = await activeTab();
    for (let i = 0; i < max; i++) {
      const c = await inPage(tab.id, extractContent);
      const d = await ingest(base, token, c);
      setS("status", `✓ 第 ${i + 1} 页(${d.chunks} 段)`, "ok");
      const next = await inPage(tab.id, () => { const re = /下一[页章节]|next|›|»/i; const a = [...document.querySelectorAll("a[href]")].find((x) => re.test(x.textContent + (x.rel || ""))); return a?.href || null; });
      if (!next) { setS("status", `完成:共 ${i + 1} 页,没有下一页。`, "ok"); break; }
      await chrome.tabs.update(tab.id, { url: next });
      await waitLoad(tab.id);
    }
  } catch (e) { setS("status", "✗ " + e.message, "err"); }
});

// ---- AGENT ----
let stopFlag = false;
$("stop").addEventListener("click", () => { stopFlag = true; logA("⏹ 正在停止…"); });
$("run").addEventListener("click", async () => {
  save();
  const base = $("base").value.trim().replace(/\/$/, ""), token = $("token").value.trim();
  const goal = $("goal").value.trim();
  if (!goal) { logA("请先填写目标"); return; }
  if (!base || !token) { logA("请先填写网站地址和令牌"); return; }
  const maxSteps = parseInt($("maxsteps").value || "30", 10);
  stopFlag = false; $("run").classList.add("hidden"); $("stop").classList.remove("hidden");
  $("astatus").textContent = "🤖 开始…";
  const history = []; let collected = 0;
  try {
    for (let step = 0; step < maxSteps; step++) {
      if (stopFlag) { logA("已停止。"); break; }
      const tab = await activeTab();
      const content = await inPage(tab.id, extractContent);
      const links = await inPage(tab.id, collectLinks);
      const r = await fetch(base + "/api/agent/step", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Token": token },
        body: JSON.stringify({ goal, url: content.url, title: content.title, pageText: content.text, links, history, collected })
      });
      const dec = await r.json();
      if (!r.ok || dec.aiError) { logA("✗ " + (dec.friendly || dec.error || "AI 出错")); break; }
      logA(`\n[${step + 1}] ${dec.thought || dec.action}`);
      if (dec.action === "done") { logA(`✓ 完成:${dec.reason_done || ""}(共采集 ${collected} 页)`); break; }
      if (dec.action === "collect") {
        try { const d = await ingest(base, token, content); collected++; history.push(`collect: ${content.title}`); logA(`  ✓ 采集(${d.chunks} 段),累计 ${collected} 页`); }
        catch (e) { logA("  ✗ 采集失败:" + e.message); history.push("collect failed"); }
      } else if (dec.action === "scroll") {
        await inPage(tab.id, scrollDown); await new Promise((res) => setTimeout(res, 1000)); history.push("scroll");
      } else if (dec.action === "click") {
        const link = links[dec.index];
        if (!link) { logA("  链接序号无效,结束。"); break; }
        logA(`  → 点击:${link.text}`);
        history.push(`click: ${link.text}`);
        const ok = await inPage(tab.id, clickLinkByHref, [link.href]);
        if (!ok) await chrome.tabs.update(tab.id, { url: link.href });
        await waitLoad(tab.id);
      } else { logA("  未知动作,结束。"); break; }
    }
  } catch (e) { logA("✗ " + e.message); }
  $("run").classList.remove("hidden"); $("stop").classList.add("hidden");
});
