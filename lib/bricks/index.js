// 汇总注册所有砖头。新增砖头模块时在这里 import 一次即可。
import "@/lib/bricks/crossExam";
import "@/lib/bricks/mergeSplit";
import "@/lib/bricks/diagnose";
import "@/lib/bricks/questionBank";
import "@/lib/bricks/planReview";
import "@/lib/bricks/studyMap";
import "@/lib/bricks/startHere";
import "@/lib/bricks/langTransfer";
import "@/lib/bricks/arena";
import "@/lib/bricks/planCompare";
import "@/lib/bricks/reminder";
import "@/lib/bricks/practical";
import "@/lib/bricks/customModes";
import "@/lib/bricks/recipe";
import "@/lib/bricks/dailyPlan";
export { listBricks, getBrick, runBrick } from "@/lib/bricks/registry";
