"use client";
import { useEffect, useState } from "react";
import { FEATURE_ITEMS } from "@/lib/uilab/items";
import FeatureModule from "@/components/uilab/FeatureModule";

export default function ItemsPreview() {
  const [isDev, setIsDev] = useState(null);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((d) => setIsDev(!!(d.user && d.user.isDeveloper))).catch(() => setIsDev(false)); }, []);
  if (isDev === null) return null;
  if (!isDev) return <div className="p-10 text-center text-[#8a7a54]">仅开发者可见</div>;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-24">
      <h1 className="mb-1 text-xl font-black text-[#e8c987]">栏目富模块预览(Style A)</h1>
      <p className="mb-6 text-sm text-[#b9a578]">每个「只有按钮」的功能做成大模块后的样子。收件箱有未读时会显示徽标与数字。</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_ITEMS.map((it) => <FeatureModule key={it.id} item={it} />)}
      </div>
    </div>
  );
}
