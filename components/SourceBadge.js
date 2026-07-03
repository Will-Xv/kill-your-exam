"use client";
import { useT } from "@/components/I18n";
export default function SourceBadge({ sourceType, refs }) {
  const t = useT();
  let parsed = [];
  try { parsed = typeof refs === "string" ? JSON.parse(refs || "[]") : refs || []; } catch {}
  if (sourceType === "material") {
    return (
      <span className="badge-material" title={parsed.map((r) => r.filename + (r.heading ? " · " + r.heading : "")).join("\n")}>
        {t("🟢 基于资料")}{parsed.length ? ` (${[...new Set(parsed.map((r) => r.filename))].join(", ")})` : ""}
      </span>
    );
  }
  return <span className="badge-model" title={t("资料库没有覆盖这部分内容,AI 凭训练知识生成,请谨慎对待")}>{t("🟡 模型知识,建议核实")}</span>;
}
