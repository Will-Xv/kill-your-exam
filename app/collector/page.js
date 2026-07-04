"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

export default function Collector() {
  const t = useT();
  const [token, setToken] = useState("");
  useEffect(() => { fetch("/api/ingest/token").then((r) => r.json()).then((d) => setToken(d.token || "")); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🧲 {t("浏览器采集扩展")}</h1>
      <p className="text-slate-500">{t("用 Chrome 扩展,把已登录的学习网站内容采集进资料库,全程不接触你的密码。想让 AI 自动翻页/批量采集,直接去「问问杀手」里说,它会指挥这个扩展执行。")}</p>

      <div className="card">
        <h2 className="font-bold">{t("你的采集令牌")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("安装扩展后,把它粘贴进扩展设置。")}</p>
        <input className="input mt-2 font-mono text-xs" readOnly value={token} onClick={(e) => e.target.select()} />
      </div>

      <div className="card">
        <h2 className="font-bold mb-2">{t("三步开始")}</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>{t("向 Will 要「采集扩展」文件夹,在 Chrome 打开 chrome://extensions,开启开发者模式,点「加载已解压的扩展程序」选中它。")}</li>
          <li>{t("点扩展图标,填入本网站地址和上面的令牌(只需一次)。")}</li>
          <li>{t("在学习网站登录后,用扩展「手动采集」抓当前页;想自动/批量采集,就在「问问杀手」里让 AI 派任务,扩展会在后台执行。")}</li>
        </ol>
      </div>

      <div className="card border-amber-200 bg-amber-50">
        <h2 className="font-bold text-amber-900">🛡️ {t("安全说明")}</h2>
        <p className="mt-1 text-sm text-amber-800">{t("采集任务只会读取内容、点击翻页/章节类链接,系统强制禁止点击任何「提交/购买/支付/删除/退出」按钮,绝不填表、不花钱、不改你的账户。首次建议在纯阅读页面上试用并留意日志。")}</p>
      </div>
    </div>
  );
}
