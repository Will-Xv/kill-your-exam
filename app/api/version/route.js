// 返回当前部署版本号(每次部署都变)。前端据此发现"我这标签页是旧版",在下次跳转时走整页加载,避免拿到失效的旧代码块(ChunkLoadError)。
export const dynamic = "force-dynamic";
export async function GET() {
  const v = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || process.env.BUILD_ID || "dev";
  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
