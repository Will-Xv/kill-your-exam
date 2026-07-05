// 通过来访 IP 判断国家码,并映射到本站支持的默认语言。查询从服务器发出,不受墙影响。
// 本站支持的语言:en zh fr es ru ar id;查不到/不在列表 -> en
const COUNTRY_LANG = {
  CN: "zh", TW: "zh-Hant", HK: "zh-Hant", MO: "zh-Hant",
  FR: "fr", MC: "fr",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es",
  RU: "ru", BY: "ru", KZ: "ru", KG: "ru",
  ID: "id",
  SA: "ar", EG: "ar", AE: "ar", DZ: "ar", IQ: "ar", MA: "ar", SD: "ar", SY: "ar", TN: "ar", JO: "ar", LY: "ar", LB: "ar", PS: "ar", OM: "ar", KW: "ar", QA: "ar", BH: "ar", YE: "ar", MR: "ar",
};

export function langForCountry(cc) { return COUNTRY_LANG[String(cc || "").toUpperCase()] || "en"; }

function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0].trim() || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "").trim();
}

// 返回大写国家码(如 "CN"),查不到返回 ""
export async function countryCode(req) {
  const hdr = req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || "";
  if (hdr) return hdr.toUpperCase();
  const ip = clientIp(req);
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::1")) return "";
  let cc = ""; // 不缓存:每次都实时查(用户切换网络/梯子后立刻生效)
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=countryCode`, { signal: ctl.signal });
    clearTimeout(to);
    if (r.ok) { const d = await r.json(); cc = (d.countryCode || "").toUpperCase(); }
  } catch { cc = ""; }
  return cc;
}

export async function langForReq(req) { return langForCountry(await countryCode(req)); }
