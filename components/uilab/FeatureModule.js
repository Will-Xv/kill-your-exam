"use client";
// Style-A 富模块:图标 + 标题 + 说明 + (可选)实时数字 + 大动作按钮。
// 「只有按钮」的功能项、以及第三阶段杀手新建的项,都用它渲染(自带默认样式)。
import Link from "next/link";
import { useT } from "@/components/I18n";
import FitText from "@/components/FitText";
import { useStats, statValue, statMeta } from "@/lib/uilab/stats";

export default function FeatureModule({ item, fill }) {
  const t = useT();
  useStats(); // 订阅实时值
  if (!item) return null;
  const badgeN = item.badge ? statValue(item.badge) : undefined;
  const statN = item.stat ? statValue(item.stat) : undefined;
  const meta = statMeta(item.stat);
  const verb = item.verb ? t(item.verb) : (meta?.verb ? t(meta.verb) : `${t("打开")} ${t(item.label)}`);
  const suffix = meta?.suffix ? t(meta.suffix) : (item.statSuffix ? t(item.statSuffix) : "");

  return (
    <div className="animate-in relative flex flex-col overflow-hidden rounded-3xl border border-[#e4d5af] bg-[#f6efdc] p-4 text-[#2f2413] shadow-lg shadow-[#3d2b10]/10"
      style={fill ? { flex: "1 1 0", minHeight: 0 } : undefined}>
      <div className="flex items-center gap-3">
        <div className="relative grid h-[46px] w-[46px] place-items-center rounded-2xl border border-[#e4d5af] bg-[#f3e4bf] text-2xl">
          <span>{item.icon}</span>
          {typeof badgeN === "number" && badgeN > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{badgeN}</span>
          )}
        </div>
        <div className="min-w-0">
          <FitText className="font-black" max={17} min={12} lines={2} title={t(item.label)}>{t(item.label)}</FitText>
          <FitText className="text-[#6b4a25]" max={12} min={9} lines={2} title={t(item.desc)}>{t(item.desc)}</FitText>
        </div>
      </div>

      {typeof statN === "number" && statN > 0 && (
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-black leading-none">{statN}</span>
          {suffix && <span className="text-xs text-[#8a7a54]">{suffix}</span>}
        </div>
      )}

      <Link href={item.href || "#"}
        className="mt-auto block w-full rounded-full bg-[#2f2413] px-4 py-2.5 text-center text-sm font-bold text-[#f6efdd] transition hover:opacity-90"
        style={{ marginTop: typeof statN === "number" && statN > 0 ? "0.75rem" : "0.9rem" }}>
        {verb} →
      </Link>
    </div>
  );
}
