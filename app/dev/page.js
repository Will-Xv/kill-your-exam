"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

export default function Dev() {
  const t = useT();
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    fetch("/api/dev/exams").then(async (r) => { if (!r.ok) { setDenied(true); return; } setData(await r.json()); });
  }, []);
  if (denied) return <p className="mt-16 text-center text-slate-400">{t("这个页面只有开发者能看。")}</p>;
  if (!data) return <div className="shimmer h-40 rounded-3xl" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🛠️ {t("开发者工具")}</h1>
      <p className="text-xs text-slate-400">{t("这些技术/调试工具只对开发者账号开放,普通用户和纯管理员看不到。")}</p>
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
