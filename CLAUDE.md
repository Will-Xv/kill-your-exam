# Kill Your Exam — 项目约定 / 长期记忆

## 今日任务 vs 总规划(单一数据源·自动同步)
- **今日任务直接从 `crossExamPlan`(planner)实时生成**(app/api/daily:找当前考试的家族根那份 tasks→转 daily items;不缓存自动计划),所以和 /plan「总规划」【永远一致】、生成时就内建好逻辑,无需手动采用。只有 killer 自定义(set_daily_plan)才落 daily_plans 并优先;refresh_daily_plan 清掉自定义→回到自动。
- **好逻辑内建在 planner**:薄弱点=薄弱+未学、根因优先(summarizeExam 用 masteryMatrix,和 daily 同一套);自由练习封顶≈15分/一组(不再把剩余时间全塞进去);buildTasks 每门取 2 点。
- **纯数字微调=`tweak_daily_plan`(快路径,零 AI)**:「自由练习改5题」「问答改2题、辩论改1轮」这类只改题数/轮数——`lib/bricks/dailyPlan.js` 就地改 `currentDailyItems`(planner 共享助手,/api/daily 同源)里对应字段,不重挑知识点、不重排、不跑 AI,落 custom=1。已发布。killer 对纯数字优先用它(customize 太重会重排、慢)。
- **改今日任务=砖头 `customize_daily_plan`**(lib/bricks/dailyPlan.js,已发布):基础用 crossExamPlan(当前逻辑)+ 主人需求 + reviewPlan 自我审视 → AI 产出最终 items(kpId 只从 masteryMatrix 候选里选)→ 写 daily_plans(custom=1)。审视(plan_review 砖头)保留并在这里真正被用上;set_daily_plan 降级为「精确点名」。
  - **当日有序仪式(gap#1)**:主人若要「先做N道问答→围绕X辩论M轮→对不会的做苏格拉底→排进复习」这类【有顺序的多步流程】,砖头产出【有序 steps】,item.type 扩展为 `practice/debate/socratic/kp(study)/review/free`(带 kpId/n)。首页 HomeClient linkFor/labelFor 识别:practice→`/practice?kp=X&fresh=1`、debate→`/arena?mode=debate&kp=X`、socratic→`/arena?mode=socratic&kp=X`;竞技场页读 `?mode=`(boss/trial/debate/socratic 预设)自动开局。done 追踪:practice/debate/socratic 按当天该 kp 的 attempts+insights>0。**自动今日任务(/api/daily 从 crossExamPlan)完全不变**,只有主人主动要仪式才出现新步骤。
- 杀手侧同源:`plan_overview` 调 crossExamPlan(自动跟新逻辑);`set_daily_plan` item 格式一致。审视(reviewPlan)保留为透明度/可信度说明(dataBased/generic/overScheduled/trim/risks/summary/revisedMinutes),不再需要"手动采用"(已删按钮)。

## 资料主题匹配检查(诚实性)
- 上传后台跑 `assessMaterialTopic`(lib/materialMatch.js):文本材料用文字、PDF/图片用 readImage 一句话取主题,AI 判断是否属于本考试(exam.name+dossier)。四态 verdict:match / mismatch(offtopic=1,⚠️,别照编、提醒换对的) / unsure(offtopic=2,❓) / **partial(offtopic=3,📚,同学科但资料范围超出本考试,如只考U1却传了U1-3的书→问主人哪部分算范围、别把超范围的建进树/出题)**。【拿不准=unsure、要标记,不再默认 match;拿不到内容/判定出错也归 unsure】。systemPrompt:⚠️别照编;❓用前先问是不是这门考试的资料;📚先问哪些单元/部分算范围。list_materials 各态都显示。

## 汇报语言(Will 要求)

## 竞技场(lib/arena.js + app/arena/page.js)
- 模式:boss/trial/debate/**socratic(苏格拉底式引导=启发式反问教用户想通一个知识点,meter=理解度,非对战)**。加模式=改 ARENA_MODES + systemFor + 前端 PRESETS。recipe 的 socratic 方法→/arena?mode=socratic。
- 做题界面 Discuss(追问/争论)组件也支持 socratic 模式:顶部开关 discuss/苏格拉底引导,后端 /api/questions/discuss 按 mode 换系统提示(socratic=启发式反问教这道题,空历史自动抛开场问题),finalize 仍回流掌握度。Discuss 也支持 socratic。
- 作答已复用练习那套:HandwritePad(手写/草稿)+DropZone+filesToAttachments(拍照/上传),附件走 attachParts 多模态;对局进度存 localStorage(只存文字)刷新可恢复;对手对话深色字。
- 【一律用中文跟 Will 汇报】,任何情况下都用中文,别夹英文段落/标题。

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
  - **原则:激活哪个考试不该影响家族视图(Will)**。现状不一致:`familyScope(examId)`=爬到家族根+全部后代(整个家族,与激活谁无关)——【材料/RAG(chunks/materials 的 scopeSql)已用它】;`examScope(examId)`=只有激活考试+(若它开了 aggregate)其子树——【知识树/study/practice(/api/kp)用它,所以激活哪个考试会变】。这正是"家族=一棵树、激活无关"未落实的点。**已按 Will 选项2 实现**:`examScope` 已改为一律返回整个家族(=familyScope,不再看 aggregate_children、不管激活母/子),所以 study/练习/掌握度/错题/复习/竞技场/mock 等所有用 examScope 的地方都变成家族级、激活无关。(注:这只统一了视图;若家族里两门考试内容重叠(母自建+子)仍会重复显示,那要靠杀手 exam_merge/裁剪/retain 三选一去收拾,是另一回事。)
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
- **topic-first 自由探索学习法(gap#2,真·新方法非换壳)**:`app/api/kp/explore`(轮)+ `/finalize`(沉淀)。围绕一个知识点让考生【主动发问】,AI 顺着好奇心走、【实时判断理解深浅】(回复末尾隐藏 `@@DEPTH:shallow|medium|deep`,前端画深度条),浅→苏格拉底反问、深→抛挑战题;结束用 recordCrossKp(examId,null,cross,kpId) 把理解/误区回流掌握度。组件 `components/ExploreSession.js`,学习页 `?kp=X&mode=explore` 或讲解页「🔍 自由探索」按钮进入。作为今日任务步骤 type=`explore`(→`/study?kp=X&mode=explore`)与 Recipe 方法 `explore`(METHODS/methodLink)。
- **学习者历史注入(所有学习/自定义功能)**:`lib/learnerContext.js` 的 `learnerKpContext(kpId)`(该知识点的掌握度+最近做过的题对错+之前讨论/观察沉淀的理解与误区)与 `learnerExamContext(examId)`(家族薄弱点+最近误区/理解)。已注入:topic-first 探索、苏格拉底(discuss route mode=socratic)、追问/讨论(discuss)、知识点讲解(kp/explain)、竞技场全部模式+自定义玩法(arena.js systemFor/systemForCustom 前追加)。让 AI 因材施教:别重复已懂的、优先戳之前的误区、别问早答对过的。
- **表演/口语类按维度驱动下一次任务(gap#4)**:`perform/grade` 现在让 AI【为每个 rubric 维度单独打 0~100 分】(schema.dimensions=[{name,score,comment}]),存进 `attempts.dims_json`;PerformTask 结果页画每维度进度条。`lib/performDims.js` 的 `weakestPerformDims(examId,{kpId})`/`weakDimHint` 聚合最近录制的弱维度(<70);`generateQuestionsForKp` 在表演类(perfOn)命题时注入 `weakDimBlock`——下次自动【命题+rubric 都重点攻弱维度】(如 eye contact 平均58→下次专练 eye contact)。这是「暴露弱点→改变后续安排」的按维度闭环。
- 实践任务 `lib/practical.js` + **Judge0** `lib/judge0.js`（`/tasks`，代码里程碑跑测试用例；证据里程碑 AI 审阅；用例申诉 `task_test_appeals`；`judge0_url/judge0_key` 在设置里由管理员配，创建提交+轮询、rapidapi/官方/自建三种鉴权自动判断）。**仅编程/STEM 专属:不在全局默认里,开启「实践模式」才自动把 tasks 栏目放进该考试首页;杀手判断是编程类才加。**
- 模拟考**后台判题**：`/api/mock/submit` 立即返回 grading，`gradeMock` 后台跑，`/api/mock/status` 轮询（`mock_exams.status/grade_started_at/results_json`）。
- 两层界面：`lib/uilab/*` + `/api/ui-items`。**每门考试可独立改布局（所有用户）**；**发布为默认仅开发者**；`normalizePlacement` 让新功能在旧布局里自动补位。

- Workflow Recipe(MVP-1,dev灰度)`lib/recipes.js`(`recipes`/`recipe_versions`;多阶段:selector/method/exit;getActiveRecipe 冲突解析=scope>priority>recency;currentPhase 按掌握度判定;methodForKp 供 planner)。今日任务(`/api/daily`)按当前阶段给 KP 任务标 method。杀手 brick `recipe_save/activate/status/list` + `recipe_resegment_preview/apply`(**已 seed published=对全体用户开放**)。设计见 `docs/WORKFLOW_RECIPE_DESIGN.md`。**MVP-2 已做**:`recipeProgress` 阶段掌握度增益测量(`recipe_phase_state` 快照)+ `ai_choose` 自动选增益最高的方法(recipe_status 显示 effectiveness/bestMethod)。**MVP-3 已做**:`lib/recipeRemap.js` proposeResegment(diff 预览不改数据)+ applyResegment(checkpoint→建新结构→AI映射+embedding兜底→非破坏重指 kp_id→删旧→integrityFix)。回退复用 checkpoint。冲突/优先级:getActiveRecipe(scope>priority>recency)已解析配方层。




## 黑盒测试 P1/P2 回归修复(2026-07-15 二)
- **全局错误兜底**:`app/error.js` + `app/global-error.js`——client 异常不再白屏"Application error",给友好界面+重试;检测 ChunkLoadError(部署后旧标签页拿失效代码块→首次跳转崩、刷新好)自动硬刷新一次(sessionStorage 20s 防循环)。修 coding-first 首次进入白屏 P1。
- **计时器失真**:KillerChat elapsed 只在 `run.elapsedSec < 300` 时作基准,过大(遗留/等确认很久的 run,如 1008s)改用本地计时。
- **删除考试**:app/exams 原生 confirm() → 站内确认弹窗(confirmAsk 状态 + doManage)。
- **竞技场编程题(Coding-First)**:codingMode 检测(launch.title/spec 含 cod/编程/python…);输入框=等宽深色多行编辑器,Enter 换行、Ctrl/⌘+Enter 提交,**Tab 缩进4空格/Shift+Tab 反缩进**,**左侧行号槽**(gutterRef 随 onScroll 同步);**现场运行代码** `/api/arena/run`(Judge0 runOnce)+语言选择+输出面板(编译错误/stderr/状态/耗时,"运行只自测不算提交")。代码渲染:arena systemFor/systemForCustom 加铁律「代码/函数名用反引号、$...$ 只留给数学」修 `$函数名$` 显示成 $ 的 bug。**另在 `components/MD.js` 加 `codeNotMath` 兜底**(管线第一步):含引号的 `$...$` 一定是代码不是数学→转行内代码、剥掉贴引号的 $;修 `$validate_signal($"15.0")$` 因奇数 $ 被转义成字面 $ 的渲染 bug(对真数学 $x^2$/$f(x)$ 零影响)。**并加 `protectCode`/`restoreCode`**:所有数学预处理【之前】先把反引号/代码块内容遮成占位符、处理完原样放回——代码里合法的 $(shell $PATH、PHP $var、模板 ${x}、价格 $5 等)永不被 KaTeX/定界符逻辑碰。MD 是全局共享渲染器,练习/模拟考/竞技场/讨论/讲解/错题本全覆盖。
- **今日任务措辞**:HomeClient labelFor 的 kp 条目有 methodLabel 时显示方法名(t(methodLabel)+": ")而非笼统"学习:"——修 coding-first 卡片写 Study 的脱节。
- **P1-3 本地化收口**:48 砖头标题 + 22 写操作确认模板(confirmDesc 返回 {t:模板,p:参数},前端 descLabel 翻译模板再回填占位)+ 计时/17 静态工具提示 + onboarding 考试类型(艺术类/只学习)+ 方法标签(辩论/自定义考核/先看讲解再练)——全 8 语言。仍留:步骤条动态提示(为「X」出N题这类拼接串)、杀手回复双语回显。
- **P2**:错题本渲染完整选项+高亮(app/mistakes);辩论轮数中性 ×N(避"1 rounds");Materials「其他文件或说明」保存显示 ✓已保存;首页 kye:data-changed 事件杀手改完自动刷今日任务。

## 聊天附件可入库(2026-07-15)
- 用户在杀手聊天发的文件之前只当场多模态用、不落库。现在:`/api/chat` 收到 attachments 就持久化成 `chat_files(source='upload')`+saveChatFile,并在消息尾追加系统提示告诉杀手可存。`lib/materialIngest.js` 抽出 `ingestMaterialBuffer`(Materials 上传路由 + 本功能共用同一条入库流水线)。杀手工具 `save_attachment_as_material`(直接执行、非 WRITE_TOOLS,像 web_search_and_ingest;存前先问主人)读最近30分钟内该考试 source='upload' 且未存过的 chat_files → ingestMaterialBuffer → 标 saved_material_id。chat_files 加 source/saved_material_id 列。

## 黑盒测试 P1 修复(2026-07-15)
- **P1-1 诊断卡串味**:`getBanner(userId,examId)` / `getResolveBanner(userId,examId)` 现按当前考试家族(examScope/familyScope)过滤,banner.examId 不在家族里就不显示;/api/daily 传 exam.id。根因诊断/资料解析横幅不再串到别的考试首页。
- **P1-2 错题本缺选项**:app/mistakes 现在渲染完整选项(A/B/C/D),正确项绿、你选的错项红,带 ✓正确/✗你选的。
- **P1-3 本地化(部分)**:确认弹窗 `t(a.desc)` 本就包了,但砖头标题没进词典→显示中文。已补计时「已用」「大改动…别急」+ 测试点名的 6 个砖头标题(recipe_save/activate/customize/revert/tweak/active_rules)全 8 语言。**仍待办**:全部~40砖头标题、chatAgent describe() 的模板串(如"为「X」出 N 道题",动态拼的没法直接 t())、工具 note 里的中文、杀手回复里"笔记本(Notebook)"这类双语回显。
- **P1-4 结构修复(2026-07-15)**:配方阶段 `method.count` 新字段承载【每阶段题数/轮数】;`tweakRecipeCounts` + `recipe_tweak` 砖头(已发布)零 AI 就地改配方阶段数量、bump 版本(可 recipe_revert)。recipe_save 会在用户给数字时填 count;methodLink 显示 ×N;/api/recipe + /plan 卡片显示 ×N。路由:改数字→当天用 tweak_daily_plan、长期用 recipe_tweak,【都绝不重跑 recipe_save】。
- **P1-4 小调参又慢又重(旧记录)**:tweak_daily_plan 描述强化——【哪怕有活跃配方,改题数/轮数也绝不重跑 recipe_save(重)】,纯数字走 tweak 改当天。
- **未修(诚实记录)**:P1-5 回退后今日任务呈现不完全逐字一致;P2-1 要问答题却出选择题(生成引擎规格);P2-2 改完 UI 不自动刷新今日任务卡;P2-3 Materials 页交互不稳。

## 配方打磨(2026-07:回退/生效说明/后台重建/可视化)
- **一键回退** `recipe_revert` 砖头 + `revertRecipe`(lib/recipes.js):把当前生效配方回到上一版本(用 recipe_versions,回退也入栈可再撤)。/plan 配方卡有「↩ 撤回上一次改动」按钮(`/api/recipe` POST action=revert)。只回退配方内容,不动树/记录。
- **现在哪条规则生效** `active_rules` 砖头 + `activeRulesSummary`:列出本考试可见的已激活配方+学习模式及作用域,冲突解析=本考试特异 > 全局 > priority > 最近;governing=现在主管这门考试的那条。/plan 卡片也显示。
- **知识树重建改后台** `startRebuild`(lib/generators.js):build_knowledge_tree execTool 不再同步跑(避免拖到超时),改为置 setup_state='generating' + 分离 promise 跑 rebuildKnowledgeTree,完成/失败都清状态(失败留回档点)。`/api/kp` 与 /study 已 gate:generating 时返回 tree:[]+generating:true、学习页显示「知识树重建中…」不露半成品。KillerChat 原有 generating 横幅显示进度。
- **配方可视化** `/api/recipe` GET(阶段+当前阶段+版本历史+生效规则)→ /plan 顶部「🧭 学习配方」卡:阶段列表(高亮当前)、方法标签、生效规则说明、版本历史、回退按钮。
- 新砖头 `recipe_revert`/`active_rules`/`tweak_daily_plan` 均已 seed published。

## 杀手记忆系统 & 配方作用域(2026-07 梳理)
- **三层记忆,每轮 systemPrompt 全量拼接(不是按需检索)**:①【整体画像/你的全部杀技】`getOverallDoc(user)` 跨所有考试的 Markdown 长档,`update_overall_profile` 覆盖写;②【长期记忆 memory_facts】情景+语义事实,每条有 scope(exam|global|null)+valence(立场)+weight(按新近半衰减),`memoryDigest(user,examId)` 取「本考试(scope=exam且exam_id=X)+全局(scope=global或null)」,冲突并存、以最新主导、可 list_memory/forget_fact 追溯;后台 `extractMemoryBg` 对话后自动抽取并分层 exam/global;③【已激活学习模式/配方】注入为「必须严格遵守」。另有 per-exam 的知识状态记忆曲线(knowledgeStateDigest 实时来自 attempts)、过往教训 lessons、教材定位、资料主题标记。
- **配方/模式有两套**:①`save_learning_mode`(命名模式,scope=exam|global 由 AI 填,支持结构化 triggers 自动触发);②`recipe_save` 砖头(多阶段配方,selector/method/exit,planner 按当前阶段给方法)。`getActiveRecipe` 冲突解析=scope特异性(本考试>全局)>priority>recency。
- **作用域必问(新规,2026-07)**:主人新定义/修改模式或配方时,若没明说【只本考试】还是【以后所有考试长期通用】,killer 必须先用大白话问清楚再存,不默认。`recipe_save` 现在 scope 无默认——不传就走 needsClarification 让 killer 追问;`save_learning_mode` 的 scope 同样要基于主人回答。规则写进 systemPrompt + appGuide + 两个工具/砖头描述。含章节名的分阶段流程一般只适合本考试;不含章节、按薄弱/全部选的通用方法才适合 global。

## i18n
- **【铁律】任何新功能、新按钮、新文案都必须做【全语言】**——不是只补英文。凡是 UI 上会显示给用户的字符串,都要在 `lib/translations.js` 的【全部 8 个字典】里同步加键(ZH 源键=简体中文;EN/FR/ES/RU/AR/ID + 繁体 TW/HK)。只加英文=不合格。加完用 grep 数一遍确认 8 个字典都有(别只print"已加"却没生效)。
- `lib/translations.js` 8 个字典（ZH_EN/FR/ES/RU/AR/ID/TW/HK),源键=简体中文,8 个都要同步加键。TW/HK 可用 opencc(s2twp/s2hk)从简体键机械生成。批量加键时可按各字典独有的锚点值(如 `"重练到期错题": "<该语言值>",`)定位插入,注意繁体两个字典(TW/HK)可能锚点值相同,要处理重复。

## Judge0（Will 已买官方 per-use，实为 RapidAPI 计费）
- 设置里：地址 `https://judge0-ce.p.rapidapi.com` + RapidAPI Key。已实测代码执行判分通（正确 4/4、错误按用例扣分）。

## 2026-07-16 concierge 硬伤批 + 日期穿越 + 定时提醒 + 截断根因 + 发布家族砖头
- **功能卡截断根因(不是 CSS)**:`lib/customModes.js` 注册自定义考核为功能卡时 label `slice(0,20)`、desc `slice(0,40)` 硬截("Coding-First Challenge"→"Coding-First Challen")。①放宽到 40/80;②`create_custom_mode` 工具 schema 直接约束 name≤40/winDesc≤80(生成按钮时就控长,不靠事后 slice);③db.js 一次性自愈迁移 `_heal_xform_labels_v1` 从 custom_modes 完整 name/win_desc 回填 feature_registry.name + ui_custom_items。另修 `components/FitText.js` 真 bug:原用 `-webkit-box`+line-clamp 让 scrollHeight 测不出溢出、缩字号循环从不触发→改普通块+maxHeight+overflow,字号自适应才生效。线上验证标题完整。
- **VersionGuard**(P1-6 方向):`components/VersionGuard.js` 轮询 `/api/version`(RAILWAY_GIT_COMMIT_SHA),检测到新部署→拦截内部链接点击走整页 `location.assign`,预防旧标签页拿失效代码块的 ChunkLoadError。挂在 app/layout。
- **今日任务完成判定重做**:每类有【当天目标题数】(DEFAULT_KP_TARGET=6,配方 method.count/步骤覆盖),做够目标才算完成(不再连一道就算);显示(已做/目标)。辩论/苏格拉底/探索/自定义考核=对话式,**做过一次活动即完成、少出题甚至不出题**。`set_practical_mode` 砖头=任务优先模式(vibe coding/编程:主要做实践任务、复习+少量轻知识点,target 降到 2)。/api/daily done 逻辑按方法分流(method-aware)。appGuide 补"练习数量真相"(实时无限出题、×N 是每日目标非硬上限、设上限=只限每日做题数不改出题逻辑)+"少出题/不出题的学法"。
- **P1-5 undo 唯一入口**:`recipe_revert` 回退配方版本 + 清当天 daily_plan 一起回退(per-topic 计数 + 自由练习都退,不留半截);appGuide 加 undo 路由规则(别用 tweak 手动改回当 undo)。
- **发布家族砖头**:`exam_merge`/`exam_split`/`exam_integrity_check` 此前只开发者账号可用→加入 `_bn` 发布名单 + 一次性强制发布迁移 `_publish_family_bricks_v1`(UPSERT published=1)。对普通用户开放(剧本三融合/拆分此前没测到的原因)。
- **开发者日期穿越(测剧本6多天)**:`lib/devtime.js` 全局 `dev_day_offset`(整数天)→ `todayStr()`/`nowMs()`/`nowStamp()`。今日任务日期键、复习到期排期&判定&列表(mastery.js `date('now')`→绑 todayStr、review/route)、考试倒计时(planner daysUntil 用 nowMs)全部跟随偏移。`/api/dev/date`(仅开发者,±370天护栏)+ `/dev` 页"🕰️ 日期穿越"卡(+1/+7/-1/回到今天/跳到指定日期,全语言)。**offset 按用户隔离(通过 lib/reqctx AsyncLocalStorage 把请求 userId 带进 devtime,key=`dev_day_offset:<uid>`),只影响当前账号、绝不影响其他用户;测完点回到今天即清零。**
- **H3 定时提醒**:`reminders` 表 + `lib/reminders.js`(`addReminder`/`deliverDue`/`startReminderLoop`)+ 砖头 `set_reminder`/`list_reminders`(已发布)。到期投递=收件箱(sendLetter)+ web-push(pushUser);/api/daily 每次调 `deliverDue(user.id)` + 启动后台每分钟轮询。due 比较用 nowStamp(穿越也触发)。appGuide 加提醒认知(诚实标注:推送需先开通知,否则进收件箱)。
- **H7 配方名本地化**:HomeClient 配方名引号从硬编码「」改 `t("「")/t("」")`,8 字典按语言给引号(EN/ID→""、FR/ES/RU/AR→«»、TW/HK→「」)。
- **H8 穿越写入时间戳**:offset≠0 时 attempts(answer×2/skip/grade)+ insights(explore/discuss finalize)写入带 `created_at=nowStamp()`,穿越期间当天做题/洞察计数与虚拟日期对齐。
- **H9 首页自动刷新**:HomeClient 除 kye:data-changed 外,加 visibilitychange/focus 重载(节流3s)——去别处做完事回首页即最新。
- **H1 澄清**:UI 服务 workflow 靠【今日任务生成时按当前阶段方法编排】(methodForKp→每条带方法标签+直达链接;仪式型落有序步骤),不额外堆入口按钮(曾误加"学习法入口条"已删)。
- **H2 核实**:辩论/苏格拉底(竞技场 recordArenaSignals→recordCrossKp 并入掌握度+误区真题进错题本)、自由探索 finalize(写 insights+recordCrossKp)本就把状态回流并驱动 planner,无需改。
- **实践任务=子考试样式(2026-07,Will 定)**:实践任务不再是孤立对象——首页「子考试/任务」栏以子考试样式列出(🛠+进度 done/total/已完成、⏳截止),与真子考试**混在一起按截止日期升序排**(子考试 exam_date、任务 due_date,无日期垫底);点条目 `/tasks?task=id` 直达;今日任务只要有未完成任务即显示进度(不再限实践模式)。`lib/practical.listTaskSubs`→`lib/homeData` 注入 `taskSubs`;`components/HomeClient.js` 渲染+合并排序;`app/tasks/page.js` 支持 `?task=`。**刻意不建真 exams 行**(不进 planner/模拟/资料/竞技场→无自己的学习计划,符合 Will"看起来像子考试但没有自己的学习计划"),旧任务自动即此形态。i18n 加 `子考试/任务`(6 字典;TW/HK 走 opencc 自动转)。**任务详情数学渲染**:brief/里程碑标题/desc 改走 `MD`(KaTeX),`$...$` 正常渲染。
- **实践作业移回「今日任务」+ 子考试栏复原(2026-07,Will 改口)**:Will 后来要作业不放子考试栏了——`components/HomeClient.js`:顶部 chips 栏改回【只列子考试】、标签由「子考试/作业」复原为「子考试」(taskSubs 不再混进来/不再按 due 合并排序,只按 subExams 的 exam_date 排);taskSubs 改成【渲染进「今日任务」列表】,每条一行:🛠+标题+【作业】徽章(teal)+⏳截止 MM-DD+进度(done/total、已完成、待做),点 `/tasks?task=id`。底部 `daily.practical` 提示【只在 generating 时保留】(避免和作业行重复)。i18n 加「作业」「待做」(6 字典)。
- **确认反复弹 + 重复执行(2026-07,真机复现后修)**:①**重复执行**——`app/api/chat/resume` 改为【先原子占坑再执行工具】:`UPDATE chat_runs SET status='running',token=NULL,...(清 pending 字段) WHERE id=? AND status='pending'`,读出 calls/contents 后立刻抢占;并发的第二个 resume(确认点两下/`PendingBanner` 与页面各发一个/手机通知 notificationclick 再触发)拿到 `changes=0` 直接返回,**绝不重复执行**(此前 execTool 在 status 更新【之前】、又慢,窗口大→重复布置任务)。execTool 报错也标 `error`、不再永久卡 `pending`(否则横幅/确认一直纠缠)。真机验证:同 token 并发两个 resume→任务只 +1。②**确认反复弹**——根因是杀手按"每知识点 5 道编程题"配方**一道道**调 `assign_practical_task`、每道弹一次确认(Allow/Deny 都打不断)。修:`assign_practical_task` 加 `topics` 数组(JSON,上限6)→**一次调用建多道、只弹一次确认**(并行生成);`lib/appGuide.js` 明令"配方要 N 道就用 topics 一次布置,绝不分开反复调用"。
- **自由探索改逐轮记录(2026-07,Will 定)**:`app/api/kp/explore` 每轮让 AI 吐隐藏 `@@KP[{id,kind}]`→服务端即时 `recordCrossKp` 并入掌握度(understanding 变绿 / misconception 变红+进错题本),**和竞技场一致**;因此无论怎么退出(返回/练题/切走/刷新)理解度都不丢→去掉 `ExploreSession` 里脆弱的退出 sendBeacon 补记(那套依赖退出时序、引发过刷新回归)。"结束探索并记录"按钮保留作显式汇总。竞技场本就逐轮记录(`@@KP`),未动。**探索刷新根治**:`app/study` 用 `history.replaceState` 让 URL 始终反映当前视图(进探索→`?kp=X&mode=explore`、开讲解→`?kp=X`、退列表→清空),刷新读 URL 确定性恢复(修"从讲解页点自由探索进入时 URL 不更新、还带最初主题卡的旧 kp,刷新信旧 kp 打开它的讲解、丢掉真正在探索的知识点"——真机确定性复现)。
- **讨论离开即记(2026-07)**:`components/Discuss.js` 卸载(切走/换题/关页)用 sendBeacon `discuss/finalize` 把这段讨论沉淀进掌握度(Discuss 不跨刷新保存、卸载记录安全,`recordedRef` 防重复)。
- **聊天显示对齐 AI 原文轮数**:`app/api/chat` GET `LIMIT 60`→模块级 `RECENT=16`(与 AI 上下文保留的逐字轮数一致——"看到的=AI 记得的原文",更早的只在滚动摘要里)。
- **子考试完成→掌握度映射家族树(2026-07,Will 定)**:标记【真子考试】(有 parent_exam_id)完成时,`app/api/exam/manage` 的 complete 返回 `isSubExam`;`components/HomeClient.markComplete` 据此弹 confirm 二选一(映射 / 放着不动)。映射调 `action:map_mastery_to_family`→`lib/mastery.mapSubExamMasteryToFamily(subExamId)`:masteryMatrix 家族聚合后过滤出子考试【自己】的叶子 kp 档位,embed+cosine 语义匹配到家族里【其它考试】(母+兄弟,排除自己)的叶子(阈值 0.6),已掌握/一般→understanding、薄弱→gap 写 insights(recordCrossKp)。**只认真考试**;i18n 加 4 键(6 字典,TW/HK opencc)。**实践任务掌握度另一套**(Will 提醒实践任务≠子考试):assignTask 的 matchKp(子串→embedding≥0.55)把任务绑一个叶子 kp,gradeMilestone 里程碑过=understanding/未过=gap 写该 kp——伪子考试、不建 exams 行、不进这套家族映射。
- **UI 按考试隔离 + 建考试时智能删/凸显栏目(2026-07,Will 反馈)**:①**跨考试污染修复**——`feature_registry`/`ui_custom_items` 本是全局(无 exam_id),别的考试建的自定义考核(feature_id=`xform<模式id>`,`custom_modes` 有 exam_id)会冒进每门考试的「栏目分配」。`app/api/ui-items` GET 现在按 `familyScope(activeExam)` 过滤自定义考核:`xform<n>`→查 `custom_modes(n).exam_id` 是否在当前家族,不在就不显示;非 xform 的通用自定义功能不隔离(是用户有意建的全局功能);孤儿(找不到模式)隐藏。②**建考试时按内容整理栏目**——`lib/uiPlacement.autoAdjustExamUi(exam,user,dossier)`:AI 按考试名+类型+档案判断 4 个【可选】内置栏目(mock 模拟考 / prep 屠杀准备 / performances 表演回放 / tasks 实践任务)是否相关,无关→hidden、相关→保留可见(保守:只有明确 false 才收起);`lib/provision.runProvision` 末尾(置 done 前)调用,失败不阻塞。设成 per-exam 布局、可 ui_undo。③**自定义考核名不翻译、跟 UI 语言一致**:`generateModes` 本就带 `langInstruction(user.lang)`——新建的就是当前语言;老的英文样本(庄子:Butcher Ding/Huizi/Useless Tree)是旧数据,①隔离后只留在其原考试。测试文档(concierge 计划)已加「UI 智能调整·验收标准」5 条。
- **上传文件做题(2026-07,Will 定)**:独立入口「上传做题」(`/upload-quiz`,feature id `quizupload`,默认 morefeatures)。①`app/api/quiz-upload` POST:多模态(attachParts,File API)识别文件里每道题(题干/选项/qtype/答案),**文件没给答案就让 AI 解出正确答案**(为了能判分,区别于 bank_paste 的"一字不差只存真题");②每道题 `embed`+`cosine` 语义就近绑一个叶子知识点(Will:语义映射到最接近的现有知识点,不新建);③入 `questions` 表(kp_id 设好,origin='upload',is_real=1)。④`app/upload-quiz/page.js`:传文件→逐道作答→直接调现成 `/api/questions/answer` 判分(MCQ 精确匹配/简答 AI 判),**掌握度靠 attempts.kp_id 自动记进那个知识点**;末尾显示答对数+去 study 看掌握度。i18n 18 键×6 字典(TW/HK opencc)。刻意没改练习页(耦合重)、自包含复用 answer 接口。
- **上传做题·改走练习页(2026-07,Will)**:Will 要"和做题一样"——独立页(练习页本就 `hideKiller`)、能追问/争论、草稿纸、手写、刷新恢复。改法:`/upload-quiz` 只负责上传+识别,拿到题 id 后 `location.href='/practice?mode=quiz&ids=<csv>'`,把上传的题【载进练习页】复用全套体验。新增 `app/api/questions/byids`(按传入 id 顺序返回 {id,kp_id,qtype,body,difficulty});练习页加 `idsParam` + `mode==='quiz'` 分支(fetchBatch 走 byids、关掉预取/换一批)、storeKey 含 ids →【刷新也保留页面】(练习页原有 localStorage 续存:题/草稿/手写/追问)。`/upload-quiz` 也加进 AppShell 的 hideKiller。数学渲染怪(读图时模型把整句正文包进 $...$ 致 KaTeX 把整段当公式、空格被吃、sqrt 变字母):在抽题提示词里严禁把整句/普通单词包进 $、只用行内 $ 包公式本身且用正确 LaTeX(给了 好/坏 示例)——【Will 明确不要正则后处理兜底,只靠提示词根治】。
- **上传做题·重新识别/重新上传(2026-07,Will)**:quiz 模式下"题目有问题"按钮改成两选项(不走原 report 流)——【重新识别上传的文件】/【重新上传文件】。为支持重新识别,`quiz_sessions` 表存住上传文件的 File API parts(parts_json,约48h)+题id;upload 跳转带 `quiz=<sessionId>`。`quiz-upload` 支持 `{reRecognize:sessionId}`:复用会话里的 parts 重跑识别、把上一版【没作答过】的旧题删掉(不动已作答的)、更新会话题id;练习页 `reRecognize()` 拿新 ids 重进 `/practice?mode=quiz&ids=..&quiz=..`。练习页 quiz 模式还隐藏了【换一批】【🤖AI出题/📜真题】徽章(上传的题不是 AI 出的、也不是固定题库,别显示出题概念)。i18n +7 键×6 字典。
- **上传做题·结果页来源标注(2026-07,Will)**:byids 之前只返回精简字段致 q.is_real/origin/source_type 为 undefined→结果页误显示"题目:AI生成"、SourceBadge 误显示"模型知识"。修:byids 补齐 is_real/origin/source_type/source_refs/answer_origin;结果页 quiz 模式题目来源固定显示"题目:来自你上传的文件"。答案来源可能来自文件:抽题让 AI 每题标 answerFromFile(文件给了=true→answer_origin=provided;AI解出=false→ai),结果页 quiz 模式显示"标准答案:来自你上传的文件/AI解出"。实测:文件给答案的→provided,AI解的→ai。
- **非杀手AI一律指路杀手(2026-07,Will)**:竞技场(arenaTurn 拼好 system 后统一追加,覆盖全部内置+自定义玩法)、自由探索(kp/explore)、讨论/苏格拉底(questions/discuss 两处 prompt)——考生若在这些对话式AI里说了本该找【杀手】办的事(建/改/删考试或子考试、改界面布局或挪功能、问网站怎么用/有哪些功能、规划学习计划、布置任务、开关某功能等),AI【不自己处理、不假装能做】,明确又礼貌地指他去找『杀手』(点💬/进「问问杀手」)。原本这些地方只有弱提示(仅"网站功能/闲聊"),现在明确点名那几类杀手专属操作。
- **v5 测试反馈:诚实边界(P1-8)+ 趣味分学科 + 任务与学习一起排 + 两种铺垫模式(2026-07,Will)**:①**假能力/超范围·通用红线**(不只脑电波——挂号/订票/发邮件/操作别的软件等现实世界办事也算):现有工具做不到或超本产品职责的事,起草阶段就直说做不到、【绝不 save/activate 成模式·配方·触发器,绝不生成可批准的假步骤,绝不留"正文认账但下面还能一键批准假步骤"的自相矛盾】;有真替代(如"读脑电波判走神"→答题用时/粗心猜对懂但慢标记/连错/解释质量/distrust_self)就给,没有就老实说不是本产品能做的。写进 chatAgent 系统提示【能力边界】+ save_learning_mode 砖头描述。②**主动提议趣味但分学科**:枯燥/抱怨/连做题时主动问要不要更有趣(竞技场),但别把默认玩法一股脑塞进计划——辩论/庭审只适合有立场可争的人文社科、不适合理科;现有玩法都不贴又想更有趣且活动不够时,可主动 generate/create_custom_mode 现做1-2个贴学科的新玩法。③**任务与学习一起排**:布置任务/任务优先模式别只顾减练习,要用 customize_daily_plan 把任务+任务所需知识的学习一起排,别让主人还没学会就只剩任务。④**任务铺垫两种模式(杀手自选)**:小任务铺垫(拆成一串小任务边做边学、大任务最后)/ 先教再做(简单→给几行字读;抽象→苏格拉底/辩论/探索先证实理解再上任务)。②③④写进 appGuide。
- **认知自评长期用起来 + 上传后自更新(2026-07,Will)**:建考试时的【AI 认知自评】(known/uncertain/unknown/risks + 缺哪些资料清单,存 exams.self_assessment/checklist)以前建完就扔。现在:①`chatAgent.assessBlock(exam)` 把它(把握度/不确定/未知/风险/主人还没补的 must·file 资料)注入杀手系统提示——让杀手【主动】提醒缺口、补齐前如实告诫"题/讲解来自记忆、可能不贴你的真实考试",资料补了就别再念(报告 P2 的"主动说缺什么");②`lib/assessRefresh.refreshAssessmentBg(examId,lang)`:上传/删除资料后台跑,AI 据现有资料把 checklist 里已满足的 file 项标 done、微调 confidence/uncertain/unknown/risks→缺口随资料补齐而更新(挂在 materials/upload 与 delete,fire-and-forget)。
- **命名去歧义 任务→作业(2026-07,Will)**:"任务"既指实践任务又指今日任务,易混。首页栏标题「子考试/任务」→「子考试/作业」(i18n 键改名);杀手认知 appGuide 里「实践任务」→「实践作业」(×10)。(注:功能栏目名/tasks 页/其它 i18n 仍是「实践任务」,如需全量改名再说。)
- **子考试生成中提示(2026-07,Will)**:生成期间本就不该切进去(不改),但首页「子考试/作业」栏对 setup_state=generating/draft 的子考试显示「⏳ 名称 · 生成中…」不可点、pulse、hover 提示"后台生成中可能要几分钟、好了自动就绪、现在切不进去"(homeData.descendants 带出 setup_state)。
- **全量改名 实践任务→实践作业(2026-07,Will)**:"任务"歧义(实践任务 vs 今日任务)→用户可见/杀手认知/i18n 一律改「实践作业」。全局替换 lib/uiPlacement/uilab/items/db/practical/planner/bricks/practical/translations、components/HomeClient、app/api/daily、app/settings、app/tasks + appGuide + FEATURES(功能 id 仍是 `tasks`、工具 id 仍是 `assign_practical_task`,只改显示文本;i18n 键"实践任务*"随之改名、调用点同步)。首页栏标题「子考试/任务」→「子考试/作业」。
- **上传资料后所有功能读到新文件(2026-07,Will)**:`materialParts`/`retrieve` 本就每次实时查(竞技场/探索/练习/模拟/出题/讲解生成都会带上新文件);唯一读旧的是【缓存的知识点讲解 explanations】。`afterMaterialsChanged`(入库/删资料都调)现在【清掉本家族的 explanations 缓存 + invalidateKnowledgeState】——下次看知识点用新资料重新生成(懒重建),讲解不再停留在旧文件。
- **别把该你做的决定甩给用户选(2026-07,Will)**:杀手曾让用户"从三个作业里选一个",但用户是巨婴、不会选(会选还要杀手干嘛)。规则:凡是杀手【有信息能自己判断】的事(布置哪个作业、今天学哪个点、用哪种方法/玩法)一律【自己定好直接安排】(写操作仍走确认门一键批准),【绝不】丢给用户"选一个";只有①用户明确要自己选、或②只有本人能答的偏好/范围/归属问题(目标分数/当前水平/算不算某考试子考试/方法通用与否)才让他选。写进 chatAgent 系统提示 + appGuide。
- **杀手通知/横幅→当前杀手浮层,不再跳 /chat(2026-07,Will)**:杀手"需要你确认"的 web-push(chatAgent 3处)url 从 `/chat`→`/?killer=1`;`AppShell` 加 effect:URL 带 `?killer=1` 就 `openKiller()` 打开当前浮层并清参数。`PendingBanner` 一律 `openKiller()`(不再手机端 `<Link href="/chat">`)。/chat 那个独立整页不再是通知落点(它其实也是同一个 KillerChat,但用户要的是浮层)。
- **"思考中"残留 pending 步骤修复(2026-07,Will)**:run 进过 pending、被恢复成 running 后旧的 "pending" 步骤没清,挂在"思考中"进程条里显示成"⏸等待你确认…",让用户以为在等决定却没确认卡(其实在慢慢跑,最后可能超时)。①KillerChat 进程条 `vis` 过滤掉 `kind==="pending"`(真要确认时是 `pending` 状态驱动的确认卡、`busy` 转 false、进程条消失,和步骤显示无关——不影响确认逻辑、不会重复弹);②源头:resume(写确认 route)+ resumePlanApprove/Revise 恢复 running 时一并 `steps_json='[]'` 清旧步骤。
- **杀手能删实践作业 + 没工具就报告做不到(2026-07,Will)**:此前没有删实践作业的砖头,杀手删不了还不吭声。①新增 `delete_practical_task` 砖头(按标题关键词删/all 全删/只一个可直接删,write=true 走确认门)+ 加进 `_bn` 发布名单(INSERT OR IGNORE 自动 published)+ appGuide 告知。②系统提示【能力边界】加铁律:主人要做的事若在工具/砖头列表里【找不到能做到的工具】,就当场明确说"做不到/没这功能",绝不闷头不吭声、不假装做了、不用不相干工具凑数。
- **实践作业里的做题聊天(2026-07,Will)**:作业详情页加「做题问答」聊天面板——帮主人【自己把作业做出来】(引导为主、不代做),`task_chat` 表存聊天记录。①`lib/practical.taskChatTurn`:系统提示带作业标题/里程碑 + `learnerKpContext(kp)` 因材施教,每轮吐 `@@KP` 观察→`recordCrossKp` 进掌握度(复用带权重+近期衰减的 insights:masteryMatrix 按 `exp(-days/14)` 加权,所以"昨天没懂今天懂了"=今天的 understanding 自然盖过旧 gap,不需另造权重系统);②`taskChatHistory/clearTaskChat`;③`/api/tasks/chat`(GET历史/POST发言,inScope 校验);④`app/tasks` TaskDetail 加 `TaskChat` 组件(GET载史+POST发,MD渲染);⑤**任务全部里程碑完成即删聊天记录**(gradeMilestone 里判 doneN>=total→clearTaskChat;deleteTask 也清)——观察早已进掌握度、长期保留,聊天本身临时。i18n 全语言。
- **代码编辑器组件化+换行自动缩进(2026-07,Will)**:作业(app/tasks Milestone)的代码框原是纯 textarea(无行号/无Tab缩进)。抽出 `components/CodeEditor.js`(左行号槽+Tab/Shift+Tab 4空格缩进+**换行按语言自动缩进**:Python/Ruby 行尾`:`多缩一层、C系/JS/TS/Java/Go/Rust等行尾`{([`多缩一层、其它保持当前缩进;可选 onSubmit=Ctrl/⌘+Enter),作业与竞技场(app/arena 原内联编辑器)都改用它。
- **考试分组(跨学科·纯界面/今日任务组织·不合并数据·2026-07,Will)**:Will 要"把几门跨学科考试放进一个大壳方便管理,但知识树不合并,只界面合并+今日任务方便"。发现现有家族(父子)的 examScope=familyScope 会【一律共享数据】,达不到"不合并"。按 Will 定:【不动作用域】,加一个【独立的分组构件】(和家族/exam_merge 分开)——`exam_groups`/`exam_group_members` 表 + `lib/examGroups.js`(create/add/remove/delete/list/groupNameOfExam/findGroup)。杀手砖头 `exam_group_create/add/remove/list/delete`(按考试名/分组名解析,已发布 _bn)。今日任务:`/api/daily` 的跨考试 others 带上 `group` 名,`HomeClient`「别的考试也别落下」按分组名聚起来(📁 分组名 下列该组考试,未分组照旧)。各考试数据【完全独立不合并】(不碰 examScope)。appGuide 讲清【三种放一起别混】:①纯分组(跨学科、数据独立)②家族/子考试+汇总复习(同课、数据打通)③exam_merge 真合并(并成一棵树)。「跨考试规划/plan」栏暂保留(可后续去掉/并入)。
- **多考试时主动提示建分组(2026-07,Will)**:主页(HomeClient 顶部)+ 追杀计划(/exams 顶部)在【用户有≥2门顶层考试且≥2门未分组】时主动弹提示"要不要建成一组,今日任务统一管理更方便(数据不合并)",三选一:【好,我来挑几门建成一组】->展开【勾选面板】让用户【自己选哪几门】进这组(默认全选、可填分组名),再点【创建分组(N)】(POST /api/exam-group action="group" + examIds[](只收该用户未分组的顶层考试)+name->createGroup);【暂不】(本次隐藏,下次再提)/【不再提醒】(setSetting exam_group_prompt_dismissed:<uid>=1 永久)。GET /api/exam-group 额外返回 ungrouped:[{id,name}] 供勾选。组件 components/ExamGroupPrompt(两段式:提示->勾选)。i18n 全语言。【要点:同意后是用户自己选哪几门,不是自动把全部未分组一股脑塞进去。】
- **分组后今日任务真合并 + 别的考试只显示非本组(2026-07,Will)**:建组后 Will 没看到今日任务被"合并",且"别的考试也别落下"仍显示本组考试。修:app/api/daily 用 groupNameOfExam(当前考试)算出 myGroup,把跨考试 others 拆成 groupMates(和当前考试【同组】的其它考试,并进今日任务)与 others(【非本组】,给"别的考试也别落下");crossExam 增加 groupMates/groupName。components/HomeClient 在今日任务卡片内渲染「📁 组名 · 本组一起管的今日任务」块(本组考试各自今日分配一行、点击直达),crossOthers 只剩非本组。i18n 全语言。
- **本组切换 chips + 作业循序渐进 + 示例可读(2026-07,Will)**:①本组考试不再是今日任务里的一块,改成【「今日任务」标题右边的切换 chips】(当前考试高亮、其余点一下 switchExam 切;超过3个显示「… +N」可展开/收起)。②实践作业顺序反了(第三战在最上、第一战最下):lib/practical.listTaskSubs 排序由 id DESC 改为【due ASC, id ASC】=循序渐进;批量布置(assign_practical_task 的 topics)不再全同一天,加 staggerDues 给【渐进错峰截止】(靠后的接近最终期限),工具描述叮嘱杀手按由易到难顺序传 topics。③代码题示例输入被挤成一行看不懂:生成提示要求 desc 里【输入格式/输出格式说死 + 示例用 markdown 围栏代码块、多行真分行】(MD 组件 protectCode 已支持围栏代码块渲染)。注意:prompt 是模板字符串,别在里面写真的三反引号(会截断)。
- **取消手动分组→所有考试默认算一个组 + 按天排任务 + 定时提醒(2026-07,Will 大改口)**:Will 决定不要手动"建分组/选哪几门"了,直接【所有考试就是一个组】。删除:分组砖头 exam_group_create/add/remove/list/delete(crossExam.js 末尾整段删)、_bn 发布项、components/ExamGroupPrompt.js、app/api/exam-group/route.js、lib/examGroups.js;HomeClient/exams 移除 ExamGroupPrompt。/api/daily 不再按 group 切分:其它顶层考试全部带回 others(≤12),首页「今日任务」标题右侧的切换 chips 用 crossOthers(全部考试,当前高亮、超3个…展开)、"别的考试也别落下"平铺(去掉 📁 分组头)。exam_groups/exam_group_members 表留着不用(无害)。appGuide:删"三种放一起"里的纯分组,改为"所有考试默认一个组、跨考试按天排别落下";exam_set_parent/exam_merge 仍是数据层手段。【定时提醒】早有 set_reminder/list_reminders 砖头(已发布,offsetDays/offsetHours/dueAt)。【按天排任务】暂无专门跨天排期砖头,加 appGuide 指令让杀手用现成工具落地:跨天用 assign_practical_task 给每道具体截止(topics 自动错峰)、set_reminder 每天提醒、customize_daily_plan 排今天;所有考试当一个池子按天铺开、别落下任何一门。(如需专门的多天可视化排期视图,是更大的活,另开。)
- **跨考试按天排期(持久·未完成自动顺延·可编辑·可让杀手重排)·放在「跨考试规划」/plan(2026-07,Will)**:Will 要真正的排期表并放进 /plan。lib/dayPlan.js:存 settings(day_plan:<uid>)的 JSON——items[{seq,day,title,examId,taskId,done}]+startDate+perDay;dayPlanView(today) 把【未完成且计划日<=今天】的全堆进「现在该做(含顺延)」按原顺序、未来按日期分组=【顺延但不打乱后续顺序】。planDays(重排=整体覆盖)/markDayItem/editDayPlan/clearDayPlan。砖头 lib/bricks/schedule.js:plan_by_day(units 有序数组,可带 examId/taskId/day,perDay/startDate;整体重排)、clear_day_plan;都已发布、index.js 注册。API app/api/day-plan(GET view / POST mark|edit|clear)。UI 在 app/plan/page.js 顶部:「📅 按天排期」卡——现在该做(勾选完成,过期标原定日、含顺延徽章)/接下来(按日期)/已完成;✎编辑(改「第几天」调顺序顺延、改标题、删项、保存)/清空。appGuide「按天排任务」改为首选 plan_by_day。i18n 全语言。【定时提醒沿用已有的 set_reminder。】
- **实践作业助教:测试结果只能照实说 + 用户能看每个用例细节(2026-07,Will)**:两个真 bug。①【助教瞎恭喜】测试 0/6 全挂,助教却说"6/6 全部通过"——lib/practical.js taskChatTurn 系统提示加【铁律】:过没过/通过几个【只能】照【里程碑】里"通过 X/Y"的实际数字说,0/6 就是没过、要帮他看错因,绝不许编"全部通过";有测试用例但没有可信结果时,里程碑块显式追加"(警告)还没有可信的测试结果——别假设通过"。②【看不到运行结果/error】纯运行块扩到含 error/status/耗时(不再只认 stdout/stderr)。③【测试细节】app/tasks/page.js 每个用例都清楚列 输入/期望/实际(空->"(空)")/报错,通过的也淡显可看。
- **实践作业代码题:测试用例/输入输出约定生成得更严(2026-07,Will)**:根因是题目没说清 stdin 读法、用例格式随意,导致助教"一会儿 sys.stdin 一会儿说没 EOF"自相矛盾。lib/practical.js assignTask 生成提示加【输入输出约定铁律】:desc 必须把输入格式(几行/几个数/分隔)和输出格式说死;优先固定行数、少用"读到 EOF"(不定长才明说);starter 必须给出与约定一致的读取骨架(学生只填逻辑);每个用例 stdin 严格符合声明格式,读法与用例自洽。防御层给非空 stdin【补结尾换行】(修 input()/readline 无换行读到 EOF 报错)。助教侧加"代码题读输入以测试用例 stdin 实际格式为准、别前后矛盾"。
- **Judge0 故障不再冒充"用户 0 分" + judge0_http_400 兼容(2026-07,Will)**:症状是"测试全 0/6、实际输出全空",其实是评测机(Judge0)返回错误被 runTests 吞掉、伪装成用户答错。lib/judge0.js:runTests 遇到 runOnce 的 infra 错误(judge0_http_xxx/timeout/no_token)【整组中止并返回 {ok:false,error,detail,infra:true}】,不再塞成空的失败用例;runOnce 明文提交被 HTTP 400 拒绝时【自动改 base64_encoded=true 重试】(很多托管实例要求 base64),并把服务器返回的 detail 透传出来。app/tasks/page.js 运行出错文案改成"评测机(Judge0)出问题了,不是你的代码:<error>·<detail>"。judge0_http_400=服务器收到但判定请求不合法(实例额度/限流/key 失效、或某用例 expected 不被接受、或 cpu_time_limit 超上限)。

- **首页「别的考试也别落下」→「别的科目快到期/逾期」提醒 + 「跨考试规划」按钮→「本周计划表」(2026-07,Will)**:首页那栏不再列所有其它考试的今日分配,改成【跨考试的紧急作业提醒】:lib/practical.urgentCrossTasks(userId,currentExamId,withinDays=3) 查所有考试(排除当前家族)里【未完成且截止≤今天+3(含逾期)】的实践作业;/api/daily 加 urgentCross;HomeClient 渲染「⚠️ 别的科目快到期/逾期」(逾期红/快到期黄徽章 + 考试名·作业名 + ⏳截止,点 /tasks?task=)。今日任务标题右侧切换 chips 仍在(用 crossExam.others)。顶部「🗺️ 跨考试规划」按钮文案改「📅 本周计划表」(仍指 /plan)。
- **杀手感知当前页面(文字·不传图)(2026-07,Will)**:KillerChat 发消息带上 page=当前 pathname+search;/api/chat 用 lib/pageContext.pageDescription(path) 生成一句该页的文字说明,拼进本轮用户消息(系统提示口吻),让杀手知道主人现在开的是哪个页面、大致长啥样,理解"这个/这里/当前页"。刻意【不传截图省 token】,只补文字。pageContext.MAP 覆盖 //practice//mock//arena//tasks//plan//exams//materials//study//knowledge//mistakes//upload-quiz//inbox//settings 等。

- **作业助手型作业(assignment)(2026-07,Will)**:上传的 assignment→杀手自动标成一种【新作业类型】,区别于 practical(里程碑+Judge0)。DB practical_tasks 加 kind('practical'/'assignment')+completed_at。lib/practical:createAssignment(kind='assignment', milestones='[]', brief=作业完整内容)、markAssignmentDone(置 completed_at + clearTaskChat)。taskChatTurn 加 attachments 参数 + isAssign 分支(作业助手口吻:陪他完成这份作业、能读本轮上传/粘贴的文件、仍每轮 @@KP 实时记掌握度);completion-clear 对 assignment 不触发(靠标记完成清空)。listTasks/getTask/listTaskSubs/urgentCrossTasks 认 kind+completed_at 判完成。杀手砖头 add_assignment(title/brief/dueDate,已发布)——主人上传作业时用,brief 要抄全。/api/tasks POST 加 createAssignment/markDone;/api/tasks/chat 传 attachments。UI:TaskChat 加文件上传/粘贴(filesToAttachments);TaskDetail 对 assignment 显示【作业】徽章+『标记完成/取消』(AssignDone 组件)+说明,不显示里程碑;列表项 assignment 显示徽章+已完成/待做。i18n 全语言。

- **改截止只做小改动 set_task_due(2026-07,Will)**:主人让改某个作业/项目截止日期时,杀手用 set_task_due【只改那一处 due_date】——按标题关键词匹配一个作业(practical/assignment 通用),不重排计划、不重生成里程碑、不动别的。lib/practical.setTaskDue(exam,{title,dueDate});砖头 set_task_due(已发布);appGuide 叮嘱"只让改一个就只改一个"。

- **按 syllabus 排整学期 plan_from_syllabus(2026-07,Will)**:主人给/传 syllabus(含作业due、考试日期、每周主题)→杀手用 plan_from_syllabus:把大纲内容传进来,generateJson 抽取【整学期所有带绝对日期 YYYY-MM-DD 的事项】(assignment/exam/study),lib/dayPlan.addDayPlanItems 按绝对日期换算成 day 偏移(过期→负 day→视图进"现在该做·含顺延")【追加】进持久排期(replace=true 重建;多门课 syllabus 可分别调用累加)。接入 /plan 的按天排期表,天数不限(不是只有 7 天)。砖头已发布。appGuide 指引:syllabus→plan_from_syllabus;加/重排→plan_by_day;只改一个截止→set_task_due。【剩:Will 的"自动化=用户不在时也执行"——目前靠 set_reminder(到点推送/进收件箱)+ 整学期排期自动顺延覆盖大部分;真·每周自动重排的后台循环任务尚未做。】

- **本周计划表重写成可翻周的周历 + 作业助手要知道作业是什么(2026-07,Will)**:/plan 整页重写(删掉配方/复习/周caps/对比/各考试进度那一堆),只剩【按天排期的周历】:← 上一周/本周/下一周 →(wk 偏移,周一起),每天一张卡列当天条目(勾选完成、点去做),当前周顶部单独显示「逾期顺延」;顶部保留✎编辑(整份排期改第几天/删项/标完成)+清空。空排期给引导语(让杀手排或发 syllabus)。作业助手(taskChatTurn 的 assignment 分支)加铁律:若作业『内容/要求』很少/笼统/没有(如只从 syllabus 抄了个名),【第一步先请主人贴/传作业原文】搞清要交什么再帮,别凭标题瞎猜——保证它总"知道这个作业是什么"。

- **循环自动规则(后台定时·用户不在也执行)(2026-07,Will)**:复用 reminders 的后台 setInterval 思路。lib/autoRules.js:auto_rules 表(kind/freq/weekday/hour/minute/text/next_run);computeNextRun(daily/weekly)、addAutoRule/listAutoRules/deleteAutoRule、runDueAutoRules(到点执行→execRule:kind='reminder' 发提醒文字 / 'plan_digest' 汇总本周排期投收件箱+推送,然后滚到 next_run)、startAutoRuleLoop(60s tick,globalThis 单例)。在 /api/daily 里 startAutoRuleLoop()。砖头 set_auto_rule/list_auto_rules/delete_auto_rule(已发布)。appGuide:定期自动=set_auto_rule(和一次性 set_reminder 区分);排好 syllabus 后主动建议设每周 plan_digest。

- **本周计划表并入所有带日期的活动 + 空状态修复 + href(2026-07,Will)**:①bug:杀手用 assign_practical_task 布置带 due 的作业不进 day_plan,/plan 只读 day_plan 故看不见,且 dayPlan=null 时直接显示"还没有排期"。修:/api/day-plan GET 返回 tasks=allDatedTasks(所有带 due、未完成的 practical/assignment 作业);/plan 用 view 兜底(dayPlan 为空也渲染周历)、把作业按截止日期【只读并进】每天格子和逾期区(📝+去做链接);空状态改成"既无排期也无作业"才显示。②凡是带时间的活动都排进去:dayPlan item 加 href;add_plan_items/plan_by_day 每项支持 href(练习/practice、趣味挑战/arena、模拟考/mock、学习/study),周历条目点击直达;appGuide:任何"哪天做什么"(练习/趣味挑战/复习/作业)都用 add_plan_items/plan_by_day 排进表,作业(assign_practical_task 带 due)会自动进周历不用重复排。⚠️踩坑:python open("w") 会先截断文件,write(None) 前已清空——务必先构造好完整字符串再写。

- **排学习计划:先问全再生成、可改可同意(2026-07,Will,进行中)**:建考试/排学习进程重写。lib/studyPlan.buildStudyTimetable(userId,exam,{mode,examDate,targetDate,weeks,dailyMinutes,skipDays,replace}):按 leafKpList 的知识点序列,mode=deadline/until/weeks 压进可用学习日、open 按每天能学多久(每单元~20min)的节奏铺并估算周数;跳过 skipDays(周末=[0,6]);写进按天排期(replace)。components/PlanSetup 弹窗:把【时间要求(有考试日期/学到某天/学N周/没要求)+每天学多久+排哪些天(每天/跳周末/自定)】一次问全→POST /api/study-plan 生成→显示估算(到X日/大概N周)→去 /plan 可改或同意(Will:问完再出、出了还能改/同意)。/plan 顶部+空状态有「🗓️ 排学习计划」按钮;上一周/下一周按钮改深色。killer 砖头 build_study_plan(已发布,参数齐直接排;计划类问题应引导用户走弹窗、别在对话里追问)。【待办:把 PlanSetup 接进 onboarding 建考试完成后自动弹;i18n 补全(现缺失回退中文)。】

- **杀手排学习计划弹窗接入 + syllabus 分门别类(2026-07,Will)**:①闭环补最后一环:杀手原生工具 open_plan_setup(只读、不走写确认)——排学习进程时调用它,execTool 返回 {planSetup:{examDate}},runLoop 把它写成 step kind='plan_setup';KillerChat 轮询到该 step 就弹 PlanSetup 弹窗(planSeenRef 防重复、startPolling 重置),用户填完→/api/study-plan 生成进按天排期→去/plan 改/同意。appGuide:排学习进程先 open_plan_setup 弹窗问参数、别在对话里追问(syllabus 那种已含日期的直接 plan_from_syllabus)。②appGuide 加 syllabus 分门别类:final→母考试;quiz/midterm→exam_provision role=child+parentExamId 建子考试;assignment→add_assignment 作业助手作业;所有日期→plan_from_syllabus + set_reminder。★踩坑:JS 双引号字符串里别写内层双引号(用「」)。

- **临考(≤7天)自动弹窗·按掌握度决定推哪个 + syllabus 无 final 别乱排(2026-07,Will)**:HomeClient 距考≤7天自动弹一次冲刺弹窗(kye_sprint:{examId}:{date} 当天可"先不")。按 /api/mastery 完成度(1-弱/未学占比)三档:≥80%→原选项(去学习页自查/study + 去模拟考/mock);50–80%→「快速复习」(/practice?mode=review)优先;<50%→「先测试再复习」(/mock)优先。推荐项高亮标"推荐"、另一项作次选。原横幅按钮同步为快速复习/先测试再复习。appGuide:①学习计划要贴合各次考核,信息不够(不知道 quiz/期中考什么/没日期)必须明确告诉用户、别假装吻合;②syllabus【没有 final】就别硬套母子结构、别凭空造 final、别乱建子考试瞎排——当并列子任务排或先问主人。i18n 全语言 + 繁体 opencc 回填(每次加新键后跑 s2twp/s2hk 补 ZH_TW/ZH_HK)。

- **模拟考/复习范围收窄 + 排计划锚定考核 + 临考弹窗两档(2026-07,Will)**:①ownScope(examId)=开了 aggregate_children 的母考试→自己+子孙;否则只自己(不含兄弟/父)。/api/review、/api/mock 由 examScope(家族)改用 ownScope——不再串家族其他考试内容。②appGuide+build_study_plan 描述:排学习进程【必须锚定考核】(列出各 quiz/期中/期末/作业的范围+日期→内容卡在对应考核前→锚点间再均匀),【不准傻均匀】;均匀铺(build_study_plan)只在无带日期考核时用。③HomeClient 临考≤7天弹窗改两档:掌握度(1-弱/未学占比)≥0.7→原选项(去学习页自查/study+去模拟考/mock);<0.7→先测试再复习(/mock)优先。删掉我之前误加的「快速复习」按钮(它其实是错题重练 /practice?mode=review,Will 不认)。

- **上传作业要求文件自动更新对应作业(2026-07,Will)**:①update_assignment 砖头/lib/practical.updateAssignment——按标题匹配【一个】kind='assignment' 的作业,更新其 brief(+可选 due),只改这一个不动别的。②Materials 页/杀手上传共用的 ingestMaterialBuffer 加后台步骤 autoMatchAssignmentDoc:若上传文档是某个已有作业助手作业的具体要求,AI 匹配到【那一个】(拿不准就不动)并更新 brief,发收件箱通知。这样"先从 syllabus 建了只有名字的作业 → 后来传具体要求文件"能自动补内容,且只补对应那一个。appGuide 同步(上传作业文件→找到对应作业→只更新它,匹配不到才 add_assignment)。资料归属检查:syllabus 等课程框架文档仍要核对是不是本课/本考试的(别无脑 match)。

- **v7 报告修:P1-13 过期日期言行不一 + P1-12 批量确认无区分度(2026-07,Will)**:①P1-13:appGuide 红线——syllabus 若是过去学年、日期已过期,【绝不许】嘴上说"已智能顺延"却排进过期日期;要如实说明"这份大纲是XX学年、日期都过去了"并【问主人是否顺延】(最好让主人给真实开学日期据此平移),绝不假装顺延。②P1-12:add_assignment 改 write:false(低风险直接生成不弹确认);chatAgent 加 PLAN_SAFE_WRITES(exam_provision/add_assignment/plan_*/set_task_due/set_reminder/assign_practical_task 等)——【计划已获同意(planText)后这些低风险建作业/子考试/排期不再逐个重复弹确认】(破坏性操作仍照弹);confirmDesc 给 exam_provision/add_assignment/update_assignment/plan_from_syllabus/add_plan_items 加【带名字的独立描述】,不再 N 个相同。

- **v7 报告其余:P1-11 原始报错 + P2-10 LaTeX 泄漏(2026-07,Will)**:①P1-11:runLoop 撞 12 步上限时那句原始「(处理步数过多,已停止)」改成友好诚实文案(「我这次做了不少步先停一下,你刚让我做的很可能已在后台完成,去追杀计划看看或说继续」);appGuide:exam_provision 立即返回、后台生成,拿到 examId 就汇报并停,【绝不循环调 exam_gen_status/web_search 轮询】(那正是撞上限的根因)。②P2-10:lib/gemini.repairJsonLatex 从只加倍 \b\f\r\t 扩到【\+任意字母(除 \n 换行、\u unicode、\" \\ \/)一律加倍】——批改/讲解反馈里 \big \text \alpha \sqrt \le \cdot \vec \sin 等 LaTeX 命令在 JSON.parse 时都能存活(之前非 bfrt 的会直接让 JSON.parse 抛错、批改失败,比泄漏更严重)。③P2-11(Study 标签偶发原始 LaTeX)= KP 标题偶尔含畸形 LaTeX,生成侧小毛病,待办。

- **禁止建同名考试(2026-07,Will)**:db.examNameExists(userId,name,{parentExamId,excludeId})——同一层级(顶层 vs 顶层、同一母考试下的子考试之间)去重(去空格、忽略大小写;允许不同课都有"Quiz 1")。建考试入口都挡:exam_create、exam_provision(crossExam.js)匹配到同层同名就 throw「已经有一门同名考试…别重复建」;onboarding /api/onboarding/create 返回 400 error,前端 createExam 改普通 fetch 检查 !r.ok||d.error 弹 alert。旧的同名不追溯处理。

- **根治"问进度被当成建考试"(2026-07,Will)**:bug——exam_provision 建 CSC148(ID74)后台生成中,用户问"Is it ready?",杀手把它当成"建新考试"→建了重名 ID75、静默归档 ID74。appGuide 加根治规则:主人问「好了没/ready?/建好了没/怎么样了」= 查【那门已存在考试】的生成进度,用 exam_gen_status 如实报,【绝不】理解成创建新考试去调 exam_provision/exam_create。(叠加同名拦截双保险。)

- **v8:P2-10(批准的计划没真执行)+ P2-5(中文泄漏)(2026-07,Will)**:①P2-10 根因:杀手根本没有"切换当前考试"的工具,却嘴上说"已切到 BIO120/已锁定",练习就还在原考试(French Oral)上。加 switch_exam 砖头(archive 当前 active→set 目标 active,按名/ID,已发布);runLoop 里若工具返回 switchedExamId 则同一轮刷新 exam 变量,后续工具作用于新考试。②诚实铁律(appGuide,红线):叙述的每个状态变更必须真调了对应工具且成功才说;没工具就说做不了;要在别的考试上做事必须先 switch_exam 真切;写汇报前先逐条回顾每个工具真实结果、只报成功的、不掺假;把【每一处改动都逐条报给主人】;报告【只用大白话】,不许出现工具名/ID/ok:false 等技术词。③P2-5:open_plan_setup 返回的中文 note 去掉(英文界面会被照抄泄漏),改 uiHint、让杀手用主人语言自己说。

- **根治栏目名冒中文(P2-2/5/6/8)(2026-07,Will)**:根因=杀手对栏目名的认知是中文的(appGuide 把导航写成"追杀计划(Murder Plan)"等),英文界面照搬。不靠"别中英并列"的压制规则(Will 否掉),改【根治】:chatAgent 按 user.lang 用翻译字典动态生成栏目真实名对照(追杀计划=Murder Plan、本周计划表=Weekly plan…),非中文界面注入系统提示前置于 APP_GUIDE,叮嘱"对主人只用界面名"。appGuide /plan 描述更新为"本周计划表/Weekly plan"(旧名跨考试规划/Cross-Exam Planner 已弃)。open_plan_setup 的中文 note 已去(P2-5)。

- **v8 P2-9/P2-11:虚拟日期跨组件一致(2026-07,Will)**:dev 日期穿越下,/plan 周历默认"本周"和首页倒计时用了真实 Date.now()、没跟虚拟今天。修:/plan 周基准改用 view.today(服务端 todayStr,含 devtime 偏移);HomeClient 倒计时 days 用 daily.plan.date(虚拟今天)算,没加载到才回退真实今天。真实用户无穿越时 = 真实今天,零回归。

- **通用对话内参数表单 ask_user_form(2026-07,Will)**:任何需要主人给几项参数的场景通用,内嵌在聊天里(像确认框),不再弹窗/一条条问。机制:chat_runs 加 form_json;chatAgent 原生工具 ask_user_form(title+fields[{key,label,type:text/number/date/select/radio/checkbox,options,default,placeholder,required}]);runLoop【表单门】——模型调它就 pending_kind='form'、存 form_json+pending_contents/calls 暂停;resumeForm 把主人填的 values 作为 ask_user_form 结果注入、继续 runLoop;/api/chat/run GET 返回 form,/api/chat/resume 收 formValues→resumeForm。UI:components/DynamicForm 按 fields 渲染各类型字段,KillerChat pending.kind==='form' 内嵌渲染、提交走 resume。PlanSetup 也加 inline 模式、KillerChat 里改成聊天内嵌而非全屏弹窗。appGuide 指引:要参数用 ask_user_form 一次问全、只放真正缺的字段。
