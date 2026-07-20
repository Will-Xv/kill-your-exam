# Kill Your Exam — 完整功能与实现逻辑（单一事实来源 / SSOT）

> **用途**：完整、详细地记录**已上线可用**的每一项功能及其**实现逻辑**（页面路由 / API / lib 模块 / 数据表 / 关键函数）。既给人看，也作为长期记忆，防止上下文丢失后忘记做过什么。**每次新增/改动功能都要同步更新本文件、`CLAUDE.md`、`lib/appGuide.js`。**
> **线上**：killyourexam.up.railway.app ｜ **栈**：Next.js 15 App Router (JS) · better-sqlite3(单文件 `/data`) · Gemini `@google/genai` · Railway 单容器 Docker 自动部署。
> **主题**：黑色幽默"杀手/追杀"——考试是猎物，AI 是你的私人杀手。默认英文，8 语言（EN/FR/ES/RU/AR含RTL/ID/繁中TW/繁中HK，源键=简中）。

---

## 一、设计原则
1. **考试无关**：所有考试内容在数据库，代码零硬编码；新考试=新建工作台。
2. **透明优先**：AI 每步声明知道/不知道/依据；模型记忆生成的内容打明显标记，宁可说"不确定"。
3. **资料为地基（RAG）**：讲解/出题优先基于用户资料。
4. **零学习成本**：打开就知道今天做什么；聊天是万能入口但非必经。
5. **能力固定、编排可变**：底层是一套固定"原子能力/砖头"，界面与 workflow 可定制，但每个功能始终找得到。
6. **可回退**：结构性改动前快照，可逐级 rollback。

## 二、跨领域基础设施
- **鉴权** `lib/auth.js` / `app/api/auth/*`：用户名+密码（sha256+salt）或 Google OAuth（`lib/googleAuth.js`）。首个注册账号=管理员；`sessions` 表、一年免登录 cookie；邀请码 `ACCESS_CODE`。开发者子账号有调试权。
- **数据库** `lib/db.js`：better-sqlite3，`/data` 卷持久化。启动时跑一长串 `ALTER/CREATE` 幂等迁移。核心 helper：`getActiveExam`、`examScope/familyScope/scopeSql/inScope`（考试家族树作用域）、`getSetting/setSetting`、`getDocument/upsertDocument`。
- **Gemini** `lib/gemini.js`：`generate`（支持 `jsonSchema`/`system`/`contents`/`useSearch`/`tools`）、`generateJson`（解析+1次重试+`repairJsonLatex`）、`generateText`、`searchWeb`(grounding 带来源)、`embed`/`cosine`、`readImage`、`attachParts`。密钥/模型在设置里（`gemini_api_key/gemini_model/gemini_embed_model`）。
  - **★ Files API 铁律**：凡文件（图/PDF/音/视频）传 Gemini 一律走 `uploadMedia(buffer,mime,ext)`→`{fileUri,mimeType}`，parts 用 `{fileData:{fileUri,mimeType}}`。禁 inline base64（请求硬上限 20MB；PDF 走 Files API 可 50MB/1000 页）。存储型资料缓存 `materials.gemini_uri/gemini_name/gemini_expiry(~48h)` 复用。inline 仅作小文件上传失败兜底。
- **RAG** `lib/rag.js`：`retrieve`（embedding 检索 chunks）、`ragBlock`、`materialParts`(异步，返回多模态 fileData parts，含 pdf)、`mmOpts`。`lib/webMedia.js` 把联网资料里的图/图表也存成图片资料。
- **错误分类** `lib/errors.js`：`aiErrorResponse` 把 AI/API 错误分类，前端明确告诉用户"是 API 的问题、不是你操作错"。
- **i18n** `lib/translations.js`：8 字典，源键=简中，`t()` 在 zh 原样返回。新键要同步加 8 个字典（TW/HK 可用 `lib/s2t.js` 或 opencc s2twp/s2hk 从简体机械转）。当前 8 语言各 1261 键、零缺失。
- **地区/语言** `lib/geo.js`（IP→默认语言，服务器查询不受墙）。**推送** `lib/notify.js`/`lib/pushClient.js`/`app/api/push`（VAPID Web Push，分类偏好，iOS 加主屏提示）。
- **定时器** `lib/cron.js`：Railway 常驻进程内 setInterval 跑 session/每日每周级触发器（`app/api/triggers/tick`）。
- **客户端持久化**：IndexedDB `lib/idb.js`（大附件）、localStorage（草稿/布局草稿）。
- **部署**：build-gated push（本地 `npm run build` 过才 push）；原生依赖（需系统库如 node-canvas）Railway 跑不了，用纯 JS（pdf-lib `lib/pdfSplit.js`）；`lib/media.js` 用 ffmpeg（视频抽帧/转码/节拍）。部署后用新标签页验证。

## 三、建考试 / Onboarding（`app/onboarding` · `app/api/onboarding/*`）
- 向导：选类型（school/cert/language/grad/other/study「只学习」/performance「艺术表演」）→ `assess` AI 联网搜考试 + **认知自评**（✅有把握/❓不确定/🚫需资料/⚠️风险 + 参考网页）→ 补充资料（传文件+回答 AI 清单，可跳过）→ `finalize` 生成知识点树+策略（`lib/provision.js` 后台建，`exam_gen_status` 查进度）。`draft` 断点续建。
- **语言类考试收集多语言背景**（母语/已会外语/目标语）：onboarding 表单 + 杀手 `exam_create`（langNative/langKnown/langTarget）→ 写 `langbg:<uid>` → 供三语迁移。
- 借用其它考试资料：`app/api/exam/related`（embedding 相似度）+ `exam/borrow`。

## 四、多模态资料库 / RAG（`app/materials` · `app/api/materials/*`）
- 传 PDF/Word(`mammoth`)/文本/图片/音频（拍照/拖拽/粘贴）；自由"其他说明"栏；资料收集清单（可问答填）。每个文件原地查看：图直显/音频播放/PDF 内嵌/文本提取（`materials/content`、`materials/raw`）。原件完整保存。
- **超大 PDF**：`lib/pdfSplit.js` 抽页/拆 ≤18MB 片；扫描版走 Gemini 原生读。
- **Chrome 采集扩展**（`extension/`）：从已登录学习站采内容（含图/音/PDF）进资料库，不碰密码；`app/api/ingest` + 采集令牌 `ingest_tokens`；Agent 模式可自动翻页采（只读、禁点提交/购买/删除）。`app/collector`。

## 五、知识点树 & 掌握度（`app/study`,`app/knowledge` · `lib/mastery.js`）
- 个性化知识地图，按掌握度着色（mastered/ok/weak/unlearned）+ 资料覆盖点（🟢🟡⚪）。`knowledge_points`（含 parent_id 章节、sort、root_cause）。
- **掌握度=理解而非对错**：`masteryMatrix(examId)` 共享 `attemptVal(a)` 把作答/简答推理/讨论/标记折算成证据，**近期加权**；`kpMasteryLevel`、`leafKpList`、`examSummary`（weak/rootCauseKps）。
- **跨知识点推断** `recordCrossKp`：在别的题/讨论里体现出对某点的理解→点绿、误解→点红，写 `insights` 表。
- **重建树 + 语义状态重映射** `app/api/kp/rebuild` → `rebuildKnowledgeTree`（`lib/generators.js`）：重建前打 **checkpoint**；建新树后**用 embedding 把旧叶子知识点与新叶子做 cosine 匹配（≥0.5）**，得 `旧KP→新KP` 映射，把 `questions.kp_id / attempts.kp_id / insights.kp_id` **从旧点重映射到语义最近的新点**（未命中置 NULL）。保留策略：**keep**=迁移原始作答+观察到新点；**summarize**=AI 把每个旧点表现浓缩成一句挂到匹配的新点（删原始作答）；**none**=清空。→ **这就是"知识点语义映射/state remapping"的现成实现**，Recipe 结构重切直接复用它。
- 讲解 `app/api/kp/explain`（来源徽章：基于资料 vs 模型知识；`explanations` 缓存）。**该从哪开始** `lib/startHere.js`+`app/api/diagnostic`：needTest(5/10/15分抽测)或 advise(指该补的章)，可接模拟考。

## 六、学习 / 练习（`app/practice` · `app/api/questions/*`）
- 按薄弱点出题（`lib/generators.js`：真题/网上题/AI 生成，来源标注；`gen_lessons` 出题经验）；即时批改。简答 AI 打分+点评（`answer` 路由，`crossKp` 跨点信号）。
- **追问/争论** `questions/discuss`(+`finalize`)：只在你确有道理时改分；讨论中的理解/误区沉淀进掌握度。**任何方式离开都记（2026-07）**：切走/换题/关页用 sendBeacon 把这段讨论沉淀进掌握度（Discuss 不跨刷新保存，卸载记录安全）。
- **手写作答**（触控/手写板/鼠标，橡皮擦）或拍照上传，OCR 批改；每题**草稿纸**（AI 看不到，除非点「📝发草稿纸」）。**"不会做"**按钮（记 0 分不惩罚性拉低）。
- **作答标记** `lib/attemptTags.js`：careless/guessed/slow（校准掌握度）+ 任意自定义标签（labels，±0.4 影响掌握度矩阵）。"题目有问题"反馈 `questions/report/flag`（AI 分析错因、确有问题才删题改进）。
- **难度档** `lib/difficultyPref.js`（1易~3难，每考试）。

## 七、表演/技能类考试（艺术：表演/播音/舞蹈/声乐/口语/演讲）（`app/performances` · `app/api/perform/*`）
- **录音/录像作答**，多模态按 rubric 评分。视频走 File API、按帧采样(≤5fps,720p)+抽音轨（`lib/media.js` ffmpeg），任意时长无大小/超时限制。给定音乐题对齐节拍（`detectBeats`）；`lib/music.js` 联网找免版权整曲。**舞蹈跟音乐题录制不开麦**（好让手机外放音乐，只按画面+所给音乐评分）。表演回放永久存 `performances`。艺术类考试**只出表演题**（要练笔试建议另建普通考试）。

## 八、模拟考（`app/mock` · `app/api/mock/*`）
- **考试蓝图** `lib/blueprint.js`：AI 先规划该考哪些点、题型分值、总分、时长、**题量**（照真实题量，不再默认20）、结构依据可信度徽章（✅官方/📄推测/🔮预估）；按蓝图组卷、题库不足即时生成。`customize_mock_blueprint` 杀手可重排。
- **题库/封闭题库/必考原题** `lib/questionBank.js`（`mock/bank`）：粘贴已知一定考的题（一字不改入库）、标"必出"（每次原样置卷首）、"封闭题库"开关（练习+模拟只从主人题里出、绝不生成）。做真题只用主人资料。
- **★ 后台判题**（本会话）：交卷 `mock/submit` 立即返回 `{status:"grading"}`（`mock_exams.status/grade_started_at`），`gradeMock()` 后台跑（含简答 AI 阅卷、多模态附件），判完写 `score_json/answers_json/results_json/status='done'` 并跑一次跨章节根因诊断。前端进"正在判题"页（可离开），轮询 `mock/status`。健壮性：防重复判题、8 分钟卡死自愈、重试重触发、卸载清轮询。`mock/rescore`(争论改判重算)、`mock/history`、`mock/att`。

## 九、错题本 / 复习 / 笔记本
- **错题本** `app/mistakes` · `review_queue`：错题按 1/3/7/15/30 天间隔重练（`updateReviewQueue`）；"我已理解"移出；`recomputeReviewFromAttempts` 按合并时间线重放。
- **笔记本** `app/notes` · `notes`：收藏题（做题后「记笔记」）+ 随手记，可编辑删除，杀手 `list_notes` 可读。
- **你的全部杀技** `app/profile` · `lib/overall.js`：跨所有考试的长期用户画像（单独永久文档），每门考试都读它，里程碑自动更新。

## 十、跨考试规划 / 计划（`app/plan` · `lib/planner.js`）
- `crossExamPlan`：所有顶层考试按 紧迫度(考期)×提分空间(薄弱/未学)×遗忘(到期复习) 算优先级、分配今日分钟、给"今天最该做的一件事"；根因 KP 优先排（🔗徽章）。`weekPlan` 多天排期。
- **可行性检查（类5）** `feasibility`：需时 vs 可用时，>1.2 报警 + 折中方案（快速测/直接练/延长/冲刺）。
- **计划自评+失败预案（类15）** `lib/planReview.js`+`plan-review`：AI 审视计划哪里可能错、砍低收益、附失败预案；每日保底（daily fallback）。
- **计划版本对比（类4）** `lib/planVersions.js`+`plan-compare`：①**保守/激进双版本**（共用同一错题本，`planVariants`）②**本周 vs 上周**快照对比（`plan_snapshots` 每周 ISO 周键 upsert，diff 薄弱/未学/待复习）。
- **今日任务(2026-07-19 重构为固定三条)** `app/api/daily` · `lib/planner.js:currentDailyItems`：
  1. **到期错题**；
  2. **自由练习薄弱点**——只练【根因+薄弱】(不含未学)。优先【当前周期】(=`upcomingCycles` 取家族里最近一个未到的带日期考核)覆盖范围；本周期薄弱练完才回捞旧薄弱，界面标明「补旧薄弱·不在「<该考核名>」的范围内」(`weakAnchor` 返回 `outOfCycle`)；
  3. **学一个新知识**——当前周期内**按单元顺序**(masteryMatrix 已按 章节sort→点sort)取第一个 `attempts < 8` 的知识点(`newKnowledgeNext`)。做够 8 题(`NEW_KP_TARGET`)=该点学完，学完当天即可换下一个 ⇒ **按完成推进、不跟日期走**；另有**今日建议 N 题**配额(`newKpDailyTarget`=每天分钟/10，夹在 3~12)，配额**跨知识点**累计(统计 `mode='kp'` 的当日做题数)；界面把「今日 x/N」与「该知识点 y/8」分开显示——**打勾≠知识点学完**。本周期无新知识 ⇒ 该条自动完成，下周期内容作「可选·超前学」不计入完成。
  实践模式**同样三条**(不再砍成"复习+轻量练习")；学习配方的方法作用在第③条上。上传/删资料自动重排；跨考试其它考试的今日分配也带回首页；根因/资料解析横幅；开实践模式带出实践作业。

## 十一、根因诊断（类11 · `lib/diagnose.js` · `app/api/diagnose`）
- 找真正拖垮成绩的**根因知识点**、反复错误模式、是否逃避最难内容。累计使用时长满阈值（默认 2h，杀手可改，下限 1.5h）`bumpUsageAndMaybeDiagnose` 自动跑；也能立刻跑。标 `knowledge_points.root_cause`、首页横幅、写长期记忆。**模拟考交卷后自动跑**。**根因 KP 自动进计划**（A3）。砖头 `diagnose_root_cause/diagnose_config`。

## 十二、三语迁移追踪（类16 · 语言类考试 · `lib/langTransfer.js` · `app/lang-transfer`）
- 语言背景（`langbg:<uid>`）→ 错答归因 **l1_negative(母语负迁移)/l2_negative(二外负迁移)/target_internal(目标语内部)/careless** → 三语对照表（`lang_contrast`：母语直觉/已会外语/目标语/易踩坑）→ 学新点前**预测迁移陷阱**。**实时归因（A2）**：语言题批改时（practice/mock）后台 `classifyTransferBg` 当场归因（`lang_transfer` attempt_id UNIQUE 去重）。砖头 `lang_background_set/lang_transfer_analyze/lang_transfer_predict`。

## 十三、竞技场·游戏化学习（类14 · `lib/arena.js` · `app/arena` · `app/api/arena`）
- 把错题/薄弱点变**互动对战**：🗡️错题Boss战 / ⚖️知识点庭审 / 🎤辩论赛 + 自定义 play 玩法。素材=薄弱点或错题。引擎 `arenaTurn` 每回合返回叙事 + `@@STATE{meter,done,win}` + `@@KP[...]`（看出的知识点 understanding/misconception 回流掌握度 `recordCrossKp`，误区点把该点一道真题塞进错题本——A1）。**竞技场只放 play；考核形式(exam_form)不在这里**。
- **排行榜+中世纪嘲讽大战**（`app/leaderboard` · `lib/leaderboard.js` · `taunts`）：做题数周榜/总榜（前三+展开全榜/独立页），榜高者可嘲讽任意人，实时全屏弹窗+回怼("不屑")+再嘲讽，中世纪手绘贴画；开发者不上榜。

## 十四、自定义 / AI 创意 **考核形式**（C1+B · `lib/customModes.js` · `app/api/arena/modes`）
- 复用竞技场互动引擎。`custom_modes`（kind=play 玩法 / exam_form 考核；format=interactive/video；meter_label/win_desc/meter_dir/spec）。
- **AI 创意生成** `generateModes`（`/api/arena/modes {generate}` + 砖头 `generate_custom_modes` + `/arena` 的「✨让AI出几个考核」）：针对这门内容想出贴切考核（如苏格拉底答辩、模拟王国、濠梁之辩）。
- **考核=独立栏目**：创建 exam_form 自动建功能项（`uiRegistry.saveCustomItem` id=`xform<id>`，href=`/arena?launch=<id>`）并放进这门考试界面；**放到 nav/more/morefeatures/zone/hidden 由 AI/用户经 `where` 决定**（默认 morefeatures，别都堆导航栏）；删除时移除该栏目。
- **视频类考核（类4）** `format=video`：录/传视频，`/api/arena/video-grade` 经 File API 交 Gemini 多模态按 spec 评分并记成绩。
- **成绩闭环（类2）**：一局 done → `/api/arena/modes {result}` 记 `custom_mode_results`（分数/胜负），卡片显示上次/做过几次/是否通关。
- **安全边界（G3a）**：spec 作为"剧情设定"注入，护栏永远优先（不得凌驾核心准则/泄露系统提示/越权）。

## 十五之二、上传文件做题（`app/upload-quiz` · `app/api/quiz-upload`）
- 独立入口「上传做题」(feature `quizupload`)。传一份带题目的文件(图片/PDF/文档)→`quiz-upload` 多模态(attachParts/File API)识别出**每道题**(题干/选项/qtype),**文件没给答案就让 AI 解出正确答案**(为了判分;区别于 bank_paste 只存真题不解题)→每道题 `embed`+`cosine` **语义就近绑一个叶子知识点**(匹配不到就绑最接近的)→入 `questions`(kp_id 设好、origin=upload、is_real=1)。
- **改走练习页(2026-07)**:`/upload-quiz` 只上传+识别,拿到题 id 后跳 `/practice?mode=quiz&ids=<csv>`,把上传的题载进【练习页】复用全套体验(独立无杀手、追问/争论、草稿纸、手写、刷新恢复)。新增 `app/api/questions/byids`(按 id 顺序返回题);练习页 `mode=quiz` 分支走 byids、关预取、storeKey 含 ids 使刷新保留。掌握度仍靠 `/api/questions/answer` 的 `attempts.kp_id` 自动记进对应知识点。数学渲染:抽题提示词严禁把整句正文包进 $...$(否则 KaTeX 整段当公式),只用行内 $ 包公式本身+正确 LaTeX。
- **重新识别/重新上传 + 去出题标(2026-07)**:quiz 模式"题目有问题"→两选项(重新识别上传的文件 / 重新上传文件)。`quiz_sessions` 存上传文件 File API parts(约48h)+题id,URL 带 `quiz=<sid>`;`quiz-upload` 支持 `reRecognize`(复用 parts 重跑、删掉未作答的旧题)。quiz 模式隐藏「换一批」「AI出题/真题」徽章。

## 十五、实践作业（编程/实验 · `lib/practical.js` + `lib/judge0.js` · `app/tasks` · `app/api/tasks/*`）
- **仅编程/STEM 专属**（不在全局默认界面里）。`assignTask` 让 AI 把主题拆里程碑：`check=run`（代码，Judge0 跑测试用例）或 `check=evidence`（重型/非代码，交成果+证据 AI 审阅）。`practical_tasks`、`task_progress(UNIQUE)`。
- **用例质量**：约束 AI 只出 ≤5 个小而能手算正确的用例、禁占位期望值、用参考解自检；服务端过滤超大/占位用例（否则转 evidence）。
- **Judge0**：`lib/judge0.js` 按地址自动选鉴权（rapidapi→X-RapidAPI-Key；否则同时带 Authorization Bearer + X-Auth-Token）；**创建提交+轮询**（兼容禁用 wait 的托管实例）；`expected` 精确匹配（status 3=Accepted）。设置里 `judge0_url/judge0_key`（管理员填），「测试 Judge0」按钮真跑 `print(6*7)` 验证。
- **用例申诉→AI 复核（G3b）** `appealTest`：独立核算 expected 对错，判无效则不计入（`task_test_appeals`）。删除任务；`run`(只运行)/`submit`(判分+存)/`detail`。
- **回流掌握度（3）**：里程碑通过=understanding、未过=gap（任务自动匹配知识点）。
- **子考试样式呈现（2026-07）**：实践作业在首页「子考试/任务」栏里以子考试样式条目列出（🛠+进度 done/total/已完成、带 ⏳截止），**与真子考试混在一起按截止日期升序排**（子考试用 `exam_date`、任务用 `due_date`，无日期排最后）；点条目 `/tasks?task=id` 直达。今日任务只要有未完成任务即显示其进度（不再限实践模式；横幅直达）。`lib/practical.listTaskSubs` 供 homeData。**刻意不建真 `exams` 行**（不进 planner/模拟/资料/竞技场，因此无自己的学习计划——Will 的设计）；旧任务自动即此形态。
- **一次多道（多道一起 · 2026-07）**：`assign_practical_task` 支持 `topics` 数组（JSON 文本，上限6）→ 一个工具调用建多道、**只弹一次确认**（并行生成）；appGuide 要求"配方要 N 道就用 topics 一次布置，绝不一道道分开调用"——否则写确认框会一个接一个弹（此前"确认反复弹"的根因）。
- **数学渲染（2026-07）**：任务简介/里程碑标题与描述改走 `MD`（含 KaTeX），`$...$` 正常渲染（此前是纯 `<p>` 文本、不渲染）。
- **复习自动布置（1）**：`/tasks` 开「实践模式」→ 首页今日任务带出下一个未完成里程碑；无进行中任务后台自动生成（30 分钟限流，`maybeAutoAssign`）；开启时自动把 tasks 栏目放进这门考试首页。

## 十六、两层界面定制（`lib/uilab/*` · `lib/uiPlacement.js` · `app/api/ui-items`）
- **每门考试可独立改布局**（增删/隐藏/挪功能，nav/more/morefeatures/zone/hidden）——**所有用户**都能改自己每门考试（per-exam 覆盖 `ui_placement:<examId>`，优先于全局默认）。**「发布为默认」仅开发者**（scope=global 需 is_developer；scope=exam 对所有人；`canPublish` 门控发布按钮）。
- **新功能自动补位** `placementCore.normalizePlacement`：注册表里有、布局里缺失的项按默认/参考表桶位与**原有次序**补进来（遵守最小改动，不重排已有栏目）。
- **自定义功能项** `lib/uiRegistry.js`（`ui_custom_items`/`feature_registry` 查重）。**首页布局** `lib/uiHomeLayout.js`（模板+杀手占哪格，`RouteShell` 合并内容区）。杀手 `ui_*` 工具按考试改（move/nav_dock/home_layout/killer_home/migrate/undo 对所有用户；create/remove/rename_feature 写全局注册表仍 dev-only）。杀手自身只有 dock/float，绝不隐藏。编辑器 `components/uilab/*`。

## 十七、杀手 / Agent（`lib/chatAgent.js` · `app/chat` · `app/api/chat/*`）
- 私人 AI 助手，用工具运筹整套学习闭环。**工具**（functionDeclarations，约 50 个）：读写文档、RAG、联网搜索(+ingest)、出题/建树/改蓝图、发文件、UI 定制、学习模式、跨考试规划、记忆、回档…… + **砖头**（已发布的对全体开放）。
- **系统认知** `lib/appGuide.js`（`APP_GUIDE/APP_CAPABILITIES` 功能地图，杀手据此讲解/决策——**每加功能必更新**）。
- **后台运行**（断连可续）`chat_runs`/`chat/run`/`chat/resume`，实时进程面板。**计划确认门**：复杂/破坏性请求先出可预览的有序计划，一键批准/修改再执行（`chat_pending`/`plan_json`）；简单请求跳过。危险写操作逐条征求同意（站内横幅或推送）。**写确认防重复执行（2026-07）**：`chat/resume` 改为【先原子占坑再执行工具】——`UPDATE chat_runs SET status=running,token=NULL WHERE id=? AND status='pending'`，并发的第二个请求（确认点两下/横幅+页面各发一个/手机通知再触发）拿到 `changes=0` 直接返回，绝不重复执行；`execTool` 报错也标 `error`、不再永久卡 `pending`（否则横幅/确认会一直纠缠）。**对话摘要** `chat_summary`。**附件**走 Files API（`chat/file`）。
- **砖头系统** `lib/bricks/*`（`registry`+`index`）：原子能力，`brick_flags` seed 为 published，`/api/bricks` 调用。目录见文末。

## 十八、可编程学习模式 + 自动触发器（`lib/learningModes.js` + `lib/triggers.js` · `learning_modes`）
- **学习模式/配方**：用户用大白话定规则（"先讲5分钟→做题10分钟→复盘5分钟""数学先给题错了再反推概念"），存成命名、可激活、scope(exam/global) 的规则集，激活后注入杀手系统提示、杀手照做。`save/activate/delete/list_learning_mode`。
- **结构化自动触发器**（第②步）`lib/triggers.js`：真实代码钩子读已激活模式的触发器，满足即执行确定性动作。event=answer（连错n/同点连错n/近期正确率低/掌握度低于档/每n题/自称懂却做错）或 session（每天首次/每周某天/到期复习≥n/闲置n天）；action=升降难度/锁难度/记观察/标复习/插复习队列/发提醒/下调自评信任。阈值全参数化、零回归。
- **重要更正（全量审计）**：**planner 不读 learning_modes**（`planner.js` 不 import modes/triggers）。模式影响行为的真实路径只有三条:①注入杀手系统提示(dev)②注入根因诊断提示③经 triggers 引擎改**难度档/复习队列**(`difficultyPref`)。**没有任何按 scope/优先级解冲突的代码**——多个激活触发器各自独立触发、动作按 clamp/后写覆盖;"更具体的规则优先"只存在于提示词。触发器/cron 在调用方 dev 门控。
- **这是 Workflow Recipe 最接近的现有底座**（见文末"下一阶段"）。

## 十九、记忆透明 / 时间线（类20.2/12 · `lib/memory.js` · `app/api/memory`）
- 事实级长期记忆（Episodic+Semantic）`memory_facts`：subject/kind/claim/valence/scope/weight，冲突并存、近期加权。`/profile` 记忆区（全局+按考试）：看杀手记了你什么、软删除可恢复、按科目分组的**记忆时间线**（valence 随时间 weak→neutral→strong 变化）。`addFact/list_memory/forget_fact`。

## 二十、回档 / Checkpoint（`lib/checkpoint.js` · `app/checkpoints` · `checkpoints`）
- 结构性/破坏性操作前快照受影响考试状态，可逐级还原；还原后可让 AI 吸取教训（`agent_lessons`）。`rollback/list_checkpoints/clear_checkpoints`。

## 二十一、社交 / 反馈 / 管理 / 平台
- **收件箱** `app/inbox` · `inbox`：更新公告、Bug 回复、信件/附件；未读角标。**推送**（见基础设施）。
- **意见反馈**：右下悬浮按钮预填邮件。**Bug 反馈** `app/api/bug`：一键把整道题连媒体/录音/作答/AI判分(含失败)/讨论 + 设备诊断发给开发者；开发者可"亲自试做"复现并回传示范答案（`app/bugs`）。`feedback`/`bug_reports` 表。
- **管理面板** `app/admin`：只看使用频率（做题数/活跃天/聊天数/最近活跃），**看不到任何人学习内容**；建开发者子账号。**开发者工具** `app/dev`（+`dev/bricks` 砖头目录、`dev/items` 栏目）。
- **设置** `app/settings`：界面语言、我的档案（学校）、采集令牌、数据导出（全量 JSON `app/api/export`）、AI 密钥+模型（管理员）、Judge0（管理员）、「测试AI的API」「测试 Judge0」。**账号**：用户名密码 / Google 一键登录。**PWA**。首个账号=管理员。
- **What's New / 引导** `lib/guide.js`（GUIDE_VERSION + WHATS_NEW）；`app/welcome` 首用引导；`app/privacy`。

---

## 二十二、实现精要 / 关键阈值 / 易错点（基于全量代码审计）

### 作用域(务必区分)
- **`examScope(examId)`**：考试本身;若 `exams.aggregate_children=1` 则含**全部后代**(BFS,guard 200)。用于**掌握度/练习/模拟/错题/题库**读取(不复制数据)。`inScope(active,target)=examScope(active).includes(target)`。
- **`familyScope(examId)`**：先爬到**根**再收整棵树。用于**共享资料/chunks/RAG**(retrieve、materialParts、coverage、教材定位)。**两者不可混用。**
- 软删考试 60 天后 `purgeExpiredExams` 硬清;软删用户 30 天;bug 30 天。无 FK,全靠手动级联删。

### 掌握度算法(不是"对错率")`masteryMatrix`
- `attemptVal(a)`:base=correct?1:0;`careless&错→0.6`;`guessed&对→0.5`;自定义 label effect up/down 各 ±0.4,clamp[0,1]。
- 每条作答**时间衰减权重 `w=exp(-days/14)`**(τ=14天);**insights 也算证据**(权重 0.6、同衰减,understanding→1,gap/misconception→0)。**边界**:某点 0 作答时,gap 类 insight 被跳过(未练的点不会被别处误判点红,只能被 understanding 点绿)。
- 档位:evidence=0→unlearned;`acc<0.6`→weak;`acc<0.85 或 evidence<3`→ok;否则 mastered。
- **复习队列**:INTERVALS `[1,3,7,15,30]`;答对**首次不入队**(只有已有队列行才升级);答错入队(明天到期);`guessed` 标记会强制入队再测;升到超过最后一档=毕业(删行)。`resolved` 合成作答(错题本"已理解")被掌握度/统计排除。

### Files API 阈值(默认路径,inline 仅兜底)
- `uploadMedia`:写临时文件→上传→**每 2s 轮询 files.get,最多 90 次(~180s)**,须 ACTIVE。`readImage` inline 兜底阈值 **≤14MB(解码后)**;`attachParts` inline 兜底 **≤8MB(base64 字符串长度,≈6MB 实际)**、**最多 4 个附件**(两处阈值口径不一,已知小债)。materialFilePart 缓存 uri 47h。
- RAG:retrieve 相似度 **>0.35**;coverage **covered>0.62/partial>0.5**;KP 重映射 cosine **≥0.5**;related-exam **>0.45**;exam_match_kps 默认 **0.82**。embed 维度 768。

### 出题 / 模拟考
- `generate` 有**低延迟策略**:池够直接返回;池不足先返回、后台补齐(`banking` 每 `exam:kp` 进程内锁);全空则先出 1~2 题、后台补;含**联网仿真**(searchWeb 出原创仿真题,**8s 超时竞速**,不抄真题原文,is_real=false);听力题挂已有音频或写 listenScript 走浏览器 TTS。closed_bank 只出 origin=fixed、绝不生成、且不排除已做题。
- `DEFAULT_MARKS` 在 blueprint/mock route/submit/rescore **四处重复**(改一处不传导)。模拟考**后台判题** STALE 8min 自愈 + 防重;realOnly 模式随机抽 is_real。
- fill 题**宽松包含匹配**;客观题去标点/大小写比较;short 题 **score≥60 算对**。

### 表演题
- 视频 **≤40s**:inline 5fps/720p 帧(`【Ns】`时间戳)+抽音轨(总预算 18MB);>40s/未知时长:`transcodeToMp4`+File API,`videoMetadata:{fps:5}` 让 Gemini 自采样(无长度限)。`detectBeats` 是自研 RMS 能量起拍检测(阈值 1.4×移动均值±20帧,BPM≈中位间隔,≤48拍),非真节拍器。未完成/离题**压到 0~35 分**。(注:`transcodeToMp4` 注释写 crf20 实为 **crf26**——文档级小 bug。)

### 杀手 / 权限门控(不均匀,注意)
- 工具 = 内置 functionDeclarations(过滤 devOnly)+ 已发布砖头。**dev-only 内置工具正好 10 个**:list_memory/forget_fact/save/list/activate/delete_learning_mode/plan_overview/ui_create/remove/rename_feature。**placement 类 ui 工具(move/undo/migrate/nav_dock/home_layout/killer_home/read)对所有用户声明**——与提示词"仅开发者"措辞不一致(已知不一致)。**砖头默认未发布=dev-only,publish 后全体可用**(`brick_flags`)。
- `web_search_and_ingest` **故意不算写操作**(不弹允许框)——与系统提示"联网搜集需授权"矛盾(已知不一致)。
- 写操作确认门 + 计划确认门(maybeComplex 正则/长度 → makePlan 3~8 步 → 批准/修改)。后台运行 `chat_runs` fire-and-forget,最多 12 轮工具循环。聊天历史**滚动摘要压缩**(留最近16、旧的后台并入 `chat_summary`)。清空对话 DELETE 仅 dev。
- checkpoint 保留 **40 条 / 60 天**;`agent_lessons` **仅 rollback(dueTo=bug) 时**写入并注入提示。诊断间隔下限 **90min**(默认 2h),活动增量 clamp 15~300s。

### 界面 `normalizePlacement`
- 只把"注册表里有、布局里缺失"的项按 ref/默认桶位与**原有次序**补进来;**已存在(含用户主动隐藏)的项一律不动**;未知默认位置**跳过不硬塞**。不是重排。killer 只有 dock/float、绝不隐藏。exam-scope 布局对所有登录用户开放;发布全局默认仅 dev。

### Judge0 / 实践作业
- 鉴权:URL 含 rapidapi→X-RapidAPI-Key;否则**同时**带 `Authorization: Bearer` + `X-Auth-Token`。**创建提交(wait=false)+轮询 15×650ms**;`expected` 精确匹配 status3;**无 expected 时 WA(4) 也算 passed**(仅"跑通")。runTests 上限 12 例。用例生成有占位符/超大过滤(否则降级 evidence)。视频/exam_form 考核 **win=score≥80**;互动类用 AI 给的 done/win。实践模式开关**联动 tasks 栏目显隐**;自动布置 30min 限流、fire-and-forget。

### 其它易漏功能
- **augmentKnowledgeTree**:上传资料后**增量**加 ≤8 个新知识点(不删旧)。**carryOver/provision**:建子考试可 live(实时聚合,不复制)/summarize/partial(仅带错或没做过的)/copy_all;掌握度以 **insight 迁移**(非假作答)。**exam merge/split/integrity_check** 砖头:真"移动"数据(非复制)、事务化、有环检测。**exam_promote_weak**:抽薄弱/错题成"冲刺精选"。
- **听力/配乐**:从 Internet Archive / LibriVox 找 CC/公版整曲(无 API key,尺寸 1~18MB),Gemini 亲耳听校正曲风。**扫描版 PDF**:上传后台 Gemini 原生读(≤50MB)或 `splitPdfBySize(45MB)` 分片再入库。
- **公开采集 API** `/api/ingest`(X-Ingest-Token,非 session):浏览器扩展采集,文本≥50字、媒体 http(s)、≤25MB/项、≤60MB/次。**浏览器 Agent** `/api/agent/step`:只读+翻页,禁点提交/购买/删除/退出。
- **记忆** `memory_facts`:冲突并存、半衰期 45 天、kind 权重;`difficultyHint` **硬难度档覆盖软记忆提示**。**整体画像**每 25 题自动刷新。**geo**:按 IP 定默认语言、CN 隐藏 Google。**推送**:VAPID 自动生成、分类偏好(pushUser 无视偏好/notifyUser 按类)。**导出**:全量个人数据 JSON(不含密码哈希)。**首个注册用户=管理员;管理员≠开发者**(AI 密钥配置=admin;dev 工具/砖头目录=developer)。会话 365 天;middleware 只查 cookie 存在性,真校验在 `getSessionUser`。

## 二十三、学习配方 Workflow Recipe（MVP-1，dev 灰度 · `lib/recipes.js`）
- planner-for-planner:把用户自然语言的整套学习流程存成【多阶段配方】。表 `recipes`(spec_json:goal/phases[]/rules;priority;active;version)、`recipe_versions`(配方版本历史)。
- 每 phase = `selector`(chapters/kp_ids/weak/all,圈定知识点) + `method`(practice/socratic/debate/explain_first/custom_mode/ai_choose) + `exit`(mastery_ge level ok|mastered / accuracy_ge / manual)。
- `getActiveRecipe` 冲突解析:**scope 特异性(exam>global) > priority > recency**。`currentPhase` 按掌握度判定第一个未过阶段(阶段覆盖的知识点 ≥80% 达 exit 即过)。`methodForKp` 供 planner:今日任务(`/api/daily`)按当前阶段给每个知识点标 `method/methodTag/methodLabel/methodHref`,并返回 `recipe` 块(name/phase/method)。
- 杀手 brick(**已发布·全体可用**):`recipe_save`(AI 把大白话流程 + 考试章节 → spec 并激活;**流程模糊/缺信息/自相矛盾时不猜——返回 needsClarification + 具体问题,杀手据此停下来追问主人,直到说清才生成**)、`recipe_activate`、`recipe_status`(含各方法 effectiveness)、`recipe_list`、`recipe_resegment_preview/apply`。
- **MVP-2(已做):阶段效果测量 + ai_choose 自动择优**。`recipeProgress`:进入阶段时快照其知识点掌握度(`recipe_phase_state`),阶段过后算**方法无关的掌握度增益**(gain=现在平均 rank − 起点平均 rank);`method=ai_choose` 的阶段**自动解析成已完成阶段里增益最高的方法**(候选可指定)。`recipe_status` 显示各方法效果(effectiveness)+ 目前最优方法(bestMethod)。
- **MVP-3(已做):结构重切 + diff 预览 + 作用域回退**(`lib/recipeRemap.js`)。`proposeResegment`:AI 把现有知识点按指令重新分组,给旧→新映射,**只预览**影响面(多少作答/错题/复习会迁移、孤儿点、不受影响的部分),暂存提案不改数据。`applyResegment`:先打 **checkpoint** → 建新结构 → 旧→新 id(先 AI 映射、再 embedding cosine≥0.5 兜底)→ **非破坏性重指** questions/attempts/insights 的 kp_id(原始行保留)→ 删旧点 → integrityFix。回退复用现有 checkpoint/rollback。杀手 brick `recipe_resegment_preview`(不改)/`recipe_resegment_apply`(改,dev)。
- **冲突/优先级**:配方层已由 `getActiveRecipe` 解析(scope 特异性 > priority > recency,单一生效配方)。跨触发器细粒度优先级引擎留待后续。

## 数据表总览（db.js 内 45 张 + `feature_registry`/`ui_events`(建于 uilab)≈47）
users · sessions · settings · exams · documents · materials · chunks · knowledge_points · explanations · questions · attempts · insights · review_queue · daily_plans · mock_exams · notes · memory_facts · learning_modes · checkpoints · agent_lessons · gen_lessons · chat_runs/chat_messages/chat_files/chat_pending/chat_summary · browser_jobs · ingest_tokens · inbox · feedback · bug_reports · leaderboard 相关 taunts · push_subscriptions · brick_flags · **lang_transfer · lang_contrast · plan_snapshots · practical_tasks · task_progress · task_test_appeals · custom_modes · custom_mode_results · recipes · recipe_versions · recipe_phase_state**（粗体=本轮新增)。另有 `feature_registry`(uiRegistry)、`ui_events`(uiPlacement) 建于其它模块。

## 砖头目录（37，已发布对全体开放）
exam_list/create/set_parent/unset_parent/match_kps/copy_kps/copy_questions/set_aggregate/tree/promote_weak/provision/gen_status/merge/split/integrity_check · bank_list/set_closed/paste/add/set_must/delete · diagnose_root_cause/config · resolve_reference_list · plan_review/plan_compare · study_map · where_to_start · lang_background_set/lang_transfer_analyze/lang_transfer_predict · arena_play · create_custom_mode/list_custom_modes/generate_custom_modes · assign_practical_task/list_practical_tasks。

---

## 尚未做 / 已知边界
- 根因分析未接入平时小测（当时未选）；无浏览器内 WASM 兜底（不要）。
- `learning_modes`/`triggers` 独立工具仍 dev 门控（Recipe 是它们的超集,已发布)。
- **Workflow Recipe(planner-for-planner)学习端 MVP-1/2/3 已完成、已实测、并【已发布给全体用户】**(多阶段配方 + planner 按阶段选方法 + 阶段效果测量 + ai_choose 自动择优 + 结构重切/diff 预览/作用域回退)。当前边界:
  - 跨触发器细粒度优先级引擎未做(配方层冲突已由 `getActiveRecipe`(scope>priority>recency) 解析);
  - 科研复现 / AI4Science / 实验模拟等场景的 workflow 迁移尚未开始(学习只是低成本 sandbox);
  - Recipe 专属可视化编辑页 / 可视化 diff 仍可打磨(目前经杀手对话 + 今日任务体现)。

---

## 更新日志 · 2026-07-14(workflow 编排能力 + 记忆注入 + 作用域必问)
- **当日有序仪式(gap#1)**:今日任务 item.type 扩展为 `practice/debate/socratic/explore/kp/review/free`(带 kpId/n)。`customize_daily_plan` 砖头可产出【有序 steps】(主人说"先做N道问答→辩论M轮→苏格拉底→复习"),首页 HomeClient linkFor/labelFor 逐个渲染并直达(practice→`/practice?kp`、debate/socratic→`/arena?mode=…&kp`、explore→`/study?kp&mode=explore`);竞技场页读 `?mode=`(boss/trial/debate/socratic)自动开局。done 追踪按当天该 kp 的 attempts+insights。**自动今日任务(/api/daily 从 crossExamPlan)完全不变**,只有主人主动要仪式才出现新步骤。
- **topic-first 自由探索(gap#2,真·新学法)**:`app/api/kp/explore`(轮,回复末隐藏 `@@DEPTH:shallow|medium|deep` 驱动深度条 + 隐藏 `@@KP[{id,kind}]` **逐轮**把 understanding/misconception 即时 `recordCrossKp` 并入掌握度——**和竞技场一致,无论怎么退出理解度都不丢,不再依赖退出时 finalize**;`/finalize` 仅保留给"结束探索并记录"按钮作显式汇总)。**刷新保留(2026-07)**:`/study` 用 `replaceState` 让 URL 始终反映当前视图(`?kp=X&mode=explore` / `?kp=X` / 清空),刷新确定性恢复,不再靠 localStorage 匹配猜(修"从讲解页进探索、URL 带旧 kp、刷新回退到讲解"的 bug)。围绕一个知识点让考生主动发问,AI 判断懂多深:浅→苏格拉底反问、深→挑战题。组件 `components/ExploreSession.js`;学习页 `?kp=X&mode=explore` 或讲解页「🔍 自由探索」进入;作为今日任务步骤 type=explore + Recipe 方法 `explore`。
- **表演/口语类按维度驱动下一次(gap#4)**:`perform/grade` 让 AI 为每个 rubric 维度单独打 0~100 分(schema.dimensions),存 `attempts.dims_json`;PerformTask 结果页画每维度进度条。`lib/performDims.js`(`weakestPerformDims`/`weakDimHint`)聚合弱维度(<70);`generateQuestionsForKp` 表演类命题时注入 weakDimBlock → 下次命题+rubric 重点攻弱维度。
- **学习者历史注入(所有学习/自定义功能)**:`lib/learnerContext.js` 的 `learnerKpContext(kpId)`(掌握度+最近做过的题对错+之前讨论/观察沉淀)、`learnerExamContext(examId)`(家族薄弱点+最近误区/理解)。已注入:topic-first 探索、苏格拉底与追问讨论(discuss route)、知识点讲解(kp/explain)、竞技场全部模式+自定义玩法(arena.js)。让 AI 因材施教、不从零开始。
- **配方作用域必问**:`recipe_save` 加 `scope`(无默认→不传就走 needsClarification 让杀手用大白话问主人"只这门考试还是以后所有考试长期通用");`save_learning_mode` 与 systemPrompt/appGuide 都加"作用域拿不准先问、别默认"规则。含章节名的分阶段流程一般只适合本考试,不含章节、按薄弱/全部选的通用方法才适合 global。
- **i18n 铁律**:所有新功能/文案必须做【全 8 语言】,不能只补英文(已写进 CLAUDE.md)。本轮新增键已补齐 8 字典。
- **数据表新增**:`attempts.dims_json`、`daily_plans.custom`(此前)、`materials.offtopic/offtopic_reason`(此前)。

## 更新日志 · 2026-07-14(二)配方打磨 + 后台重建 + 微调快路径
- **纯数字微调快路径** `tweak_daily_plan` 砖头(零 AI、就地改题数/轮数、保留其它步骤);planner 抽 `currentDailyItems` 与 /api/daily 同源。杀手报错不再吞异常:runLoop catch 打日志 + 按类型给可重试提示,前端显示真实原因。
- **配方回退** `recipe_revert` + `revertRecipe`(回上一版、可再撤);**生效说明** `active_rules` + `activeRulesSummary`(列已激活配方/模式、冲突解析=本考试>全局>priority>最近)。
- **知识树重建改后台** `startRebuild`:置 setup_state='generating' + 分离 promise,`/api/kp`+/study gate 住半成品(显示「重建中」),避免同步长跑逼近超时。
- **配方可视化** `/api/recipe` + /plan「🧭 学习配方」卡(阶段/当前/版本历史/一键回退/生效规则)。
- 新砖头 tweak_daily_plan / recipe_revert / active_rules 均 seed published。i18n 全 8 语言补齐。

## 更新日志 · 2026-07-15(三)黑盒回归 P1/P2 + 编程编辑器
- **全局错误兜底**:`app/error.js`/`app/global-error.js`——client 异常友好界面+重试,ChunkLoadError 自动硬刷新一次(修 coding-first 首次白屏)。
- **竞技场编程题**:codingMode 检测 → 深色等宽多行编辑器(Tab 缩进4空格/Shift+Tab 反缩进、左侧行号槽随滚动同步、Enter 换行、Ctrl/⌘+Enter 提交)+ 现场运行 `/api/arena/run`(Judge0)语言选择/输出面板;arena 系统提示加「代码用反引号、$…$ 只给数学」。
- **计时器**:elapsed 只在 <300s 作服务端基准(修 1008s 失真)。
- **删除考试**:站内确认弹窗替换原生 confirm()。
- **UI 按考试隔离 + 建考试智能整理栏目(2026-07)**:①`app/api/ui-items` GET 把自定义考核(`xform<模式id>`)按 `familyScope(activeExam)` 过滤——别的考试的庖丁/惠子/Coding-First 不再冒进本考试「栏目分配」(feature_registry/ui_custom_items 是全局的,靠 custom_modes.exam_id 归属判断)。②`lib/uiPlacement.autoAdjustExamUi`:建考试(runProvision)末尾按考试名+类型+档案 AI 判断 mock/prep/performances/tasks 4 个可选栏目是否相关,无关收 hidden、相关留可见(保守:明确 false 才收),per-exam 布局、可 undo。③自定义考核名靠 `generateModes` 的 langInstruction 生成时就用 UI 语言(不进翻译字典)。
- **子考试完成→掌握度映射家族树(2026-07,Will 定)**:标记【真子考试】(有 `parent_exam_id`)完成时,`/api/exam/manage` complete 返回 `isSubExam`;前端弹二选一——【映射到家族知识树】或【放着不动】。选映射→ `action:map_mastery_to_family` → `lib/mastery.mapSubExamMasteryToFamily`:取子考试【自己】叶子知识点的档位(masteryMatrix 家族聚合后按 exam_id 过滤),`embed`+`cosine` 语义匹配到家族里【其它考试】(母+兄弟)的对应叶子(≥0.6),已掌握/一般→understanding、薄弱→gap 写进那些点的 `insights`(`recordCrossKp`,家族校验)。**只认真考试;实践作业(伪子考试、非 exams 行)不走这套**——它的掌握度另有逻辑:`assignTask` 用 `matchKp`(子串→embedding≥0.55)把任务绑一个叶子 kp,`gradeMilestone` 里程碑过=understanding/未过=gap 写该 kp。
- **今日任务措辞**:有方法时显示方法名(Custom challenge/Practice…)而非笼统 Study。
- **P1-3 本地化**:砖头标题48 + 写操作确认模板22(confirmDesc {t,p} 模板+占位)+ 步骤条静态提示 + onboarding 考试类型 + 方法标签,全 8 语言。
- **P2**:错题本完整选项+高亮;辩论轮数 ×N;Materials「其他文件或说明」保存反馈;首页 kye:data-changed 自动刷新今日任务。
- **聊天附件入库**:`lib/materialIngest.js` `ingestMaterialBuffer`(Materials 上传 + 杀手 `save_attachment_as_material` 共用);chat_files 加 source/saved_material_id。
- 新砖头/工具:tweak_daily_plan、recipe_revert、active_rules、recipe_tweak、save_attachment_as_material、customize_daily_plan(此前)。

## 更新日志 · 2026-07-16(四)concierge 硬伤批 + 日期穿越(按用户)+ 定时提醒 + 截断根因
- **自定义考核卡截断根因**:`lib/customModes.js` 注册功能卡时 label/desc 被 slice(0,20)/(0,40) 硬截。放宽到 40/80 + `create_custom_mode` schema 约束 name≤40/winDesc≤80(源头控长)+ db.js 自愈迁移 `_heal_xform_labels_v1` 回填历史卡片。`components/FitText.js` 去 `-webkit-box`/line-clamp(致 scrollHeight 测不出溢出、字号自适应从不触发)改 maxHeight+overflow。
- **今日任务完成判定**:每类【当天目标题数】(默认 6,配方 method.count/步骤覆盖),做够才完成、显示(已做/目标);辩论/苏格拉底/探索/自定义考核=活动式做过即完成、少/不出题;`set_practical_mode` 砖头=任务优先模式(编程/vibe:主做实践作业、target 降 2)。/api/daily done 逻辑 method-aware。
- **家族砖头发布**:`exam_merge`/`exam_split`/`exam_integrity_check` 加入 `_bn` + 一次性强制发布迁移,对普通用户开放。
- **开发者日期穿越(按用户隔离)**:`lib/devtime.js`(`todayStr`/`nowMs`/`nowStamp`)读 `dev_day_offset:<uid>`;`lib/reqctx.js` AsyncLocalStorage 在 `getSessionUser` 绑定请求 userId → 偏移**只作用于当前账号,绝不全服务器**。今日任务日期键、复习到期(mastery/review 路由 `date('now')`→绑 todayStr)、倒计时(planner nowMs)、做题/洞察写入(nowStamp)全跟随。`/api/dev/date`(仅开发者,±370天)+ `/dev` "🕰️ 日期穿越"卡(全语言)。
- **H3 定时提醒**:`reminders` 表 + `lib/reminders.js`(addReminder/deliverDue/startReminderLoop)+ 砖头 `set_reminder`/`list_reminders`(已发布)。到期投递=收件箱 + web-push;/api/daily 每次 deliverDue + 后台每分钟轮询。诚实边界:推送需先开通知,否则进收件箱。
- **H7** 配方名引号本地化(HomeClient t("「")/t("」"),8 字典按语言给引号)。**H9** 首页 visibilitychange/focus 自动重载。**H1** 澄清:UI 服务 workflow 靠今日任务按方法编排,不额外堆按钮(误加的入口条已删)。**H2** 核实竞技场/探索本就把状态回流并驱动 planner。
- **VersionGuard**(`components/VersionGuard.js`):检测新部署→内部跳转走整页加载,防 ChunkLoadError;配 app/error.js/global-error.js 友好兜底+自愈刷新。
- 砖头数增至 ≈53(新增 set_reminder/list_reminders,并发布 exam_merge/split/integrity_check);新增数据表 `reminders`。

- **实践作业助教诚实 + 测试细节可见 + Judge0 稳健**:助教对"过没过/通过几个"只照实际"通过 X/Y"数字说,0/6 就是没过、绝不瞎恭喜;测试每个用例都列 输入/期望/实际(空标"(空)")/报错;Judge0 故障(如 http_400)不再伪装成用户 0 分,而是明确报"评测机出问题"并带原因,明文被拒自动 base64 重试。
- **多考试主动提示建分组·用户自选**:有多门未分组考试时主页/追杀计划提示建组;同意后由用户【勾选哪几门】进组(可命名),不自动全塞。各科知识树/掌握度仍独立不合并。

## 更新日志 · 2026-07-18(六)计划/排期/作业助手/临考冲刺大批
- **作业助手型作业(assignment)**:上传的 assignment→杀手 add_assignment 自动建成新类型作业:没里程碑、不判分,只有一个能【传/贴文件、聊天自动存、每轮实时记掌握度】的作业助手;点「标记完成」才清空对话。作业助手不清楚作业内容时会先请你贴/传原文,不瞎猜。
- **本周计划表(/plan 重写成可翻周的周历)**:← 上一周/本周/下一周 →(周一起,可回本周),每天一张卡列当天安排(勾选完成、点去做直达),当前周顶部「逾期顺延」。凡是带日期的都并进来:按天排期条目 + 带截止的作业(自动显示在截止那天)+ 排期里加 href 的练习(/practice)/趣味挑战(/arena)等。顶部「🗓️ 排学习计划」入口。
- **排学习计划弹窗(PlanSetup)**:把【时间要求(有考试日期/学到某天/学N周/没要求)+每天学多久+排哪些天(每天/跳周末/自定)】一次问全→生成学习进程写进按天排期→在周历里改/同意。建考试完成后自动弹(/plan?setup=1,预填该考试日期);杀手也能从对话里用 open_plan_setup 弹出它(计划类问题走弹窗不在对话追问)。
- **杀手排期能力**:plan_by_day(按天重排,条目可带 href/taskId)、add_plan_items(把指定日期的事项加进排期)、plan_from_syllabus(读 syllabus 抽整学期作业due/考试日期→铺满整学期,多门课可累加)、set_task_due(只改一个作业截止不重排)、build_study_plan(无考核时按每天时长均匀铺+估周数)。【排计划必须锚定考核:先看每个 quiz/期中/期末/作业考啥、几号前必须学完,卡在它之前,再在锚点之间均匀,不准傻均匀】。
- **循环自动规则(用户不在也定期自动跑)**:set_auto_rule/list/delete——每天或每周到点自动【发定时提醒】或【汇总本周计划投收件箱+推送】;和一次性 set_reminder 区分。
- **syllabus 分门别类**:final→母考试、quiz/midterm→子考试(exam_provision child)、assignment→作业助手作业、日期→按天排期+提醒;【没 final 就别硬套母子结构、先问主人】。计划贴合各次考核、信息不够必须明说、不许假装吻合。
- **临考(≤7天)自动弹窗·按掌握度**:每天弹一次(可"先不")。<70%→推「先测试再复习」(先摸底再针对性攻);≥70%→「去学习页自查+去模拟考」。
- **模拟考/复习只考当前考试**:review/mock 由整个家族范围改成 ownScope(汇总母考试才含子考试),不再串进家族里其他考试的内容。
- **杀手感知当前页面**:每轮消息带上当前页路径,服务端用写死的 pageContext 对照表补一句该页说明(不传截图省 token),杀手懂你说的"这个/当前页"。
- **取消手动分组→所有考试默认一个组**:删了分组砖头/建组弹窗;首页「今日任务」标题右侧切换 chips 直接列全部考试;「别的科目快到期/逾期」提醒替代原「别的考试也别落下」;「跨考试规划」按钮→「本周计划表」。
- **繁体不再只靠自动转**:ZH_TW(台湾·計畫等)/ZH_HK(港澳·粤语)两本词典对其他语言的全部键 100% 覆盖(缺口用 opencc s2twp/s2hk 词组级生成落成显式条目)。
- **实践作业代码题**:测试用例/输入输出约定生成更严(desc 说死输入/输出格式+示例代码块多行、starter 按语言给读取骨架、stdin 补结尾换行);助教能看到运行输出/报错/测试细节、且铁律禁止瞎恭喜"全部通过";Judge0 故障不冒充 0 分、http_400 自动 base64 重试。


## 更新日志 · 2026-07-19(日)v9~v11 测试回归批 + 每日练习重构 + 反虚报机制

### 每日练习重构(固定三条)
- 见「十、跨考试规划/计划」里更新后的「今日任务」条目。要点:**自由练习薄弱点**(只根因+薄弱、回捞旧薄弱要点名具体考核) + **学一个新知识**(按单元顺序、8题算学完、跨知识点日配额、打勾≠学完)。原来单列的薄弱知识点任务已删除并入自由练习。

### 反"嘴上说了实际没落地"(程序写死,不靠提示词)
- `chat_runs.act_log_json`:每个工具执行后 `recordAct` 记下**工具的真实返回**(成功/失败/说明)。**确认恢复(resume)会清 steps_json 但不清它**,所以整轮(含超时、多次确认往返)持续累积到最终回复发出。
- `actsBlock(runId)`:**每次调模型前**把最新记录拼进系统指令(不塞 contents,避免重复堆积)。**空也要注入**("本轮没有任何改动"),否则模型会在什么都没做时凭空编造。
- 提示词改为**说明性**(这份记录是什么/怎么用),不再命令"必须先调工具"。`changes_this_turn` 降级为可随时复查的辅助工具。
- 日志只存**可读标签**、不存内部工具名 ⇒ 模型照抄也不泄露函数名/ID。

### 账号重置(Reset)彻底化 —— 及一次严重回归的教训
- `resetUserData` 改为**通用清扫**:遍历所有表,带 `user_id` 的按本用户删、带 `exam_id` 的按本用户考试删(含无考试对话哨兵 `-uid`);间接子表(explanations/review_queue/recipe_phase_state/recipe_versions)先删;补删 settings 里 `day_plan:`/`dev_day_offset:`(日期穿越)/`tz:`/每门考试的 `practical_mode:`、`ui_placement:`。用户行**删掉再用同 id + 同登录重建**成默认值 ⇒ "同 ID 的全新账号",重置后重走新手导引(`onboarded=0`)。
- ⚠️ **踩过的坑**:通用清扫最初把 `sessions`(登录态)也删了 ⇒ 账号被登出、全站 401、`/dev` 认不出开发者(v11 的 P4-1/P4-2/P4-3 全是这一个根因)。**清扫必须跳过 `sessions`(与 `users`/`settings` 一起排除)**。
- 配套:`useAiFetch` 遇 401 自动跳 `/login?expired=1` 并提示"登录状态已过期",避免自我锁死。

### 界面/交互
- **全部浏览器原生弹窗下线**:41 处 `confirm/alert/prompt`(19 个文件)换成 `components/ui/dialog.js`(纯 DOM 挂 body、样式统一、按钮按界面语言本地化、Promise 风格、Esc/Enter/点遮罩可关)。原生弹窗会挡住自动化测试、样式不统一、无法本地化。
- **临考冲刺弹窗**改用 `createPortal` 挂到 `document.body`——`position:fixed` 被带 transform 的祖先困住会跑到页面中部且没有全屏遮罩(与 /exams 确认框同一个坑)。
- **任务标题公式渲染**:首页今日任务、周计划每日条目接 `<MD inline>`;学习页速练卡片原是**先截断再渲染**把 `$...$` 切断,改用 `safeCut`(切点落在公式内就补齐到闭合 `$`,补不齐则丢弃半截公式)。
- **确认框文案**:补齐 UI 写工具的可读+可翻译描述(`ui_move_item`/`ui_undo`/… 原本回退成原始函数名);`"确定"` 这个键**8 个词典里一个都没有**导致只有它露中文,已补齐。

### 回档 / 结构
- **回档页含 UI 布局改动**:`ui_events` 本就有完整 before/after 历史,只是 `/checkpoints` 不读它。新增 `listUiCheckpoints/restoreUiEvent/redoUiEvent/clearUiEvents`,API 合并两类记录并按 `kind` 分派。
- **合并前先揪重复**:新增砖头 `find_similar_exams(query)`——按关键词列出**全部**同名/疑似重复考试(含已归档)+ 归一化重复分组 + 准确计数;appGuide 要求整理/合并前必须先用它、逐条报给用户,别靠 exam_list 肉眼挑(否则会像 P2-13 那样漏掉一条)。

### 作业 / 提醒 / 日期
- **跨考试打开作业**:任务不在当前激活考试家族时**自动把激活考试切过去**(切得过去=你的、放行;切不过去=别人的、拒绝),不再 403 卡"加载中"。
- **已完成考试不再催**:`urgentCrossTasks`/`allDatedTasks` 跳过"考试或其祖先已标记完成"的作业。
- **周计划的"今天"用虚拟日期**:根因是 `/api/day-plan` 没调 `setReqUser`,devtime 的 `dayOffset` 拿不到用户偏移 ⇒ 退回真实日期。

### 内容归属守门(不许把别科目/超课纲的内容塞进当前考试)
- `lib/scopeGuard.js` + `execTool` 前置钩子:杀手要往当前考试【布置实践作业 / 批量出题 / 加知识点】前,拿**这门课的课纲(知识点树)**当尺子判一下。**判据是课纲不是学科**——纯证明/计算的数学课里"用 Python 写程序解题"照样算超范围。判为 `out` 就拦下,并把"先告诉主人这不是本科目内容 → 问他加到哪门/新建一门/他坚持才加"回给杀手。没有知识树或判断失败都不拦(避免误伤)。主人自己上传的作业(`add_assignment`)不在此列。
- 确认框对"会往考试里新建内容"的工具带 **`intoExam`** 标签(【加到《某考试》】),加错科目一眼可见。

### 提醒 = 应用外推送(不进收件箱)
- `deliverDue` 与循环规则里的提醒**只 `pushUser`**,不再 `sendLetter`;「本周计划」汇总仍进收件箱(那是可留存信件)。
- `notify.pushStatus(userId)`:同时看推送开关与是否有已注册设备订阅;`systemPrompt` 注入该状态——没开时明确告诉杀手"到点提醒现在发不出去",必须在设提醒**之前**说清楚要先开通知、且提醒不会留在收件箱。

### 今日任务的两种"小改"(零 AI,别用 customize 重排)
- `tweak_daily_plan`:纯数字(题数/轮数)。
- `reorder_daily_plan`(新):**纯顺序**——只挪先后、可顺带去掉某项,**题数/内容一个都不动**;`order` 支持当前序号或关键词(review/free/newkp/标题字),没点到的保持原相对顺序排在后面。
- `customize_daily_plan` 只用于**真正的重排/换知识点/智能定制**;它的 base 已改为**当前真实生效的今日任务(含现有题数)**,并明令"题数默认原样保留"(P4-11 根因:任何请求都走整套 AI 重生成 + base 从规划器现拉 ⇒ 只说改顺序也会被改题数)。

### 合并考试的日期(不替主人做主)
- `exam_merge`:日期相同或只有一方有 → 直接合并并继承那个日期;**两边都有且不同 → 拒绝合并**,回去问主人(要合并成一门还是要父子结构 `exam_set_parent`?合并的话用哪个日期?),答复后经新入参 `examDate` 再合并。`exam_create` 新增 `examDate` 入参(留空的考试首页没倒计时、跨考试排期会漏排)。
- `plan_overview` 返回 `mustCover`(所有分到时间的考试 + 标出当前正开着的那门)+ 附注"一门都不许漏,确实不排也要明说为什么"(P4-8 核查结论:`allocate` 并不丢考试,是叙述时漏的)。
