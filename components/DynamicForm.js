"use client";
import { useState } from "react";
import { useT } from "@/components/I18n";

// 通用对话内参数表单:按杀手给的 fields 规格渲染,收集值后回调 onSubmit(values)。内嵌在聊天里(像确认框)。
export default function DynamicForm({ title, fields = [], onSubmit, onCancel, busy }) {
  const t = useT();
  const init = {};
  for (const f of fields) init[f.key] = f.default != null ? f.default : (f.type === "checkbox" ? [] : "");
  const [vals, setVals] = useState(init);
  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  const toggle = (k, v) => setVals((s) => { const cur = Array.isArray(s[k]) ? s[k] : []; return { ...s, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }; });
  const clean = (v) => {
    const out = { ...v };
    for (const f of fields) {
      if (out[f.key] === "__other__") out[f.key] = "";   // radio 未真正填写
      if (Array.isArray(out[f.key]) && out[f.key].includes("__other__")) {
        const txt = String(out[f.key + "__otherText"] || "").trim();
        out[f.key] = out[f.key].filter((x) => x !== "__other__");
        if (txt) out[f.key].push(txt);
      }
      delete out[f.key + "__otherText"];   // 伴随字段不提交
    }
    return out;
  };
  const missing = fields.some((f) => f.required && (vals[f.key] == null || vals[f.key] === "" || vals[f.key] === "__other__" || (Array.isArray(vals[f.key]) && !vals[f.key].length)));

  return (
    <div className="rounded-2xl border border-[#e4d5af] bg-[#fbf6e9] p-4 text-sm text-[#2f2413] shadow-sm">
      <p className="font-bold">📝 {title || t("请填一下")}</p>
      <div className="mt-2 space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <div className="mb-1 text-xs font-semibold text-[#8a6a2c]">{f.label}{f.required ? " *" : ""}</div>
            {f.type === "select" ? (
              <select value={vals[f.key]} onChange={(e) => set(f.key, e.target.value)} className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[#2f2413]">
                <option value="">{t("请选择")}</option>
                {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
              </select>
            ) : f.type === "radio" ? (
              <div className="space-y-1">
                {(f.options || []).map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2"><input type="radio" name={f.key} checked={vals[f.key] === o.value} onChange={() => set(f.key, o.value)} /> {o.label || o.value}</label>
                ))}
                {f.allowOther && (() => {
                  // 【选项之外·自己填一个】选中"其他"时,该字段的值改由输入框决定(用 __other__ 作占位选中态)。
                  const knownVals = (f.options || []).map((o) => o.value);
                  const isOther = vals[f.key] === "__other__" || (vals[f.key] && !knownVals.includes(vals[f.key]));
                  return (
                    <div>
                      <label className="flex cursor-pointer items-center gap-2"><input type="radio" name={f.key} checked={isOther} onChange={() => set(f.key, "__other__")} /> {t("其他(自己填)")}</label>
                      {isOther && <input autoFocus type="text" value={vals[f.key] === "__other__" ? "" : (vals[f.key] || "")} placeholder={f.placeholder || t("在这里填…")} onChange={(e) => set(f.key, e.target.value || "__other__")} className="ml-6 mt-1 w-full max-w-xs rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[#2f2413]" />}
                    </div>
                  );
                })()}
              </div>
            ) : f.type === "checkbox" ? (
              <div>
                <div className="flex flex-wrap gap-1.5">{(f.options || []).map((o) => {
                  const on = Array.isArray(vals[f.key]) && vals[f.key].includes(o.value);
                  return <button key={o.value} type="button" onClick={() => toggle(f.key, o.value)} className={"rounded-full px-2.5 py-1 text-xs ring-1 " + (on ? "bg-[#2f2413] text-[#f6efdd] ring-[#2f2413]" : "bg-white text-[#2f2413] ring-stone-300")}>{o.label || o.value}</button>;
                })}{f.allowOther && (() => {
                  // 多选也能自己填一个:选中"其他"就把 __other__ 放进数组,提交时(clean)用输入的文本替换它
                  const on = Array.isArray(vals[f.key]) && vals[f.key].includes("__other__");
                  return <button type="button" onClick={() => toggle(f.key, "__other__")} className={"rounded-full px-2.5 py-1 text-xs ring-1 " + (on ? "bg-[#2f2413] text-[#f6efdd] ring-[#2f2413]" : "bg-white text-[#2f2413] ring-stone-300")}>+ {t("其他(自己填)")}</button>;
                })()}</div>
                {f.allowOther && Array.isArray(vals[f.key]) && vals[f.key].includes("__other__") && (
                  <input autoFocus type="text" value={vals[f.key + "__otherText"] || ""} placeholder={f.placeholder || t("在这里填…")} onChange={(e) => set(f.key + "__otherText", e.target.value)} className="mt-1.5 w-full max-w-xs rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[#2f2413]" />
                )}
              </div>
            ) : (
              <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={vals[f.key]} placeholder={f.placeholder || ""} onChange={(e) => set(f.key, e.target.value)} className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[#2f2413]" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {onCancel && <button onClick={onCancel} className="rounded-full px-3 py-1.5 text-xs text-stone-500">{t("取消")}</button>}
        <button onClick={() => onSubmit(clean(vals))} disabled={busy || missing} className="rounded-full bg-[#2f2413] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? t("处理中…") : t("提交")}</button>
      </div>
    </div>
  );
}
