import db from "@/lib/db";
import { generate } from "@/lib/gemini";
import { getSessionUser } from "@/lib/auth";
import { getActiveExam } from "@/lib/db";

const DOC_TYPES = ["dossier","strategy","progress"];
const fns = [
  { name: "read_document", description: "读取文档", parameters: { type: "object", properties: { type: { type: "string", enum: DOC_TYPES } }, required: ["type"] } },
  { name: "query_knowledge_base", description: "检索", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_progress_stats", description: "进度统计" }
];
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT_" + ms + "ms")), ms)); }

export async function GET() {
  const u = await getSessionUser();
  if (!u || !u.is_admin) return Response.json({ error: "admin only" }, { status: 403 });
  const exam = getActiveExam(u.id);
  const out = { examId: exam?.id };
  if (exam) {
    const history = db.prepare("SELECT role, content FROM chat_messages WHERE exam_id=? AND role IN ('user','model') ORDER BY id DESC LIMIT 24").all(exam.id).reverse();
    out.count = history.length;
    out.roles = history.map((m) => m.role).join(",");
    out.lens = history.map((m) => (m.content || "").length).join(",");
    // 时间盒:带历史的单次 generate,20s 超时
    const contents = history.map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
    contents.push({ role: "user", parts: [{ text: "测试" }] });
    try {
      const t0 = Date.now();
      const r = await Promise.race([generate(null, { contents, system: "你是助手", tools: [{ functionDeclarations: fns }] }), timeout(20000)]);
      out.withHistory = { text: (r.text || "").slice(0, 60), calls: (r.functionCalls || []).map((c) => c.name + ":" + JSON.stringify(c.args)), ms: Date.now() - t0 };
      // 第二轮:模拟回传 functionResponse 后再 generate(检验 thinking 模型的 thoughtSignature 问题)
      if (r.functionCalls && r.functionCalls.length) {
        const c2 = [...contents, { role: "model", parts: r.functionCalls.map((fc) => ({ functionCall: fc })) }, { role: "user", parts: r.functionCalls.map((fc) => ({ functionResponse: { name: fc.name, response: { result: { ok: true } } } })) }];
        try { const r2 = await Promise.race([generate(null, { contents: c2, system: "你是助手", tools: [{ functionDeclarations: fns }] }), timeout(20000)]); out.round2 = { text: (r2.text || "").slice(0, 40), calls: (r2.functionCalls || []).map((c) => c.name), ms: Date.now() - t0 }; }
        catch (e) { out.round2_err = String(e?.message || e).slice(0, 500); }
      }
    } catch (e) { out.withHistory_err = String(e?.message || e).slice(0, 500); }
  }
  return Response.json(out);
}
