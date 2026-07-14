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
export { listBricks, getBrick, runBrick } from "@/lib/bricks/registry";
