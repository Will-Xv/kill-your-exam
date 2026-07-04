import "./globals.css";
import AppShell from "@/components/AppShell";
import { AiErrorProvider } from "@/components/AiErrorDialog";
import { I18nProvider } from "@/components/I18n";

export const metadata = {
  title: "Kill Your Exam",
  description: "你的私人备考管家",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kill Your Exam" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" }
};

export const viewport = { themeColor: "#7a5220" };

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <I18nProvider>
        <AiErrorProvider>
          <AppShell>{children}</AppShell>
        </AiErrorProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
