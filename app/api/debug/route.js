import { generate } from "@/lib/gemini";
import { getSessionUser } from "@/lib/auth";

const fns = [
  { name: "read_document", description: "读取文档", parameters: { type: "object", properties: { type: { type: "string", enum: ["dossier","strategy","progress"] } }, required: ["type"] } },
  { name: "get_progress_stats", description: "获取进度统计" },
  { name: "build_knowledge_tree", description: "生成知识点树" }
];

export async function GET() {
  const u = await getSessionUser();
  if (!u || !u.is_admin) return Response.json({ error: "admin only" }, { status: 403 });
  const out = {};
  // 1) 纯文本(无工具)
  try { const r = await generate("说\"ok\"", {}); out.plain = r.text?.slice(0, 40); }
  catch (e) { out.plain_err = String(e?.message || e).slice(0, 300); }
  // 2) 带工具
  try { const r = await generate("你好", { system: "你是助手", tools: [{ functionDeclarations: fns }] }); out.tools = (r.text || "(functionCall)").slice(0, 40); }
  catch (e) { out.tools_err = String(e?.message || e).slice(0, 600); }
  return Response.json(out);
}
