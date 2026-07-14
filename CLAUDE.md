# Kill Your Exam — 项目约定 / 长期记忆

## 杀手澄清优先(Will 要求)
- 主人要求【模糊/缺信息/自相矛盾】(尤其定义配方/规划/工作流)时,杀手【不猜、不硬做】,先具体指出不清/矛盾处并追问,直到说清才动手(系统提示里的"能力边界·先说清楚再动手"已加此条)。`recipe_save` 会在流程不清时返回 needsClarification+问题,杀手据此追问。

## 开发者=普通用户(Will 明确要求)
- **开发者账号除了以下三项,和普通用户【一模一样】,所有功能对全体用户开放**:
  1. **开发者工具**(`/api/bricks` 跑/发布砖头、Bug 里「亲自试做」`perform/grade` 的 devBugId 路径、`taunt` selftest 等自测入口、**清空杀手对话** `/api/chat` DELETE + KillerChat 清空按钮)——仅开发者。
  2. **Bug 反馈控制台**——仅开发者/管理员可见。
  3. **发布为默认 UI**(全站默认布局 `ui_default_layout` / `ui_item_placement` 的 POST)——仅开发者。
- 已对全体开放:杀手全部工具(记忆 list/forget、学习模式 save/list/activate/delete、plan_overview、UI 编辑 ui_create/remove/rename/move/home_layout 等**逐考试**层)、systemPrompt 里的记忆/学习模式/知识状态/界面定制段、触发器(`triggers/tick`+`cron`)、记忆 exam/global 分层、**逐考试** UI(`ui-nav` POST、`ui-layout` GET examLayout、`ui-items` exam 层)、`LayoutLab`(enabled=true)。
- 判据:**逐考试/逐用户的定制=全体开放;全站默认发布+开发者工具+Bug 控制台=仅开发者。** `declsFor` 已无 devOnly 工具;前端 nav 的 `itemVisibleTo({isDeveloper})` 仍正确隐藏 dev 控制台/Bug 台入口。

## 知识树/规划的行为契约(Will 反复踩坑)
- 主人说【范围/目标】(如"规划到期末""复习整门课")= 清晰意图,别当"模糊"反复追问;若当前树没覆盖该范围,杀手【主动】扩建/重建(走确认弹窗,默认 retain=keep,不为 retain 单独盘问)。
- **"期末/Final" 不是章节名、不是知识点**:要把期末考纲里【还没建的真实内容单元】(如"多元函数最优化""二重积分")作为一个个【正常章节】补进去;【绝不】建一个叫"期末/Final/考试名"的章节。不知道考纲就查资料/联网搜 syllabus/问主人,别编。
- `timeBudgetMin` 只给【真正的聚焦小测】(压成"以考试名命名的单章");整门课/期中/期末【绝不传】——传了就会重现"加一个叫期末的单元"这个 bug。
- **知识点标题必须简短**(中文4~14字/英文2~6词),标题里【禁止】长句解释/冒号/公式/LaTeX(否则 study 页把裸 `\nabla` 显示成源码)。KP 讲解正文走 `<MD>`(KaTeX)渲染,标题是纯文本不渲染。
- 空回合(无工具调用+无文本)自动重试一次;仍空按 finishReason 给可读提示(MAX_TOKENS→提示"继续")。

## ★ 元规则(最重要):每次新增/改动功能,必须同步更新三处(Will 明确要求)
1. **`CLAUDE.md`(本文件·长期记忆)** —— 更新下方「功能与模块索引」,防止因上下文丢失而忘记做过什么。
2. **`FEATURES.md`(单一事实来源)** —— 补上功能与实现逻辑。
3. **`lib/appGuide.js`(杀手认知 APP_GUIDE/APP_CAPABILITIES)** —— 杀手据此讲解与决策,不更新它杀手就不知道有这功能。
（i18n 新键要同步加进 `lib/translations.js` 全部 8 个字典。）

## 多模态 / 文件传给 Gemini —— 一律用 Files API,禁止 inline base64(Will 明确要求)
- **凡是把文件(图片、PDF、音频、视频等)传给 Gemini,必须走 Files API**(`uploadMedia(buffer, mime, ext)` in `lib/gemini.js` → 返回 `{fileUri, mimeType, name}`,在 parts 里用 `{ fileData: { fileUri, mimeType } }`)。
- **不要用 `inlineData`(base64)**:base64 膨胀 ~33%,且整个请求硬上限 20MB;PDF 走 Files API 可到 50MB/1000 页,视频/音频更大。inline 只能作为「上传失败时的小文件兜底」。
- 存储型资料(materials 表)上传后要**缓存 fileUri**(materials.gemini_uri / gemini_name / gemini_expiry,约 48h 过期),复用,避免每次调用重复上传。
- 这条适用于所有现有与未来的文件相关功能:讲解(explain)、出题(generate)、追问(discuss)、聊天(chat)、模拟考批改、表演批改(perform/grade,视频已用 Files API)、教材定位/指针解析(referenceResolve)、扫描 PDF 入库、音乐/音频(music.js)等。

## 部署
- build-gated push:本地 `npm run build` 通过后才 push 到 GitHub(Railway 自动部署)。
- 原生依赖(需系统库的,如 node-canvas)在 Railway 跑不了——避免;纯 JS 依赖(如 pdf-lib)可用。
- 部署后要用**新标签页**验证(旧副本会缓存)。

## 语言
- 真题(从教材解析出的题)保留**教材原文语言**,不翻译,除非用户明确要求。
- 测试资料要和考试语言一致(如 Cell Biology 是英文,就用英文测试材料),测完即删,别污染用户考试。

## 测试账号
- 只有【名为 `showcase` 的账号】、且【仅在 Kill Your Exam 这个项目里】,才可以放开测:里面的考试(如 Cell Biology)是虚构的、一次性的,可随便造数据、不用担心污染、不必每次回滚,收尾顺手清理即可。
- 其它任何账号(真实用户)一律不许拿来测试/造脏数据。

## 功能与模块索引（长期记忆——防止忘记做过什么）
> 完整功能与实现逻辑见仓库根目录 **`FEATURES.md`**（单一事实来源，每加功能都更新它 + `lib/appGuide.js`）。速览：
- 掌握度 `lib/mastery.js`；RAG `lib/rag.js`；规划 `lib/planner.js`（+ `lib/planVersions.js` 保守/激进&本周vs上周）；根因诊断 `lib/diagnose.js`。
- 三语迁移 `lib/langTransfer.js`（`/lang-transfer`，语言类考试，实时归因接在 practice/mock 批改里）。
- 竞技场/游戏化 `lib/arena.js`（`/arena`，@@STATE/@@KP 回流掌握度）。
- 自定义/AI生成**考核形式** `lib/customModes.js`（`custom_modes`，kind=play/exam_form，format=interactive/video）；**exam_form 自动成为独立栏目**（`saveCustomItem` id=`xform<id>` + `moveFeature`；放到 nav/more/morefeatures/zone/hidden **由 AI/用户经 `where` 参数决定**，默认 morefeatures；`/arena?launch=<id>` 直达）；竞技场只放 play；视频判分 `/api/arena/video-grade`；成绩 `custom_mode_results`。
- 实践任务回流掌握度改用 embedding 语义匹配知识点(≥0.55)+子串兜底;视频类自定义考核评分时 AI 归因 kpSignals→recordCrossKp 也回流掌握度。
- 实践任务 `lib/practical.js` + **Judge0** `lib/judge0.js`（`/tasks`，代码里程碑跑测试用例；证据里程碑 AI 审阅；用例申诉 `task_test_appeals`；`judge0_url/judge0_key` 在设置里由管理员配，创建提交+轮询、rapidapi/官方/自建三种鉴权自动判断）。**仅编程/STEM 专属:不在全局默认里,开启「实践模式」才自动把 tasks 栏目放进该考试首页;杀手判断是编程类才加。**
- 模拟考**后台判题**：`/api/mock/submit` 立即返回 grading，`gradeMock` 后台跑，`/api/mock/status` 轮询（`mock_exams.status/grade_started_at/results_json`）。
- 两层界面：`lib/uilab/*` + `/api/ui-items`。**每门考试可独立改布局（所有用户）**；**发布为默认仅开发者**；`normalizePlacement` 让新功能在旧布局里自动补位。

- Workflow Recipe(MVP-1,dev灰度)`lib/recipes.js`(`recipes`/`recipe_versions`;多阶段:selector/method/exit;getActiveRecipe 冲突解析=scope>priority>recency;currentPhase 按掌握度判定;methodForKp 供 planner)。今日任务(`/api/daily`)按当前阶段给 KP 任务标 method。杀手 brick `recipe_save/activate/status/list` + `recipe_resegment_preview/apply`(**已 seed published=对全体用户开放**)。设计见 `docs/WORKFLOW_RECIPE_DESIGN.md`。**MVP-2 已做**:`recipeProgress` 阶段掌握度增益测量(`recipe_phase_state` 快照)+ `ai_choose` 自动选增益最高的方法(recipe_status 显示 effectiveness/bestMethod)。**MVP-3 已做**:`lib/recipeRemap.js` proposeResegment(diff 预览不改数据)+ applyResegment(checkpoint→建新结构→AI映射+embedding兜底→非破坏重指 kp_id→删旧→integrityFix)。回退复用 checkpoint。冲突/优先级:getActiveRecipe(scope>priority>recency)已解析配方层。

## i18n
- `lib/translations.js` 8 个字典（ZH_EN/FR/ES/RU/AR/ID/TW/HK），源键=简体中文，8 个都要同步加键。TW/HK 可用 opencc（s2twp/s2hk）从简体键机械生成。

## Judge0（Will 已买官方 per-use，实为 RapidAPI 计费）
- 设置里：地址 `https://judge0-ce.p.rapidapi.com` + RapidAPI Key。已实测代码执行判分通（正确 4/4、错误按用例扣分）。
