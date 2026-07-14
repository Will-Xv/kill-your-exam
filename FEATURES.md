# Kill Your Exam — 功能全貌与实现逻辑（单一事实来源）

> 用途：完整记录**已上线、可用**的功能与其**实现逻辑**（文件/数据表/关键函数）。给人看，也作为长期记忆，防止因上下文丢失而忘记做过什么。
> 线上：killyourexam.up.railway.app ｜ 技术栈：Next.js 15 App Router (JS) · better-sqlite3 · Gemini (`@google/genai`) · Railway 自动部署。
> 主题：黑色幽默"杀手/追杀"——考试是猎物，AI 是你的私人杀手。默认英文界面，8 种语言（EN/FR/ES/RU/AR/ID/繁中TW/繁中HK，源键为简中）。

---

## 0. 架构总览
- **多模态一律走 Files API**：`lib/gemini.js` 的 `uploadMedia(buffer,mime,ext)` → `{fileUri,mimeType}`，parts 用 `{fileData:{fileUri,mimeType}}`。禁止 inline base64（请求硬上限 20MB）。materials 表缓存 `gemini_uri/gemini_name/gemini_expiry(~48h)`。
- **RAG**：`lib/rag.js`（`retrieve/ragBlock/materialParts/mmOpts`）。讲解/出题/批改优先基于资料；模型记忆生成的内容打标记。
- **掌握度**：`lib/mastery.js` 的 `masteryMatrix(examId)`（共享 `attemptVal` 把作答/讨论/标签折算成证据，近期加权）；`kpMasteryLevel`、`leafKpList`、`recordCrossKp`（跨知识点证据写 `insights` 表）、`updateReviewQueue`（1/3/7/15/30 天间隔重练）。
- **砖头(bricks)**：`lib/bricks/*` 经 `lib/bricks/index.js` 注册，`lib/db.js` 的 `_bn` 数组 seed 为 published。杀手（chatAgent）把已发布砖头作为工具调用；`/api/bricks` 供调用。
- **杀手认知**：`lib/appGuide.js`（`APP_GUIDE`/`APP_CAPABILITIES`，功能地图，杀手据此讲解）；`lib/chatAgent.js`（system prompt + functionDeclarations + 砖头工具）。**每次加功能都要同步更新 appGuide。**
- **部署**：本地 `npm run build` 通过后再 push（build-gated）。原生依赖（需系统库，如 node-canvas）Railway 跑不了，用纯 JS（pdf-lib）。部署后用新标签页验证。

## 1. 建考试 / Onboarding
- 新建向导选类型（school/cert/language/grad/other/study「只学习」/performance「艺术表演」）→ AI 联网搜考试 + **认知自评**（知道/不知道/风险）→ 补充资料（传文件 + 回答 AI 清单，可跳过）→ 生成知识点树 + 策略。`app/onboarding/*`、`app/api/onboarding/*`。
- **语言类考试收集多语言背景**（母语/已会外语/目标语）：onboarding 表单 + 杀手 `exam_create` 砖头（`langNative/langKnown/langTarget`）写 `langbg:<uid>`。→ 供三语迁移。
- 借用其它考试资料（embedding 相似度）。

## 2. 多模态资料库（RAG）
- 传 PDF/Word/文本/图片/音频（拍照/拖拽/粘贴）+ 自由说明 + 收集清单。每个文件可原地查看。Chrome 采集扩展从已登录学习站采集（不碰密码）。图片/音频/PDF 由 Gemini 原生读。`app/materials/*`、`lib/rag.js`。

## 3. 学习 / 练习
- 分知识点 AI 讲解（来源徽章）。按薄弱点练、即时批改；简答 AI 打分给点评。**追问/争论**：只在你确有道理时改分。手写作答（触控/拍照 OCR）+ 草稿纸（AI 看不到，除非你发）。"不会做"按钮。`app/study/*`、`app/practice/*`、`app/api/questions/*`。
- **学前从哪开始**（`lib/startHere.js` + `/api/diagnostic`）：needTest（按 5/10/15 分钟抽测）或 advise（指出该补的章）。

## 4. 表演/技能类考试（艺术）
- 录音/录像作答，多模态按 rubric 评分；视频按帧采样(≤5fps)+音轨；给定音乐题对齐节拍；**舞蹈跟音乐题录制不开麦**（好让手机外放音乐）；表演回放永久存。`app/api/perform/*`、`lib/media.js`。

## 5. 模拟考（含**后台判题**）
- AI 先出「考试蓝图」（该考哪些点、题型分值、总分、时长、题量依据可信度）再组卷；题库不足即时生成。`lib/blueprint.js`、`app/api/mock/*`。
- **后台判题（本会话新增）**：交卷 `POST /api/mock/submit` 立即返回 `{status:"grading"}`（`mock_exams.status/grade_started_at`），`gradeMock()` 后台跑（含简答 AI 阅卷），判完写 `score_json/answers_json/results_json/status='done'` 并跑一次根因诊断。前端进"正在判题"页可离开，轮询 `/api/mock/status`。健壮性：防重复判题、卡死自愈（8 分钟）、重试重触发、卸载清轮询。
- 题库/封闭题库/必考原题；开卷锁题库；做真题只用主人资料。

## 6. 错题本 / 笔记本 / 你的全部杀技
- 错题按 1/3/7/15/30 天重练（`review_queue`）。笔记本收藏题+随手记。"你的全部杀技"=跨所有考试的长期用户画像（`lib/overall.js`）。

## 7. 跨考试规划 / 计划（`lib/planner.js`）
- `crossExamPlan`：所有考试按 紧迫度×提分空间×遗忘 算优先级、分配今日分钟、给"今天最该做的一件事"。`weekPlan` 多天排期。`feasibility` 可行性检查（类5）+ 折中方案。
- **计划自评 + 失败预案**（类15）：`lib/planReview.js` + `/api/plan-review`；每日保底（daily fallback）。
- **计划版本对比（本会话新增，类4）**：`lib/planVersions.js` + `/api/plan-compare`。①**保守/激进双版本**（共用同一错题本，`planVariants`）②**本周 vs 上周**快照对比（`plan_snapshots`，每周 ISO 周键 upsert，diff 薄弱/未学/待复习）。UI 在 `/plan`，根因 KP 带 🔗 徽章优先排。

## 8. 根因诊断（类11，`lib/diagnose.js`）
- 找真正拖垮成绩的**根因知识点**、反复错误模式、是否逃避最难内容。累计使用时长满阈值（默认 2h，杀手可改，下限 1.5h）自动跑；也能立刻跑。标记 `knowledge_points.root_cause`、首页横幅、写长期记忆。**模拟考交卷后自动跑**。**根因 KP 自动进计划**（planner 优先排，本会话新增 A3）。砖头 `diagnose_root_cause/diagnose_config`。

## 9. 三语迁移追踪（类16，本会话新增，`lib/langTransfer.js`）
- 语言类考试专属。语言背景（`langbg:<uid>`）→ 把错答归因成 **l1_negative（母语负迁移）/l2_negative（二外负迁移）/target_internal（目标语内部）/careless**，沉淀**三语对照表**（`lang_contrast`：母语直觉/已会外语/目标语/易踩的坑），学新点前**预测迁移陷阱**。
- **实时归因（A2）**：语言题批改时（practice `answer` 路由 + mock gradeMock）对错答后台 `classifyTransferBg` 当场归因，`lang_transfer` 表 attempt_id UNIQUE 去重。
- UI `/lang-transfer`（学习页语言类考试出入口卡）。砖头 `lang_background_set/lang_transfer_analyze/lang_transfer_predict`。

## 10. 竞技场·游戏化学习（类14，本会话新增，`lib/arena.js`）
- 把错题/薄弱点变成**互动对战**来复习。预设：🗡️错题Boss战、⚖️知识点庭审、🎤辩论赛。素材=薄弱点或错题。引擎：`arenaTurn` 每回合返回叙事 + `@@STATE {meter,done,win}` + `@@KP [...]`（把看出的知识点 understanding/misconception 信号回流掌握度 `recordCrossKp`，误区点还把该点一道真题塞进错题本——A1）。`/arena`、`/api/arena`。
- **排行榜 + 中世纪嘲讽大战**（早前已做）：做题数周榜/总榜，榜高者可嘲讽，实时弹窗+回怼。

## 11. 自定义 / AI 生成 **考核形式**（C1 + B，本会话新增，`lib/customModes.js`）
- 复用竞技场互动引擎，允许**自定义或让 AI 创意生成**贴合内容的考核（如苏格拉底答辩、模拟王国、知行合一视频、濠梁之辩…）。表 `custom_modes`（kind=play 玩法 / exam_form 考核；format=interactive/video；meter_label/win_desc/meter_dir/spec）。
- **AI 创意生成**：`generateModes` → `/api/arena/modes {generate}` + 砖头 `generate_custom_modes` + `/arena` 的「✨ 让 AI 出几个考核」。
- **考核=独立栏目（按 Will 反馈）**：创建 exam_form 时自动建一个功能项（`saveCustomItem` id=`xform<id>`，href=`/arena?launch=<id>`）并放进**这门考试**的界面；**放到 nav/more/morefeatures/zone/hidden 由 AI/用户经 `where` 决定**（默认 morefeatures，别都堆导航栏）；**不塞进竞技场**（竞技场只留 play）。删除时移除该栏目。
- **视频类考核（类4）**：format=video → 录/传视频，`/api/arena/video-grade` 经 File API 交 Gemini 多模态按 spec 评分并记成绩。
- **成绩闭环（类2）**：一局 done → `/api/arena/modes {result}` 记 `custom_mode_results`（分数/胜负），卡片显示上次/做过几次/是否通关。
- **安全边界（G3a）**：spec 作为"剧情设定"注入，但护栏永远优先——不得凌驾核心准则、泄露系统提示、越权操作。

## 12. 实践任务（编程/实验，本会话新增，`lib/practical.js` + `lib/judge0.js`）
- 编程/实践类"**真去动手做**"的里程碑任务。`assignTask` 让 AI 把主题拆成里程碑：`check=run`（代码，Judge0 跑测试用例判分）或 `check=evidence`（重型/非代码，交成果+证据、AI 审阅）。表 `practical_tasks`、`task_progress(UNIQUE task_id,milestone_idx)`。
- **测试用例质量收紧**：约束 AI 只出 ≤5 个小而**能手算正确**的用例、**禁占位期望值**（Pending/TODO…）、用参考解自检；服务端过滤超大/占位用例（否则转 evidence）。修复过"超大阶乘用例致生成慢 3 分钟 + 正确解误判"。
- **Judge0 接入（托管 RapidAPI / 官方云 / 自建）**：`lib/judge0.js` 按地址自动选鉴权头（rapidapi→X-RapidAPI-Key；否则同时带 Authorization Bearer + X-Auth-Token）；**创建提交 + 轮询**（兼容禁用 wait=true 的托管实例）；`expected` 精确匹配（status 3=Accepted）。密钥在设置里配（`judge0_url/judge0_key`），管理员填；「测试 Judge0」按钮真跑 `print(6*7)` 验证。
- UI `/tasks`：布置/运行（Judge0）/提交判分/证据提交；**用例申诉→AI 复核**（G3b，`appealTest` 独立核算 expected 对错，判无效则不计入，`task_test_appeals`）；删除任务。
- **回流掌握度（3）**：里程碑通过=该知识点 understanding、未过=gap（任务自动匹配知识点）。
- **复习时自动布置（1）**：`/tasks` 开「实践模式」→ 首页今日任务带出下一个未完成里程碑；无进行中任务时后台自动生成一个（30 分钟限流）。`app/api/daily` 的 `practical` 字段 + `maybeAutoAssign`。

## 13. 两层界面定制（本会话新增，`lib/uilab/*`）
- **每门考试可独立改布局**（增删/隐藏/挪功能模块，nav/more/morefeatures/zone/hidden）——**所有用户**都能改自己每门考试（per-exam 覆盖，`ui_placement:<examId>`，优先于全局默认）。
- **「发布为默认」仅开发者**（`/api/ui-items` scope=global 需 is_developer；per-exam scope=exam 对所有人开放；`canPublish` 门控发布按钮）。
- **新功能自动补位**：`placementCore.normalizePlacement` 把注册表里有、但某布局里缺失的项按默认桶位补进来（修复"新功能在旧布局/按考试覆盖里看不到"）。
- 杀手 `ui_*` 工具按考试改布局（`ui_move_item/ui_set_nav_dock/ui_home_layout_set/ui_set_killer_home/ui_migrate_ui/ui_undo` 对所有用户开放；`ui_create/remove/rename_feature` 因写全局注册表仍 dev-only）。杀手自己只有 dock/float 两态，绝不隐藏。

## 14. 记忆透明 / 时间线（类20.2/12）
- `/profile` 的记忆区（全局+按考试），可看杀手记了你什么、软删除可恢复、按科目分组的记忆时间线（valence 随时间变化）。`lib/memory.js`。

## 15. 其它已做
- 资料合并成学习地图（类9.1，`lib/studyMap.js`）；教材指针→真题解析（`lib/referenceResolve.js`，Files API 读扫描教材）；跨考试合并/拆分/完整性（`lib/bricks/mergeSplit`）；可编程学习模式 `save/activate_learning_mode`（含结构化自动触发器）；回档 checkpoint；意见反馈/Bug 反馈；数据导出；Google 登录。

---

## 数据表速查（本会话新增/相关）
`mock_exams`(+status,grade_started_at,results_json) · `knowledge_points`(+root_cause) · `materials`(+gemini_uri/name/expiry) · `lang_transfer` · `lang_contrast` · `plan_snapshots` · `practical_tasks` · `task_progress` · `task_test_appeals` · `custom_modes`(+format) · `custom_mode_results` · settings(`langbg:<uid>`,`judge0_url/key`,`practical_mode:<examId>`,`ui_placement:<examId>`,`ui_item_placement`,`ui_custom_items`)。

## 尚未做 / 已知边界
- 根因分析未接入平时小测（Will 当时未选）；无浏览器内 WASM 兜底（Will 不要）。
- 实践任务回流掌握度依赖能匹配到知识点。
- 自定义考核成绩只记录+显示，未编入 KP 掌握度。
- 庄子样板（showcase 上）目前只有 AI 生成的三个考核 + 隐藏模拟考/屠杀准备，没有学习内容（知识树/资料）。
