import "./globals.css";
import Nav from "@/components/Nav";
import FeedbackButton from "@/components/FeedbackButton";
import { AiErrorProvider } from "@/components/AiErrorDialog";
import { I18nProvider } from "@/components/I18n";

export const metadata = {
  title: "ExamPrep AI",
  description: "你的私人备考管家",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ExamPrep" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" }
};

export const viewport = { themeColor: "#059669" };

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <I18nProvider>
        <AiErrorProvider>
          <div className="app-bg" />
          <div className="relative z-10 mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-20">{children}</div>
          <Nav />
          <FeedbackButton />
        </AiErrorProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
