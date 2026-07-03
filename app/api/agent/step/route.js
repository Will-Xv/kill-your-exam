import db from "@/lib/db";
import { generate } from "@/lib/gemini";
import { AiError } from "@/lib/errors";

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Ingest-Token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

const actionSchema = {
  type: "object",
  properties: {
    thought: { type: "string", description: "简短说明你要做什么和为什么(给用户看)" },
    action: { type: "string", enum: ["collect", "click", "scroll", "done"] },
    index: { type: "integer", description: "click 时:要点击的链接在 links 列表中的序号" },
    reason_done: { type: "string", description: "action=done 时:为什么结束" }
  },
  required: ["thought", "action"]
};

// 决策一步。扩展把页面状态发来,返回下一步动作。真正的点击/采集由扩展在用户浏览器里执行。
export async function POST(req) {
  const token = req.headers.get("X-Ingest-Token") || "";
  const row = db.prepare("SELECT user_id FROM ingest_tokens WHERE token=?").get(token);
  if (!row) return Response.json({ error: "invalid token" }, { status: 401, headers: cors() });

  const { goal, url, title, pageText, links, history, collected } = await req.json();
  const linkList = (links || []).slice(0, 60).map((l, i) => `[${i}] ${l.text?.slice(0, 60) || ""} ${l.href ? "→ " + l.href.slice(0, 80) : ""}`).join("\n");
  const hist = (history || []).slice(-12).join("\n");

  const system = `你是一个在用户浏览器里运行的采集 agent,帮用户把学习资料网站上的内容采集进备考资料库。用户已经自己登录好了网站。
你能用的动作只有四种:
- collect:把当前页面正文采集进资料库(看到有价值的学习内容就采)
- click:点击 links 列表里的某个链接(用 index 指定),用于翻页/进入下一章节/展开目录。只点导航/翻页/章节类链接。
- scroll:向下滚动加载更多内容
- done:任务完成时结束

严格安全规则(违反会造成用户损失,绝对遵守):
- 绝不点击含"提交/submit/购买/buy/pay/支付/删除/delete/退出/logout/注销/确认订单/结算"等字样的链接或按钮。
- 绝不点击会改变账户状态、花钱、发帖、发消息的链接。
- 只在明显是"下一页/下一章/next/目录项/章节标题"这类导航链接上使用 click。
- 拿不准某个链接是否安全时,不要点,优先 collect 当前内容或 done 结束。
- 若已经采集了足够内容、或找不到安全的下一步、或达到目标,就 done。`;

  const prompt = `任务目标:${goal}
当前页面:${title || ""}
URL:${url || ""}
已采集页数:${collected || 0}

【本页可点击的链接】
${linkList || "(无)"}

【本页正文摘要】
${(pageText || "").slice(0, 2500)}

【历史动作】
${hist || "(开始)"}

请决定下一步动作。`;

  try {
    const res = await generate(prompt, { system, jsonSchema: actionSchema, temperature: 0.2 });
    let decision;
    try { decision = JSON.parse(res.text); } catch { throw new AiError("bad_response", "agent decision not JSON"); }
    return Response.json(decision, { headers: cors() });
  } catch (e) {
    const err = e?.isAiError ? e : new AiError("unknown", String(e?.message || e));
    return Response.json({ aiError: true, type: err.type, friendly: err.message }, { status: 502, headers: cors() });
  }
}
