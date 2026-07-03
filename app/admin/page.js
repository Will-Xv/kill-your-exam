"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";

export default function Admin() {
  const t = useT();
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    fetch("/api/admin/usage").then(async (r) => {
      if (!r.ok) { setDenied(true); return; }
      setData(await r.json());
    });
  }, []);
  if (denied) return <p className="mt-16 text-center text-stone-400">{t("这个页面只有管理员能看。")}</p>;
  if (!data) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">{t("管理员 · 使用频率")}</h1>
      <p className="text-xs text-stone-400">{t("出于隐私考虑,这里只显示使用频率,看不到任何人的学习内容。")}</p>
      {data.users.map((u) => (
        <div key={u.id} className="card">
          <div className="flex items-center justify-between">
            <p className="font-bold">{u.username} {u.isAdmin && <span className="badge-material">{t("管理员")}</span>}</p>
            <p className="text-xs text-stone-400">{t("注册于")} {u.createdAt?.slice(0, 10)}</p>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
            <div><b>{u.attempts}</b><div className="text-xs text-stone-400">{t("总做题")}</div></div>
            <div><b>{u.activeDays}</b><div className="text-xs text-stone-400">{t("活跃天数")}</div></div>
            <div><b>{u.chats}</b><div className="text-xs text-stone-400">{t("聊天条数")}</div></div>
            <div><b className="text-xs">{u.lastActive ? u.lastActive.slice(5, 16) : "—"}</b><div className="text-xs text-stone-400">{t("最近活跃")}</div></div>
          </div>
          {u.week.length > 0 && (
            <div className="mt-3 flex items-end gap-1 h-12">
              {u.week.map((d) => (
                <div key={d.d} className="flex-1 text-center">
                  <div className="mx-auto w-full max-w-8 rounded-t bg-emerald-400" style={{ height: `${Math.min(100, d.n * 8)}%` }} title={`${d.d}: ${d.n} 题`} />
                  <div className="text-[9px] text-stone-400">{d.d.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
