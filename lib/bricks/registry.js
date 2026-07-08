// 砖头(bricks)注册表 —— 与现有功能完全隔离的可组合小工具。
// 每块砖:{ name, category, title, description, write(是否写操作), inputs[], run(args, ctx) }
// ctx = { user, db }。砖头默认「未发布」:开发者账号可随时调用测试;普通用户只能用已发布的砖头。
const REGISTRY = new Map();

export function registerBrick(b) {
  if (!b || !b.name) throw new Error("brick needs a name");
  REGISTRY.set(b.name, b);
}
export function getBrick(name) { return REGISTRY.get(name); }
export function listBricks() {
  return [...REGISTRY.values()].map((b) => ({
    name: b.name, category: b.category || "misc", title: b.title || b.name,
    description: b.description || "", write: !!b.write, inputs: b.inputs || [],
  }));
}
export async function runBrick(name, args, ctx) {
  const b = REGISTRY.get(name);
  if (!b) throw new Error("no such brick: " + name);
  return await b.run(args || {}, ctx || {});
}
