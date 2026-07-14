// 砖头(类9.1):让杀手把多份资料合并成学习地图。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { buildStudyMap } from "@/lib/studyMap";

registerBrick({
  name: "study_map", category: "materials", title: "把多份资料合并成学习地图", write: false,
  description: "把当前考试上传的多份资料整理成一张学习地图:哪些资料讲同一主题、哪些高度重复(留一份就够)、哪些互相补充、哪些章节还缺资料、建议的学习顺序。用户说「我传了好几份资料,帮我理一理/合并一下/哪些重复」时用。至少要2份资料。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = await buildStudyMap(ctx.user, exam);
    if (!r.map) return { ok: false, reason: r.reason, count: r.count };
    const m = r.map;
    return { ok: true, summary: m.summary, groups: (m.groups || []).map((g) => ({ topic: g.topic, materials: g.materials })), redundant: m.redundant, complementary: m.complementary, gaps: m.gaps, order: (m.order || []).map((o) => o.material) };
  },
});
