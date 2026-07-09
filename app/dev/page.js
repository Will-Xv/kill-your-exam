"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";
import QuestionTool from "@/components/QuestionTool";
import DevSwitcher from "@/components/DevSwitcher";

export default function Dev() {
  const t = useT();
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    fetch("/api/dev/exams").then(async (r) => { if (!r.ok) { setDenied(true); return; } setData(await r.json()); });
  }, []);
  if (denied) return <p className="mt-16 text-center text-slate-400">{t("这个页面只有开发者能看。")}</p>;
  if (!data) return <div className="shimmer h-40 rounded-3xl" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🛠️ {t("开发者工具")}</h1>
      <p className="text-xs text-slate-400">{t("这些技术/调试工具只对开发者账号开放,普通用户和纯管理员看不到。")}</p>
      <DevSwitcher t={t} />
      <div className="card border-rose-200 bg-rose-50/60">
        <h2 className="font-bold text-rose-700">🧨 {t("一键重置为初始状态")}</h2>
        <p className="mt-1 text-xs text-rose-600">{t("清空【你自己账号】的全部备考数据(所有考试、知识点、题目、做题记录、聊天、记忆、检查点、整体画像),但保留账号、登录和设置。用于反复演示。此操作不可撤销。")}</p>
        <button className="btn mt-3 bg-rose-600 hover:bg-rose-700" disabled={resetting}
          onClick={async () => {
            if (!confirm(t("确定把你自己账号重置为初始状态?你的全部考试和备考数据会被永久删除(账号/登录/设置保留),不可撤销。"))) return;
            setResetting(true);
            try { const d = await fetch("/api/dev/reset", { method: "POST" }).then((r) => r.json()); alert(t("已重置 ✓ 删除了 {n} 门考试及其全部数据。").replace("{n}", d.exams ?? 0)); location.href = "/"; }
            catch { alert(t("重置失败")); setResetting(false); }
          }}>{resetting ? t("重置中…") : t("一键重置为初始状态")}</button>
      </div>
      <a href="/dev/bricks" className="card block hover:brightness-105"><h2 className="font-bold">🧱 {t("砖头实验室")}</h2><p className="text-xs text-slate-400">{t("跨考试管理等可组合小工具,独立于现有功能;在这里测试、发布。")}</p></a>
      <QuestionTool t={t} />
      <div className="card overflow-x-auto">
        <h2 className="font-bold mb-2">{t("所有考试数据量")}</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="p-1">id</th><th className="p-1">{t("名称")}</th><th className="p-1">user</th><th className="p-1">{t("状态")}</th>
            <th className="p-1">做题</th><th className="p-1">资料</th><th className="p-1">知识点</th><th className="p-1">题</th><th className="p-1">聊天</th>
          </tr></thead>
          <tbody>{data.exams.map((e) => (
            <tr key={e.id} className={`border-t border-slate-100 ${e.deleted ? "text-slate-300 line-through" : ""}`}>
              <td className="p-1">{e.id}</td><td className="p-1">{e.name}</td><td className="p-1">{e.userId}</td><td className="p-1">{e.status}</td>
              <td className="p-1">{e.attempts}</td><td className="p-1">{e.materials}</td><td className="p-1">{e.kps}</td><td className="p-1">{e.questions}</td><td className="p-1">{e.chats}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
