import "./globals.css";
import Nav from "@/components/Nav";
import { AiErrorProvider } from "@/components/AiErrorDialog";

export const metadata = {
  title: "AI 备考助手",
  description: "你的私人备考管家"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <AiErrorProvider>
          <div className="mx-auto max-w-3xl px-4 pb-24 pt-4 md:pb-8 md:pt-6">{children}</div>
          <Nav />
        </AiErrorProvider>
      </body>
    </html>
  );
}
