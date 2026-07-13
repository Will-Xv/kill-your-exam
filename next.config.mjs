/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "pdf-to-img", "@napi-rs/canvas"],
  output: "standalone",
  experimental: {
    // 默认只有 10MB:超过的上传(表演录像、资料、Bug 录音等)会被截断,导致 req.formData() 解析失败 → 空 body 500。
    // 抬高到 200MB(路由本身已限制 ≤300~500MB)。
    middlewareClientMaxBodySize: "200mb",
  },
};
export default nextConfig;
