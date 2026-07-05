// 每次上线新功能:把 GUIDE_VERSION +1,并把 WHATS_NEW 换成【这一次】更新的亮点。
// 老用户(已过新手导引)登录后只会看到【最新一版】的更新导引一次;新用户不看,只看新手导引。
export const GUIDE_VERSION = 2;

export const WHATS_NEW = [
  { icon: "🎭", title: "支持艺术类备考", body: "表演、播音主持、舞蹈、声乐、口语、演讲等艺术/技能类考试,现在可以直接【录音、录像作答】,AI 会看/听你的表现并给点评和改进建议。" }
];
