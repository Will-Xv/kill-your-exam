import db from "@/lib/db";
import { generate } from "@/lib/gemini";
import { getSessionUser, getActiveExam } from "@/lib/auth";

const DOC_TYPES = ["dossier","strategy","progress"];
const fns = [
  { name: "read_document", description: "读取文档", parameters: { type: "object", properties: { type: { type: "string", enum: DOC_TYPES } }, required: ["type"] } },
  { name: "update_document", description: "覆盖文档", parameters: { type: "object", properties: { type: { type: "string", enum: DOC_TYPES }, content: { type: "string" } }, required: ["type","content"] } },
  { name: "query_knowledge_base", description: "检索", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "web_search", description: "联网", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_progress_stats", description: "进度统计" },
  { name: "web_search_and_ingest", description: "联网入库", parameters: { type: "object", properties: { query: { type: "string" }, title: { type: "string" } }, required: ["query","title"] } },
  { name: "build_knowledge_tree", description: "知识树" },
  { name: "generate_question_set", description: "出题", parameters: { type: "object", properties: { kpTitle: { type: "string" }, count: { type: "integer" } } } },
  { name: "list_knowledge_points", description: "列知识点" }
];

export async function GET() {
  const u = await getSessionUser();
  if (!u || !u.is_admin) return Response.json({ error: "admin only" }, { status: 403 });
  const exam = getActiveExam(u.id);
  const out = { examId: exam?.id };
  // A) 所有 9 个工具 + 空历史
  try { const r = await generate("你好", { system: "你是助手", tools: [{ functionDeclarations: fns }] }); out.allTools = (r.text || "(fc)").slice(0, 40); }
  catch (e) { out.allTools_err = String(e?.message || e).slice(0, 700); }
  // B) 复刻真实 chat:加载历史 contents
  if (exam) {
    const history = db.prepare("SELECT role, content FROM chat_messages WHERE exam_id=? AND role IN ('user','model') ORDER BY id DESC LIMIT 24").all(exam.id).reverse();
    out.historyRoles = history.map((m) => m.role).join(",");
    const contents = history.map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
    contents.push({ role: "user", parts: [{ text: "测试" }] });
    try { const r = await generate(null, { contents, system: "你是助手", tools: [{ functionDeclarations: fns }] }); out.withHistory = (r.text || "(fc)").slice(0, 40); }
    catch (e) { out.withHistory_err = String(e?.message || e).slice(0, 700); }
  }
  return Response.json(out);
}
