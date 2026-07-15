import { requireUser, unauthorized } from "@/lib/auth";
import { getActiveRecipe, currentPhase, recipeVersions, revertRecipe, activeRulesSummary } from "@/lib/recipes";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ recipe: null });
  const rc = getActiveRecipe(user.id, exam.id);
  let cur = null, phases = [];
  if (rc) {
    try { const c = currentPhase(rc, exam.id); cur = c ? { name: c.phase.name, index: c.index, total: c.total } : null; } catch {}
    phases = (rc.spec?.phases || []).map((p, i) => ({ i, name: p.name, selector: p.selector?.type, method: p.method?.type, count: p.method?.count ?? null, exit: p.exit?.type, level: p.exit?.level }));
  }
  const { versions } = recipeVersions(user.id, exam.id);
  const rules = activeRulesSummary(user.id, exam.id);
  return Response.json({
    recipe: rc ? { name: rc.name, scope: rc.scope, version: rc.version, goal: rc.spec?.goal || "", phases, current: cur } : null,
    versions: (versions || []).map((v) => ({ version: v.version, note: v.note, at: v.created_at })),
    rules: { recipes: rules.recipes, modes: rules.modes, governing: rules.governing ? { name: rules.governing.name, scope: rules.governing.scope } : null },
  });
}

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ ok: false }, { status: 400 });
  let body = {}; try { body = await req.json(); } catch {}
  if (body.action === "revert") {
    const r = revertRecipe(user.id, exam.id);
    return Response.json(r);
  }
  return Response.json({ ok: false, reason: "unknown_action" }, { status: 400 });
}
