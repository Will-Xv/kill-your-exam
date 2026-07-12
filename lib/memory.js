// 事实级长期记忆(Episodic + Semantic):
// - 每条自我评估/偏好/目标/约束作为【独立、带时间戳、永不覆盖】的事实存下来(情景锚点=用户原话 quote)。
// - 冲突的说法【并存】(如第1天“数学弱”与第30天“数学已强”),不覆盖、可追溯。
// - 检索时按【新近 × 权重】给出“当前主导 + 历史”的分组摘要,冲突主题标出,供 AI 折中并回溯说明。
import db from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";

const HALFLIFE_DAYS = 45;                 // 新近衰减半衰期
const KIND_W = { constraint: 1.3, preference: 1.2, goal: 1.15, self_assessment: 1.0, fact: 0.9, observation: 0.7 };

function ageDays(ts) { try { return Math.max(0, (Date.now() - new Date((ts || "").replace(" ", "T") + "Z").getTime()) / 86400000); } catch { return 0; } }
function recencyWeight(f) { return (f.weight || 1) * Math.exp(-ageDays(f.created_at) / HALFLIFE_DAYS); }

// 写入一条事实:同一主题+同一立场(valence)的重复说法 => 刷新(加权、更新时间),不新增;
// 立场不同(冲突)或全新主题 => 新增一行,旧的保留不动(可追溯)。
export function addFact(userId, examId, fact) {
  const subject = String(fact.subject || "").trim().slice(0, 40);
  const claim = String(fact.claim || "").trim().slice(0, 300);
  if (!subject || !claim) return;
  const kind = fact.kind || "fact";
  const valence = (fact.valence || "").toString().trim().slice(0, 24) || null;
  const quote = (fact.quote || "").toString().trim().slice(0, 300) || null;
  const base = KIND_W[kind] || 1.0;
  const scope = fact.scope === "global" ? "global" : (fact.scope === "exam" ? "exam" : null); // 仅开发者账号会带 scope;其它账号=null(检索时按全局,行为不变)
  const same = valence
    ? db.prepare("SELECT id, weight FROM memory_facts WHERE user_id=? AND subject=? AND kind=? AND IFNULL(valence,'')=? ORDER BY id DESC LIMIT 1").get(userId, subject, kind, valence)
    : db.prepare("SELECT id, weight FROM memory_facts WHERE user_id=? AND subject=? AND kind=? AND claim=? ORDER BY id DESC LIMIT 1").get(userId, subject, kind, claim);
  if (same) {
    // 反复重申 => 提权 + 更新时间(仍是同一条事实,不制造重复)
    db.prepare("UPDATE memory_facts SET weight=MIN(?, weight+0.15), created_at=datetime('now'), claim=?, quote=COALESCE(?,quote), scope=COALESCE(?,scope) WHERE id=?")
      .run(base + 1.0, claim, quote, scope, same.id);
    return same.id;
  }
  const info = db.prepare("INSERT INTO memory_facts(user_id,exam_id,subject,kind,claim,valence,quote,weight,scope) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(userId, scope === "global" ? null : (examId || null), subject, kind, claim, valence, quote, base, scope);
  return info.lastInsertRowid;
}

// 后台从最近对话里抽取持久记忆事实(不阻塞聊天)。
export function extractMemoryBg(user, examId, convoText) {
  if (!convoText || convoText.length < 8) return;
  const isDev = !!(user && user.is_developer); // 仅开发者账号做 exam/global 分层;其它账号维持原样
  (async () => {
    try {
      const props = {
        subject: { type: "string", description: "简短主题词,如「数学」「难度偏好」「学习时间」" },
        kind: { type: "string", enum: ["self_assessment", "preference", "goal", "constraint", "fact"] },
        claim: { type: "string", description: "一句话陈述这条事实" },
        valence: { type: "string", description: "可选的立场标签:weak/strong/like/dislike/high/low/more/less 等,便于识别同主题的相反说法" },
        quote: { type: "string", description: "用户的原话片段(情景锚点)" }
      };
      if (isDev) props.scope = { type: "string", enum: ["exam", "global"], description: "exam=只跟当前这门考试有关;global=跨所有考试通用的个人特质" };
      const schema = { type: "object", properties: { facts: { type: "array", items: { type: "object", properties: props, required: ["subject", "kind", "claim"] } } }, required: ["facts"] };
      const prompt = `从下面这轮备考对话里,只抽取关于【这个人】值得【长期记住】的事实:自我评估(如某科强/弱)、偏好(难度/题型/风格/时间)、目标、硬性约束。
- 只抽明确、稳定、值得长期记住的;寒暄、一次性的具体问题、临时情绪不要抽。
- 同一主题若表达了某种立场,请在 valence 标出(如数学“弱”=weak、“强”=strong;难度“要难”=high、“要简单”=low),方便系统识别同主题前后相反的说法。
- 用 quote 保留用户原话片段。没有值得记的就返回空数组。${isDev ? "\n- 另外给每条标 scope:只跟【当前这门考试】有关的(如“这门课我某某弱”“这次想冲90”)= exam;跨【所有考试】通用的个人特质(学习风格、时间偏好、通用难度偏好、通用约束、目标观)= global。约束/偏好/目标多为 global,自评/本考试具体情况多为 exam;某知识弱点若在多门考试反复出现也可标 global。" : ""}
对话:
${convoText.slice(0, 4000)}` + langInstruction(user.lang);
      const out = await generateJson(prompt, schema, {});
      for (const f of (out.facts || [])) addFact(user.id, examId, f);
    } catch {}
  })();
}

// 出题用:把长期记忆(难度/自我评估/做题观察)+ 折中规则给出题模型,让难度贴合主人、冲突时折中。
export function difficultyHint(userId) {
  const digest = memoryDigest(userId);
  if (!digest) return "";
  return `\n【按主人的长期记忆定难度(冲突要折中)】\n${digest}\n据此定每题 difficulty(1~3):以“当前主导”的说法为主;新旧冲突时【折中】——例如“曾自认某科弱、现自称已强”,就以中档(2)为主、搭配少量偏难(3),别全是基础题也别全是难题。若“做题观察”与主人自述不一致,以做题数据为准。`;
}

// 生成“冲突感知”的记忆摘要,注入杀手上下文:按主题分组,当前主导在前、历史可追溯,冲突主题标注。
// 把一批事实(可能是本考试 / 全局 / 混合)整理成"冲突感知"摘要。
function buildDigest(rows) {
  if (!rows.length) return "";
  const bySubject = {};
  for (const r of rows) (bySubject[r.subject] ||= []).push(r);
  // 每个主题按新近权重排序,主题之间按“最新一条的权重”排序
  const subjects = Object.entries(bySubject).map(([subject, arr]) => {
    arr.sort((a, b) => recencyWeight(b) - recencyWeight(a));
    const valences = new Set(arr.map((f) => f.valence).filter(Boolean));
    const conflict = valences.size > 1 || arr.length > 1;
    return { subject, arr, top: recencyWeight(arr[0]), conflict };
  }).sort((a, b) => b.top - a.top).slice(0, 20);

  const fmtDate = (ts) => { const d = ageDays(ts); return d < 1 ? "今天" : d < 30 ? Math.round(d) + "天前" : Math.round(d / 30) + "个月前"; };
  const lvl = (w) => (w >= 1.1 ? "高" : w >= 0.6 ? "中" : "低");
  const lines = [];
  for (const s of subjects) {
    const cur = s.arr[0];
    let line = `• 「${s.subject}」当前(${fmtDate(cur.created_at)}·权重${lvl(recencyWeight(cur))}):${cur.claim}${cur.quote ? ` 〔原话:${cur.quote}〕` : ""}`;
    const older = s.arr.slice(1).filter((f) => f.valence !== cur.valence || f.claim !== cur.claim).slice(0, 2);
    for (const o of older) line += `\n    ↩ 历史(${fmtDate(o.created_at)}·权重${lvl(recencyWeight(o))}):${o.claim}`;
    if (s.conflict && older.length) line += `  ⚠冲突:新旧说法不一致,别简单否定任何一方。`;
    lines.push(line);
  }
  return lines.join("\n");
}

// 对外入口:开发者账号 + 指定考试 → 分【本考试记忆】+【全局记忆(你的全部杀技)】两层;其它情况维持原全局行为。
export function memoryDigest(user, examId, opts = {}) {
  const userId = (user && typeof user === "object") ? user.id : user;
  const isDev = (user && typeof user === "object") ? !!user.is_developer : false;
  if (!isDev || !examId) {
    const rows = db.prepare("SELECT * FROM memory_facts WHERE user_id=? AND active=1 ORDER BY created_at DESC LIMIT 300").all(userId);
    return buildDigest(rows);
  }
  const examRows = db.prepare("SELECT * FROM memory_facts WHERE user_id=? AND active=1 AND scope='exam' AND exam_id=? ORDER BY created_at DESC LIMIT 200").all(userId, examId);
  const globalRows = db.prepare("SELECT * FROM memory_facts WHERE user_id=? AND active=1 AND (scope='global' OR scope IS NULL) ORDER BY created_at DESC LIMIT 200").all(userId);
  const ex = buildDigest(examRows), gl = buildDigest(globalRows);
  const parts = [];
  if (ex) parts.push("〖本考试记忆〗\n" + ex);
  if (gl) parts.push("〖全局记忆 · 你的全部杀技〗\n" + gl);
  return parts.join("\n\n");
}
