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
- **PDF/图片摄取 = 一律 File API 多模态(Will 定,不 OCR/不抽文字)**:`parseUpload` 对 PDF 和图片【一律返回空文本、不抽字不 OCR】;原文件保存后靠 `materialParts`(File API,`fileData`)交给 Gemini 多模态直读。只有 docx/txt/md 等【原生数字文本】才抽字分块做 RAG 检索。因此 PDF/图片【没有 chunk、没有语义检索】,全靠把文件喂给模型——`materialParts` 默认 cap 20、建树 `buildKnowledgeTree` cap 60(把【全部】教材都喂进去,别再像以前 cap 6 那样漏掉)。代价:每次要带文件、成本更高、失去按知识点精准检索片段——这是 Will 明确接受的取舍。locate/引用真题靠 `referenceResolve` 的 File API 多模态兜底。
- **【重要·底层全是现成的,别重造,只路由】结构大改/家族组织前,杀手先用大白话让主人三选一**:①【完全保留旧知识和旧题】(不动现有树和题,只在需要时追加新内容);②【建新树+把旧知识点掌握度语义映射过去】;③【完全重新来】(清旧记录干净重建)。每次都问、别猜;弹重建确认≠问过。这套逻辑 Will 早就做好了,别再重实现,找现成的用:
  - 单门考试重建=`rebuildKnowledgeTree(exam,lang,mode,opts)`(lib/generators.js):mode=keep(先删旧点建新点,再用 embedding 把旧 attempts/insights【语义映射】到最相近新点 cosine≥0.5=②)/ summarize(旧表现浓缩成观察挂新点、清原始记录)/ none(清记录干净重来=③)。杀手工具 build_knowledge_tree 的 retain 即它。
  - 跨考试/家族=lib/bricks/crossExam.js:`exam_provision`(role=mother 的 carryMode=live/summarize/partial/copy_all 决定旧内容怎么处理)、`exam_set_aggregate`(母考试实时汇总整棵子树、不复制)、`exam_set_parent`、`exam_copy_kps`/`exam_copy_questions`、`exam_promote_weak`(冲刺精选集)。
  - **家族防重复设计(已实现)**:carryMode=live→只开汇总不复制;summarize/partial/copy_all→复制内容并【关掉汇总】避免重复。
  - **家族=一棵树(Will 的设计原则,别忘)**:一个家族本来就该只有【一棵】知识树;把考试并进家族时应【合并树】,而不是 aggregate 出多棵并列树。现成实现 `exam_merge`(lib/bricks/mergeSplit.js):把一门考试整体并入另一门——移动 KP/题/作答/掌握度/讲解/资料/错题/笔记,按【章节名+知识点标题】去重(目标同名点吸收来源的题/作答,kp_id 重映射;没有的整点搬),软删源、源的子考试改挂 target,事务化保引用完整。配套:`exam_split`(拆分移动)、`exam_integrity_check`(孤儿/归属/环 体检+fix)、`exam_match_kps`(语义相似匹配,阈值默认0.82)。
  - **aggregate vs merge**:`exam_set_aggregate`=展示期实时合并【多棵】树、不动数据(名称/语言不一致时不会自动去重→重复,本次踩坑);`exam_merge`=物理并成【一棵】去重树。exam_merge 去重是【精确同名】,跨语言(中/英不同名)不会合并,需要时先 `exam_match_kps` 语义匹配再处理。
  - **选项②要连题库题一起搬**(Will 提醒):语义映射不能只迁做题记录、要把题库里相关的题也智能挑/迁过去——单门 build_knowledge_tree(retain=keep) 自动重指;跨考试用 exam_copy_kps→exam_copy_questions(withAttempts 连作答、重算遗忘曲线)、exam_promote_weak 只挑薄弱错题。
  - **本次重复真因**:期中+期末是一个家族,期末【既开汇总(把期中并进来)又把早期章节建进了自己的树】→ /api/kp 按 examScope 聚合家族、把早期内容显示两遍。不是生成 bug、不是残留,是【汇总+自建】双份。家族范围重叠怎么组织,该【杀手问主人】,不该开发者代问。
- 主人说【范围/目标】(如"规划到期末""复习整门课")= 清晰意图,别当"模糊"反复追问;若当前树没覆盖该范围,杀手【主动】扩建/重建(走确认弹窗,默认 retain=keep,不为 retain 单独盘问)。
- **考试/节点名(期末/期中/quiz/final/某考试名)永远不是章节名、也不是知识点**:要把该范围里【还没建的真实内容单元】(如"多元函数最优化""二重积分")作为一个个【正常章节】补进去;【绝不】建一个叫考试名/节点名的章节。不知道范围含啥就查资料/联网搜 syllabus/问主人,别编。
- `timeBudgetMin` 通用铁律:【只有】主人【明确给出很短时间预算+小范围】(如"一小时复习完这几节")才用(压成"以考试名命名的单章");【绝不能从范围词/考试名反推时间预算】——任何"扩大/铺开/覆盖到某节点/整门课"的需求都走正常多章重建。误判成小测就是"加一个叫期末的单元"那个 bug 的根因。
- **知识点标题必须简短**(中文4~14字/英文2~6词,只点主题、别写整句解释);**公式允许但必须用 `$...$` 包裹**(别裸露反斜杠)。study 页标题走 `<MD inline>`(KaTeX,含裸 LaTeX 自动包裹)渲染,讲解正文也走 `<MD>`。
- 空回合(无工具调用+无文本)自动重试一次;仍空按 finishReason 给可读提示(MAX_TOKENS→提示"继续")。
- **杀手不卡死·任务可长**:不用固定超时硬砍任务。单次 AI 调用【卡死侦测】90s(agentTurn)无响应就【立刻换连接重试】(最多6次),不是放弃;runLoop 每 15s 心跳刷新 updated_at 让【长任务永不被误杀】;/api/chat/run 看门狗只在心跳停了(进程崩溃/重启)、updated_at>120s 才判掉线清理孤儿运行。前端计时用服务端 elapsedSec 锚定,刷新不清零。

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
