// Kill Your Exam 消息提醒 service worker
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Kill Your Exam";
  const options = { body: data.body || "", icon: "/illustrations/1.png", badge: "/illustrations/1.png", data: { url: data.url || "/inbox" } };
  event.waitUntil((async () => {
    // 用户正开着并看着 App 时,不弹系统通知(App 内会有提示);只有不在 App/切走时才弹。
    try {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const active = wins.some((c) => c.focused || c.visibilityState === "visible");
      if (active) { for (const c of wins) { try { c.postMessage({ type: "push", data }); } catch {} } return; }
    } catch {}
    await self.registration.showNotification(title, options);
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
