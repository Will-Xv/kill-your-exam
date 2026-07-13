// 每考试的难度档位(1易~3难)。单独成模块,避免 memory.js 与 triggers.js 互相 import 造成循环。
import { getSetting, setSetting } from "@/lib/db";
const dkey = (examId) => "difficulty_pref:" + examId;
export function getDifficultyPref(examId) { const n = parseInt(getSetting(dkey(examId), ""), 10); return n >= 1 && n <= 3 ? n : null; }
export function setDifficultyPref(examId, level) { setSetting(dkey(examId), String(Math.max(1, Math.min(3, level)))); }
export function clearDifficultyPref(examId) { try { setSetting(dkey(examId), ""); } catch {} }
