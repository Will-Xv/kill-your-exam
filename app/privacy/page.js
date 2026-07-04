export const metadata = { title: "Privacy Policy · Kill Your Exam" };

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10 text-slate-700">
      <h1 className="text-2xl font-bold">Privacy Policy · 隐私政策</h1>
      <p className="mt-1 text-sm text-slate-400">Kill Your Exam · Last updated 2026-07-04</p>

      <h2 className="mt-6 font-semibold">English</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Kill Your Exam is a personal exam-preparation tool. The optional browser extension
        ("Kill Your Exam · Collector") only reads the content of a web page when you explicitly
        click to collect it, or when you approve a collection task you created in your own account.
        The collected text is sent solely to the Kill Your Exam server address you configure, using
        your own access token, and is stored in your personal study library. We do not sell your data,
        we do not use it for advertising, and we do not share it with third parties. The extension does
        not track your browsing, and it does not read pages in the background without a task you started.
        Study materials, questions, and chat you create in the app are stored to power your own
        study experience and are not shared with other users. You can delete your data at any time from
        the app, or export it from Settings. AI features send the relevant text to Google's Gemini API
        to generate explanations and questions.
      </p>

      <h2 className="mt-6 font-semibold">中文</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Kill Your Exam 是一款个人备考工具。可选的浏览器扩展(「Kill Your Exam · 采集助手」)只有在你
        主动点击采集、或你同意自己在账号里创建的采集任务时,才会读取当前网页的内容。采集到的文本仅会
        发送到你自己配置的 Kill Your Exam 服务器地址、使用你自己的访问令牌,并保存在你的个人资料库中。
        我们不出售你的数据、不用于广告、不与第三方共享。扩展不会追踪你的浏览行为,也不会在你没有发起
        任务时后台读取网页。你在应用里创建的资料、题目和对话仅用于支撑你自己的备考体验,不会与其他用户
        共享。你可以随时在应用内删除数据,或在「设置」里导出。AI 功能会把相关文本发送到 Google Gemini
        接口以生成讲解和题目。
      </p>

      <h2 className="mt-6 font-semibold">Contact · 联系</h2>
      <p className="mt-2 text-sm leading-relaxed">Questions: xuy413682@gmail.com</p>
    </div>
  );
}
