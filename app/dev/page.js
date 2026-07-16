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
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [dt, setDt] = useState(null);
  const [dtDate, setDtDate] = useState("");
  useEffect(() => {
    fetch("/api/dev/exams").then(async (r) => { if (!r.ok) { setDenied(true); return; } setData(await r.json()); });
  }, []);
  useEffect(() => { fetch("/api/dev/date").then((r) => r.ok && r.json()).then((d) => d && setDt(d)).catch(() => {}); }, []);
  const travel = async (body) => { try { const d = await fetch("/api/dev/date", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()); setDt(d); } catch {} };
  if (denied) return <p className="mt-16 text-center text-slate-400">{t("这个页面只有开发者能看。")}</p>;
  if (!data) return <div className="shimmer h-40 rounded-3xl" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🛠️ {t("开发者工具")}</h1>
      <p className="text-xs text-slate-400">{t("这些技术/调试工具只对开发者账号开放,普通用户和纯管理员看不到。")}</p>
      <DevSwitcher t={t} />
      <div className="card border-amber-200 bg-amber-50/60">
        <h2 className="font-bold text-amber-800">🕰️ {t("日期穿越(测多天剧本)")}</h2>
        <p className="mt-1 text-xs text-amber-700">{t("把整个应用当成「今天 + N 天」来运行:复习到期、今日任务、考试倒计时都会按这个虚拟日期推进,不用真的等好几天。只作用于你当前的账号(不影响其他用户);当天做题的计数仍按真实时间。用完点「回到今天」清零。")}</p>
        <div className="mt-2 text-sm">
          <span className="font-medium">{t("当前生效日期")}: </span>
          <span className="font-mono font-bold text-amber-900">{dt ? dt.today : "…"}</span>
          {dt && dt.offset !== 0 && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-800">{dt.offset > 0 ? "+" : ""}{dt.offset} {t("天")} · {t("真实")} {dt.realToday}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn bg-amber-600 hover:bg-amber-700" onClick={() => travel({ op: "advance", days: 1 })}>+1 {t("天")}</button>
          <button className="btn bg-amber-600 hover:bg-amber-700" onClick={() => travel({ op: "advance", days: 7 })}>+7 {t("天")}</button>
          <button className="btn bg-amber-500 hover:bg-amber-600" onClick={() => travel({ op: "advance", days: -1 })}>-1 {t("天")}</button>
          <button className="btn bg-stone-500 hover:bg-stone-600" onClick={() => travel({ op: "reset" })}>{t("回到今天")}</button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input type="date" value={dtDate} onChange={(e) => setDtDate(e.target.value)} className="rounded-lg border border-amber-300 px-2 py-1 text-sm" />
          <button className="btn bg-amber-700 hover:bg-amber-800" disabled={!dtDate} onClick={() => travel({ op: "set", date: dtDate })}>{t("跳到该日期")}</button>
        </div>
        <p className="mt-2 text-xs text-amber-600">{t("提示:改完日期后,回首页并刷新即可看到今日任务/复习按新日期重排。")}</p>
      </div>
      <div className="card border-rose-200 bg-rose-50/60">
        <h2 className="font-bold text-rose-700">🧨 {t("一键重置为初始状态")}</h2>
        <p className="mt-1 text-xs text-rose-600">{t("清空【你自己账号】的全部备考数据(所有考试、知识点、题目、做题记录、聊天、记忆、检查点、整体画像),但保留账号、登录和设置。用于反复演示。此操作不可撤销。")}</p>
        <button className={`btn mt-3 ${confirmReset ? "bg-rose-800 hover:bg-rose-900 animate-pulse" : "bg-rose-600 hover:bg-rose-700"}`} disabled={resetting}
          onClick={async () => {
            if (!confirmReset) { setConfirmReset(true); setResetMsg(""); setTimeout(() => setConfirmReset(false), 4000); return; } // 应用内两步确认,不用浏览器弹窗(便于自动化测试)
            setConfirmReset(false); setResetting(true);
            try { const d = await fetch("/api/dev/reset", { method: "POST" }).then((r) => r.json()); setResetMsg(t("已重置 ✓ 删除了 {n} 门考试及其全部数据。正在返回首页…").replace("{n}", d.exams ?? 0)); setTimeout(() => { location.href = "/"; }, 1200); }
            catch { setResetMsg(t("重置失败,请重试")); setResetting(false); }
          }}>{resetting ? t("重置中…") : confirmReset ? "⚠️ " + t("再点一次确认重置(不可撤销)") : t("一键重置为初始状态")}</button>
        {resetMsg && <p className="mt-2 text-sm font-medium text-rose-700">{resetMsg}</p>}
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
