import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { listBricks, getBrick, runBrick } from "@/lib/bricks/index";

export const maxDuration = 300;

const isPublished = (name) => !!db.prepare("SELECT published FROM brick_flags WHERE name=?").get(name)?.published;

// GET:砖头目录(开发者账号可见,含发布状态)。普通用户不需要目录。
export async function GET() {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  if (!user.is_developer) return forbidden();
  const bricks = listBricks().map((b) => ({ ...b, published: isPublished(b.name) }));
  return Response.json({ bricks });
}

// POST:run(调用砖头)/ publish / unpublish
export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const action = b.action || "run";

  if (action === "publish" || action === "unpublish") {
    if (!user.is_developer) return forbidden(); // 发布由开发者账号控制
    if (!getBrick(b.name)) return Response.json({ error: "no such brick" }, { status: 404 });
    db.prepare("INSERT INTO brick_flags(name,published,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(name) DO UPDATE SET published=excluded.published, updated_at=datetime('now')")
      .run(b.name, action === "publish" ? 1 : 0);
    return Response.json({ ok: true, name: b.name, published: action === "publish" });
  }

  if (action === "run") {
    const brick = getBrick(b.name);
    if (!brick) return Response.json({ error: "no such brick" }, { status: 404 });
    // 门槛:已发布的砖头人人可用;未发布的只有开发者账号能调用(测试)。
    if (!isPublished(b.name) && !user.is_developer) return forbidden();
    try {
      const result = await runBrick(b.name, b.args || {}, { user });
      return Response.json({ ok: true, result });
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
    }
  }
  return Response.json({ error: "bad action" }, { status: 400 });
}
