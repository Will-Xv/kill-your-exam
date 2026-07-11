import "./globals.css";
import AppShell from "@/components/AppShell";
import db from "@/lib/db";
import { AiErrorProvider } from "@/components/AiErrorDialog";
import { I18nProvider } from "@/components/I18n";

export const metadata = {
  title: "Kill Your Exam",
  description: "你的私人备考管家",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kill Your Exam" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" }
};

export const viewport = { themeColor: "#33241a" };
export const dynamic = "force-dynamic"; // 每次请求都读【已发布布局】,首帧就能出正确外壳

export default function RootLayout({ children }) {
  let initialLayout = null; // 服务端预读【已发布的全站默认布局】,首帧就知道该不该套外壳,避免刷新时闪一下
  try { const row = db.prepare("SELECT value FROM settings WHERE key='ui_default_layout'").get(); if (row && row.value) initialLayout = JSON.parse(row.value); } catch {}
  return (
    <html lang="zh-CN">
      <body>
        <I18nProvider>
        <AiErrorProvider>
          <AppShell initialLayout={initialLayout}>{children}</AppShell>
        </AiErrorProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
