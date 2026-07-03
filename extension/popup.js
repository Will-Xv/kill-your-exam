const $ = (id) => document.getElementById(id);
const setStatus = (msg, cls = "muted") => { const s = $("status"); s.textContent = msg; s.className = cls; };

// 记住配置
chrome.storage.local.get(["base", "token"], (d) => {
  $("base").value = d.base || "https://beikao-app-production.up.railway.app";
  $("token").value = d.token || "";
});
function save() { chrome.storage.local.set({ base: $("base").value.trim().replace(/\/$/, ""), token: $("token").value.trim() }); }
$("base").addEventListener("change", save);
$("token").addEventListener("change", save);

// 在页面上下文提取正文
function extractContent() {
  const bad = ["nav", "header", "footer", "script", "style", "aside", "noscript", "iframe"];
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(bad.join(",")).forEach((e) => e.remove());
  const main = document.querySelector("main,article,[role=main],.content,#content") || clone;
  const text = (main.innerText || clone.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
  return { title: document.title, url: location.href, text };
}
// 找“下一页”链接的 href
function findNext() {
  const cands = [...document.querySelectorAll("a")];
  const re = /下一[页章节]|下一篇|next|›|»|>|suivant|siguiente|далее|التالي|berikutnya/i;
  for (const a of cands) {
    if (!a.href || a.href === location.href) continue;
    const label = (a.textContent + " " + (a.getAttribute("aria-label") || "") + " " + (a.rel || "")).trim();
    if (re.test(label)) return a.href;
  }
  const relNext = document.querySelector('a[rel=next],link[rel=next]');
  return relNext?.href || null;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function runInPage(tabId, func) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func });
  return res.result;
}
async function send(payload) {
  const base = $("base").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  if (!base || !token) throw new Error("请先填写网站地址和采集令牌");
  const r = await fetch(base + "/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ingest-Token": token },
    body: JSON.stringify(payload)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.friendly || d.error || ("HTTP " + r.status));
  return d;
}

$("grab").addEventListener("click", async () => {
  save();
  try {
    setStatus("采集中…", "muted");
    const tab = await getActiveTab();
    const content = await runInPage(tab.id, extractContent);
    const d = await send(content);
    setStatus(`✓ 已采集到「${d.exam}」(${d.chunks} 段)\n${content.title}`, "ok");
  } catch (e) { setStatus("✗ " + e.message, "err"); }
});

$("auto").addEventListener("click", async () => {
  save();
  const max = parseInt(prompt("最多自动采集多少页?(建议 ≤ 30)", "10") || "0", 10);
  if (!max || max < 1) return;
  try {
    const tab = await getActiveTab();
    let count = 0;
    for (let i = 0; i < max; i++) {
      const content = await runInPage(tab.id, extractContent);
      const d = await send(content);
      count++;
      setStatus(`✓ 第 ${count} 页已采集(${d.chunks} 段)\n${content.title}\n正在找下一页…`, "ok");
      const next = await runInPage(tab.id, findNext);
      if (!next) { setStatus(`完成:共采集 ${count} 页。没有找到下一页。`, "ok"); break; }
      await chrome.tabs.update(tab.id, { url: next });
      await new Promise((res) => {
        const listener = (id, info) => { if (id === tab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(listener); setTimeout(res, 1200); } };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }
    if (count === max) setStatus(`完成:已达上限 ${max} 页。`, "ok");
  } catch (e) { setStatus("✗ " + e.message, "err"); }
});
