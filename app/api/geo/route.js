// 通过来访者 IP 判断是否在中国大陆(用于隐藏国内不可用的 Google 登录)。
// 查询从服务器(海外 Railway)发出,不受墙影响;结果按 IP 缓存 6 小时。
const cache = new Map(); // ip -> { cn, ts }
const TTL = 6 * 3600 * 1000;

function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "";
  return ip;
}

export async function GET(req) {
  // Cloudflare 等前置代理若已给出国家码,直接用
  const hdrCountry = req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || "";
  if (hdrCountry) return Response.json({ cn: hdrCountry.toUpperCase() === "CN" });

  const ip = clientIp(req);
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::1")) return Response.json({ cn: false });

  const hit = cache.get(ip);
  if (hit && Date.now() - hit.ts < TTL) return Response.json({ cn: hit.cn });

  let cn = false;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=countryCode`, { signal: ctl.signal });
    clearTimeout(to);
    if (r.ok) { const d = await r.json(); cn = (d.countryCode || "").toUpperCase() === "CN"; }
  } catch { cn = false; } // 查不到就按"非国内"处理(照常显示 Google)
  cache.set(ip, { cn, ts: Date.now() });
  return Response.json({ cn });
}
