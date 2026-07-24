// 服务端翻译:把 API 返回给用户看的中文错误按 user.lang 翻好再发,前端无需改动即可显示对语言。
// 复用 translations 的字典(中文原文当 key)+ 繁体 opencc 兜底,与前端 t()/chatAgent tUser 同一套。
import { DICTS, ZH_TW, ZH_HK } from "@/lib/translations";
import { toTradTW, toTradHK } from "@/lib/s2t";

export function estr(lang, zh) {
  try {
    const l = lang || "zh";
    if (l === "zh") return zh;
    if (l === "zh-TW") return (ZH_TW && ZH_TW[zh]) || toTradTW(zh);
    if (l === "zh-HK") return (ZH_HK && ZH_HK[zh]) || toTradHK(zh);
    return (DICTS[l] && DICTS[l][zh]) || zh;   // 字典没命中就回落中文(和前端一致)
  } catch { return zh; }
}
