// 【懒加载补救:只有 RAG 没命中时,才让模型自己挑资料去看】(2026-08,Will)
//
// 为什么不做成"全面工具循环":工具循环每一轮都把前面全部内容重发一遍,成本是累加的。
// 实测口径:单次调用(提示词+检索片段)≈3K token;换成 3 轮工具循环即使把工具压到最瘦也要 ≈9K,约 3 倍。
// 而且检索这一步本来就是【确定性代码在挑】、一个 token 都不花 —— 让模型再挑一遍纯属重复付费。
// (另:Gemini 的 responseSchema 与 function calling 不能同时用,出题这类要结构化输出的路径也走不了工具循环。)
//
// 但"模型自己挑"在【检索没命中】时确实更强:那时单次调用的模型只能干瞪眼、按提示词"凭知识回答",
// 容易瞎编 —— 这正是改成纯 RAG 之后最大的风险敞口。
// 所以做成【懒加载】:命中良好就原样返回(零额外开销,绝大多数请求走这条);只有命中差时,
// 才花一次很便宜的调用让模型从【索引目录】里挑要看的部分,再只读那几页。
import db, { familyScope, scopeSql } from "@/lib/db";
import { generateText } from "@/lib/gemini";
import { readBigPdf } from "@/lib/pdfIndex";

const WEAK_MAX_HITS = 2;      // 命中不足这么多条就算"弱"
const WEAK_TOP_SCORE = 0.5;   // 或者最高分低于这个也算"弱"
// ★不设"最多挑几条/最多读几份"的人为上限(Will):万一这个主题确实横跨好几份资料呢。
//   天然边界有两道:①目录本身最多 80 条;②【按资料去重】——模型挑中同一份 PDF 的多段时,
//   readBigPdf 本来就会跨段把相关页一起找出来,所以每份资料只读一次,不会因为多挑几段就多花钱。

export function hitsAreWeak(hits) {
  const h = hits || [];
  if (h.length >= WEAK_MAX_HITS) return false;
  return !(h[0] && h[0].score >= WEAK_TOP_SCORE);
}

// 返回一段可直接拼进提示词的补充资料文本;没有可补的就返回 ""。
export async function lazyLookup(examId, topic, hits, lang) {
  try {
    if (!hitsAreWeak(hits)) return "";                    // ★命中够好:直接返回,不花一分钱
    const rows = db.prepare(`SELECT c.id, c.heading_path, substr(c.content,1,140) snip, c.material_id,
        m.filename, m.kind FROM chunks c JOIN materials m ON m.id=c.material_id
        WHERE c.exam_id IN ${scopeSql(familyScope(examId))} AND m.status='ready'
        ORDER BY c.material_id, c.id LIMIT 80`).all();
    if (!rows.length) return "";                          // 没有任何索引,补不了(会如实走"无资料"分支)
    const list = rows.map((r, i) => `${i + 1}. 《${r.filename}》${r.heading_path ? `[${r.heading_path}]` : ""} ${String(r.snip || "").replace(/\s+/g, " ")}`).join("\n");
    // 一次很便宜的纯文本调用:让模型自己从目录里挑
    const pick = await generateText(
      `下面是一名考生资料库的【索引目录】(每条=某份资料的某一段/某几页的要点)。\n` +
      `他现在要处理的主题是:「${String(topic || "").slice(0, 200)}」。\n` +
      `请判断【哪些条真正包含这个主题的内容】,只回复编号、用逗号隔开 —— 【该挑几条就挑几条,不设上限】,\n` +
      `确实相关的都列出来,但也【不要为了凑数把不相关的算进去】;\n` +
      `如果看下来没有一条跟这个主题相关,就只回复 none。不要解释、不要输出别的字。\n\n${list}`,
      { timeoutMs: 60000 });
    const idx = String(pick || "").match(/\d+/g) || [];
    if (!idx.length || /none/i.test(String(pick || ""))) return "";
    const chosen = [...new Set(idx.map((x) => rows[Number(x) - 1]).filter(Boolean))];
    if (!chosen.length) return "";
    const out = [];
    const readDone = new Set();   // 按【资料】去重:同一份 PDF 只真读一次(readBigPdf 会跨段找齐相关页)
    for (const c of chosen) {
      // PDF 且索引里记了页段 → 真去抽那几页读(细节全、又只读几页);其它 → 直接用索引里的要点
      if (c.kind === "pdf" && /^p:\d+-\d+$/.test(String(c.heading_path || ""))) {
        if (readDone.has(c.material_id)) continue;          // 这份已经读过,跳过(不是截断,是去重)
        const mat = db.prepare("SELECT id, filename, kind FROM materials WHERE id=?").get(c.material_id);
        if (mat) {
          readDone.add(c.material_id);
          const r = await readBigPdf(mat, examId, topic, lang);
          if (r && r.ok) { out.push(`《${mat.filename}》第 ${(r.pages || []).join("、")} 页:\n${r.content}`); continue; }
        }
      }
      const full = db.prepare("SELECT content FROM chunks WHERE id=?").get(c.id);
      if (full && full.content) out.push(`《${c.filename}》${c.heading_path ? `[${c.heading_path}]` : ""}:\n${String(full.content).slice(0, 2000)}`);
    }
    if (!out.length) return "";
    return `\n【补充资料·检索没直接命中,由 AI 从资料索引里挑出并调取】\n${out.join("\n---\n")}\n`;
  } catch { return ""; }   // 补救失败绝不能拖垮主流程
}
