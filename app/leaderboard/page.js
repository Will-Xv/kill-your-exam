"use client";
import Leaderboard from "@/components/Leaderboard";
import { useT } from "@/components/I18n";

export default function LeaderboardPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <h1 className="mb-3 text-xl font-black text-[#e8c987]">🏆 {t("排行榜")}</h1>
      <Leaderboard full />
    </div>
  );
}
