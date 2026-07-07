"use client";
export const SRC_LABEL = { official: "完全依据官方考试说明", inferred: "依据资料/网络信息推测", estimated: "信息有限,AI 合理预估" };
const ICON = { official: "✅", inferred: "📄", estimated: "🔮" };
const CLS = { official: "bg-emerald-100 text-emerald-700", inferred: "bg-amber-100 text-amber-700", estimated: "bg-stone-200 text-stone-600" };
export default function SourceBadge({ level, note, t }) {
  const lv = ["official", "inferred", "estimated"].includes(level) ? level : "estimated";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CLS[lv]}`}>{ICON[lv]} {t(SRC_LABEL[lv])}</span>
      {note ? <span className="text-xs text-stone-500">{note}</span> : null}
    </div>
  );
}
