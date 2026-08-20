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
- **繁体台/港必须手写，s2t 只是兜底（2026-08）**：`lib/s2t.js` 是**纯逐字换字形**（BASE 2743 单字 + TW_VAR 83 + HK_VAR 113 地区异体字，键长全为 1，无词表、无上下文、非机翻）。两类它必然做不到：①**一简对多繁**（复习→`復習`✗ 应 `複習`；头发→`頭發`✗；制作/松开/皇后同类，实测 15 例错 6）；②**地区用词**（软件 台`軟體`/港`軟件`、网络 台`網路`/港`網絡`、视频→`影片`、默认→`預設`、用户 台`使用者`/港`用戶`、项目 台`專案`/港`項目`）。且 TW_VAR/HK_VAR 仅 128 字取值不同 ⇒ 机械转出的台港几乎一样。**故 ZH_TW/ZH_HK 为手写词典**；已清理串味（HK 曾残留 設置×23/登錄×17/信息×14/默認×9… 与台式 使用者/網路；TW 曾残留 用戶/數據/迴圈误转）并按港标字形改 `裡→裏 說→説 閱→閲 啟→啓 戶→户`（`參→蔘` 是反查假阳性，未动）。**`scripts/lint-zh-region.mjs` 已接入 `npm run check`**，再出现大陆词/串味/误转直接 fail。`app/welcome` 亦改为**手写 zh-TW / zh-HK 两套**（港版用港式口语），不再 `tradifyObj` 机械转换。
- **i18n** `lib/translations.js`：8 字典，源键=简中，`t()` 在 zh 原样返回。新键要同步加 8 个字典（TW/HK 可用 `lib/s2t.js` 或 opencc s2twp/s2hk 从简体机械转）。当前 8 语言各 1261 键、零缺失。
- **地区/语言** `lib/geo.js`（IP→默认语言，服务器查询不受墙）。**推送** `lib/notify.js`/`lib/pushClient.js`/`app/api/push`（VAPID Web Push，分类偏好，iOS 加主屏提示）。
- **定时器** `lib/cron.js`：Railway 常驻进程内 setInterval 跑 session/每日每周级触发器（`app/api/triggers/tick`）。
- **客户端持久化**：IndexedDB `lib/idb.js`（大附件）、localStorage（草稿/布局草稿）。
- **部署**：build-gated push（本地 `npm run build` 过才 push）；原生依赖（需系统库如 node-canvas）Railway 跑不了，用纯 JS（pdf-lib `lib/pdfSplit.js`）；`lib/media.js` 用 ffmpeg（视频抽帧/转码/节拍）。部署后用新标签页验证。

## 三、建考试（**只由杀手做** · `lib/provision.js`)
> **【2026-07-19 手动建考试已整体下线】** `app/onboarding` 与 `app/api/onboarding/*` 已删除;新用户导引结束直接落到没有考试的空首页,各处入口改成叫杀手。下面保留的是【建考试流程本身】(杀手 `exam_provision` 走的就是这套),不再有手动填表页。
- 向导：选类型（school/cert/language/grad/other/study「只学习」/performance「艺术表演」）→ `assess` AI 联网搜考试 + **认知自评**（✅有把握/❓不确定/🚫需资料/⚠️风险 + 参考网页）→ 补充资料（传文件+回答 AI 清单，可跳过）→ `finalize` 生成知识点树+策略（`lib/provision.js` 后台建，`exam_gen_status` 查进度）。`draft` 断点续建。
- **语言类考试收集多语言背景**（母语/已会外语/目标语）：onboarding 表单 + 杀手 `exam_create`（langNative/langKnown/langTarget）→ 写 `langbg:<uid>` → 供三语迁移。
- 借用其它考试资料：`app/api/exam/related`（embedding 相似度）+ `exam/borrow`。

## 四、多模态资料库 / RAG（`app/materials` · `app/api/materials/*`）
- 传 PDF/Word(`mammoth`)/文本/图片/音频（拍照/拖拽/粘贴）；自由"其他说明"栏；资料收集清单（可问答填）。每个文件原地查看：图直显/音频播放/PDF 内嵌/文本提取（`materials/content`、`materials/raw`）。原件完整保存。
- **文件任意大小（分块上传，2026-07）**：>8MB 前端 `File.slice` 切成 **80MB/块** 逐块 POST `?chunk=1&uploadId&i&n&name&mime`；后端 append 写临时文件(内存只有一块)、收齐 `fs.rename` 成资料文件、`ingestMaterialFromChunks` 入库(零内存拷贝)。护栏:单块≤96MB、总量≤2GB。上传失败如实弹原因、可单删/累加/看文件名。单文件直传（≤8MB 走 FormData）仍有 40MB 上限+并发内存兜底(6GB在途)。
- **超大 PDF 拆页读（第二步，2026-07，`lib/pdfIndex.js`）**：>45MB 的 PDF 整份超 Gemini 上限——入库后台 `indexBigPdf` 用 `splitPdfBySize`(≤16MB/整页) 拆片，每片 `readImage`(Gemini多模态,不用pdf-parse)生成检索要点+页码存进 `chunks`(heading `p:起-止`)；`read_material`(chatAgent) 遇 `isHugePdf` 走 `readBigPdf`——按问题 `retrieve` 命中页段→`extractPdfPages` 只抽相关页→只读那几页。`query_knowledge_base` 也能检索超大 PDF。`retrieve` 增返 `material_id`。三种"块"互不相干:上传块80MB(搬进服务器)/索引片16MB(喂Gemini)/Gemini读~50MB·1000页(Google限)。
- **超大 PDF**(旧)：`lib/pdfSplit.js` 抽页(`extractPdfPages`)/拆片(`splitPdfBySize`)/页数(`pdfPageCount`),被 referenceResolve 与上面的拆页读复用。
- **Chrome 采集扩展**（`extension/`）：从已登录学习站采内容（含图/音/PDF）进资料库，不碰密码；`app/api/ingest` + 采集令牌 `ingest_tokens`；Agent 模式可自动翻页采（只读、禁点提交/购买/删除）。**【网站入口与提示词已于 2026-07 下线】`app/collector` 页面已删除、设置页入口已移除、杀手的 browser_task 工具已删;扩展源码与后端接口保留,想重启只需把入口加回来。**

## 四之二、省 token：普通 PDF/图片建索引 + 停止强制投喂全文（2026-08 · 成本治理）
> **根因**：`lib/parse.js` 对 PDF/图片一律 `text:""`（故意不抽字，避免 pdf-parse 半吊子文字）→ 它们**一个 chunk 都没有**、RAG 永远检索不到 → 模型只能靠"每次调用强制附整份原件"看资料。而 **Gemini 对 PDF 按页计费（~258 token/页）**，一本 300 页教材 ≈ 7.7 万 token，**每次调用重复计一遍**。这才是账单爆炸主因（不是聊天）。
- **① 上传时后台建索引**（`lib/pdfIndex.js`）：`indexPdfOutline`（普通 PDF：整份读**一次**，让 Gemini 按页分节输出 `起页-止页 | 要点`，落成多段 chunks，`heading_path='p:a-b'`）、`indexImageMaterial`（图片：多模态读成含图上文字/公式/图表含义的一段 chunk，`heading_path='img'`）；>45MB 仍走原 `indexBigPdf` 拆片。均在 `materialIngest` 后台跑，**每份资料一次性**成本，换掉此后每次调用的整本重复投喂。
- **② 拆掉隐形炸弹**：`materialParts` 默认 `max` **20→0**（必须显式指定才附）；`mmOpts` **不再默认附整库**，只挂调用方明确给的 `extraParts`。此前任何调用方一不留神就把整个资料库塞进一次请求。
- **③ 判题不附资料**：`questions/answer`、`mock/submit` 的 `mp=[]`——评分要点本就在提示里，附教材对判分零帮助。（mock 每道简答题原先都附一次，最狠。）
- **④ 出题/讲解/追问/探索：只送 RAG 命中片段**，新增 `hitMediaParts(examId, hits)`——只有当**检索命中的那份资料本身是图片/音频**（听力题、看图讲解真需要原件）时才挂，**命中几份挂几份、不设条数上限**（Will：万一真需要很多呢）。天然上限是 `retrieve` 的 k（通常 4~6 条）且须 `kind∈{image,audio}`，不会失控。
- **⑤ 杀手不再每轮硬塞 3 份原件**：它有 `read_material`(按 id 读全文) / `query_knowledge_base`(检索) 两个工具，需要时**自己去取**——"模型主动看"只在有工具循环的杀手侧成立；出题/判题/讲解/追问是**单次调用 `tools=0`**，模型无法索要，所以那几处必须靠 RAG 喂到位。
- **保留全量投喂的例外**：`buildKnowledgeTree`(`max:60`) 与 `augmentKnowledgeTree`(`max:8`) —— 建树/补树本就需要通读全部教材，且**每门考试仅一次**，故显式传 parts 保留。
- **⑥ 存量资料自动补索引**（`lib/backfillIndex.js` · 挂在 `lib/cron.js`，**无人工入口**）：新规则上线【前】上传的 PDF/图片没有 chunks，会**既不被投喂、又检索不到 = 失联**。故**应用启动 60 秒后自动扫一遍**，之后**每 6 小时**再扫，并兼顾【上传时建索引失败】的漏网（下一轮自动重试）。**幂等**：只挑当前 `chunks` 数为 0 的资料——补完后每轮扫描只是一句 SQL，不花钱，也不会重复计费；**串行**逐份补，不并发轰炸 API；**归属**：每份用 `runAsUser` 记到该资料所属考试的主人头上；收尾对相关考试跑 `afterMaterialsChanged` 重算覆盖度。进度看日志 `[BACKFILL]`。
- **7 懒加载补救 `lib/lazyLookup.js`**：解决「改成纯 RAG 后、检索没命中就只能凭空编」这个敞口。**不做全面工具循环**——实测口径：单次调用（提示词＋检索片段）约 3K token；换成 3 轮工具循环即使工具压到最瘦也要约 9K（每轮把前文全量重发，实现是 `contents.push` 不断追加），约 3 倍。且检索本就是确定性代码在挑、零 token，让模型再挑一遍是重复付费；另有硬约束：Gemini 的 `responseSchema` 与 function calling 不能并存，出题这类结构化输出走不了工具循环。故改为懒加载：`hitsAreWeak()` 判定（命中 2 条以上、或最高分 0.5 以上即算够好）→ 够好则直接返回空串、零额外开销（绝大多数请求走这条）；只有命中差时才花一次很便宜的纯文本调用，把资料索引目录（chunk 的 heading ＋ 摘要，最多 80 条）给模型，让它自己挑（**不设条数上限**，Will：万一就是需要很多呢；挑不出回 none、也不许凑数）；选中的若是 PDF 且索引记了页段（`p:a-b`），用 `readBigPdf` 只抽那几页真读，否则用索引要点。**按资料去重**：同一份 PDF 只真读一次（`readBigPdf` 会跨段把相关页一并找齐），所以多挑几段不会多花钱——这是去重、不是截断。天然边界只有目录本身的 80 条。补到资料就撤掉提示词里「无资料支撑」那句。四条单次调用链路全部接入：讲解、追问、探索、出题。失败一律吞掉、不拖垮主流程。
- **工具轮次上限 12→24**（`MAX_TOOL_ROUNDS`）：Will 要求**不许收紧**，为后续"工具改成模型语义搜索再调用"留余量。

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
- **小测（快速摸底）· `components/DiagnosticCard.js`（学习页与模拟考页共用）**：横跨各章抽几个知识点，**一次连着做完**（`/practice?kps=<ids>&fresh=1`，练习页本就支持 `kpIds` 批量出题），结果自动记进掌握度。选点：每章按「最没练→次没练」排队再横向轮询，广度优先；5/10/15 分钟档按 ~2 分钟/题缩放题量。模拟考页传 `showMockLink={false}`。★**三个历史坑已修**：① 广度抽样原先**只在 `totalAttempts < 6` 时才算**，做过几道题小测就**永久消失、全站找不到**（Will 反馈）→ 改为始终计算并作为 `quickTest` 返回；② 原先不是一整场小测，只是几个链到**单个**知识点的小标签，点一个进一个 → 改为一次跨多点；③ 同卡里原有的「该从哪开始（推荐学的单元）」会把小测顶掉 → **已整块删除**（`whereToStart` 仍返回 `solid/start/firstAction`，仅前端不再渲染）。无可测知识点时整卡不显示。
- **可随时退出进行中的模拟考（2026-08）**：未交卷的状态写在 IndexedDB(`KEY="mock"`)，回首页再进来会原样恢复——以前只有交卷后才有「再考一次」，**误触开考就彻底卡死、退不出来**（Will 反馈）。现在 `running` 顶栏与 `grading` 页都有「退出本次模拟考」，确认后走 `restart()`（`idbDel(KEY)` + 清空所有 ref/state），回到 intro，且刷新/回首页不再被恢复。
- **「从我指定的资料出卷」取代「做真题」（2026-08 · `lib/mockFromMaterials.js`）**：原「做真题」只从 `is_real=1` 抽，而 `is_real=1` **只有你自己提供的才算**（粘贴进题库 / 上传做题识别 / 从资料定位到的原题），AI 生成与联网仿真都不算——多数考试那个池子是空的，按钮文案「只用你提供的资料组卷」还名不副实（它不是从资料组卷）。**改为：勾选从哪几份资料出题 ＋ 对出题 AI 提要求**（侧重某章、只出计算题、难度、题型偏好…）。取材：有要求就拿它当 query `retrieve` 命中这些资料的段落；不足再从这些资料的 chunks **均匀取样**补齐（避免只盯开头），上限 24 段 / 24k 字。★**只送索引段落、不整份投喂原件**（那是先前 token 爆炸的根源）。出的题按题干 embedding **就近绑一个叶子知识点**（供掌握度统计），写入 `questions(origin=generated, source_type=material, source_refs=材料ids)` 并建 `mock_exams(mode="materials")`。无索引时如实报「这几份资料还没建好索引，刚上传的话稍等」，不含糊说“出题失败”。`DEFAULT_MARKS` 从 `lib/blueprint.js` 导出复用，不再各处重复定义。

- **模拟考真正开始计时（2026-08）**：`durationMin` 一直被蓝图算好、API 返回、写进 `mock_exams.config_json`、蓝图页也显示着 ⏱️——**但考试过程中一秒都没计时**（`started` 记了却从未使用）。现在顶栏常驻计时：有真实时长 → **倒计时**（最后 5 分钟转橙、超时转红并显示超了多久）；没有时长 → 只显示已用时。★**超时不自动交卷**（破坏性动作，主人可能正写最后一题），只醒目提示、由他决定。成绩页显示「用时 mm:ss（限时 N 分钟·已超时）」。计时状态（`durationMin`/`finishedAt`）一并进 IndexedDB，关掉页面再回来接着算，不会归零。按资料出卷同样带上考试的真实时长（`exam.duration_min`），没有就不限时——绝不编一个假时长。
- **考试蓝图** `lib/blueprint.js`：AI 先规划该考哪些点、题型分值、总分、时长、**题量**（照真实题量，不再默认20）、结构依据可信度徽章（✅官方/📄推测/🔮预估）；按蓝图组卷、题库不足即时生成。`customize_mock_blueprint` 杀手可重排。
- **题库/封闭题库/必考原题** `lib/questionBank.js`（`mock/bank`）：粘贴已知一定考的题（一字不改入库）、标"必出"（每次原样置卷首）、"封闭题库"开关（练习+模拟只从主人题里出、绝不生成）。做真题只用主人资料。
- **★ 后台判题**（本会话）：交卷 `mock/submit` 立即返回 `{status:"grading"}`（`mock_exams.status/grade_started_at`），`gradeMock()` 后台跑（含简答 AI 阅卷、多模态附件），判完写 `score_json/answers_json/results_json/status='done'` 并跑一次跨章节根因诊断。前端进"正在判题"页（可离开），轮询 `mock/status`。健壮性：防重复判题、8 分钟卡死自愈、重试重触发、卸载清轮询。`mock/rescore`(争论改判重算)、`mock/history`、`mock/att`。

- **笔上原生按钮＝临时橡皮 + 橡皮大小光圈（2026-08）**：按 W3C Pointer Events 规范判定，**不针对任何厂商**——`buttons & 32`＝笔尾/橡皮头（Surface Pen 倒置、Wacom 反转笔），`buttons & 2`＝笔杆侧键（三星 S Pen 等）。命中任一即**临时**按橡皮走（`ERASER_W=22`），松开恢复用户原选工具；Apple Pencil 无按钮不受影响。侧键会触发右键菜单，故 canvas `onContextMenu` 阻止。**橡皮光圈**：处于橡皮状态（手动选的或笔按钮按住的）时，**悬停即显示**与实际擦除同直径的圆环，抬着笔就知道会擦掉多大一圈；用 `ringRef` 直接改 DOM `transform`（**不走 React state**，否则每次 pointermove 重渲染会拖慢书写），`pointerleave` 收起。工具栏在笔按钮按住时显示「🧽 临时橡皮」提示。**⚠️ 实测：Will 的三星 S Pen 上按键无效**（判定已放宽到 `buttons&32 / buttons&2 / pointerType==='eraser' / button===5/2 / sticky` 仍不触发），多半是浏览器压根没把侧键事件给到网页。故**界面上不再宣传这个能力**（工具栏那句已改回不含按钮说明的原文），但**检测代码与 `?pendebug=1` 诊断口保留**——换浏览器/换设备若能上报，功能自动生效。**判定已放宽**（部分浏览器只在 `pointerdown` 的 `button` 里报一次侧键）：`pointerType==="eraser"`、`button===5/2`、以及 `btnEraseRef` sticky（落笔那刻按下即整笔画算擦）均纳入。**诊断口 `?pendebug=1`**：任意带手写板的页面加此参数，画布上方实时显示本机上报的 `pointerType/buttons/button/pressure/erasing`，用于定位"笔上按钮无反应"到底是浏览器没上报还是判定没覆盖。

- **修「笔画头尾被连成直线 / 落笔慢半拍」（2026-08）**：与卡顿**部分同源但另有真凶**——从来没用过 `getCoalescedEvents()`。浏览器每帧只派发**一个** `pointermove`，而触控笔采样率 120~240Hz，中间采样点被**打包在事件里**；不取出来就只剩每帧一个点，`lineTo` 把它们连成长直线段（主线程一卡掉帧、直线更长）。**修法**：① `move()` 用 `e.getCoalescedEvents()` 取回全部采样点逐点绘制；② 改用**中点二次贝塞尔**（以上一个采样点为控制点、相邻中点为端点），相邻段天然相切、不出折角；③ `up()` 补画「最后中点→最后采样点」，否则每笔末端短一截。压感仍逐采样点生效。
- **修「笔在书写区里把页面滑走」（2026-08）**：**区分手/笔的机制本来就是好的**——笔一靠近（悬停或落笔）就把画布 `touch-action` 切成 `none`（笔写字、不滑屏），笔离开再恢复成 `fingerScroll ? 'manipulation' : 'none'`（手指照常滑页面）。**唯一的病**：canvas 的 JSX 上*也*写了 `style={{touchAction: ...}}`，于是 **React 每重渲染一次就把 JS 设好的值覆盖回去**；本轮新增的笔按钮状态／橡皮光圈／扩充计数让重渲染变频繁，才从偶发变成「写几笔后笔开始滑屏」（与画布是否扩充无关）。**修法只有一条：JSX 不再设 `touchAction`，全部收归 `applyTouch()`／`penForceDraw()` 管**；`rebuild`／挂载／开关变化后重新套用，`hover`（笔悬停进入）即切换以赶在手势判定之前。（曾一度改成「用过笔就全禁」和「手指滚动改 JS 驱动」，把手指也误伤了，已全部回退。）
- **手写卡顿修复（2026-08，扩充功能的副作用）**：Will 反馈「书写识别有些迟钝，怀疑跟扩展书写区域有关」——属实，三处开销都随画布高度线性恶化（1600×8840 时：每张快照 54MB）。① `emit()` 原先每次抬笔都 **同步** `toDataURL` 整张画布（13 格时 1410 万像素）→ 改为 **防抖 400ms + 异步 `toBlob`**，笔离开画布（`leave`）立即 flush，`expand/undo/clear` 等单次动作也立即 flush，避免"写完马上交卷丢最后一笔"。② `undoStack`：**每落一次笔就整幅 `getImageData` 一张**（13 格时单张 54MB，纯拷贝就卡）且累计 25 张（1.3GB 常驻）。→ 改为**只存这一笔改动的那一小块**：新增**影子画布**保存「上一笔结束时」的画面，书写时累计该笔**包围盒**，抬笔时只把包围盒内的**旧像素**压栈（一个汉字约 25KB、一行字约 188KB），再把新画面同步进影子；`undo()` 按坐标 `putImageData` 贴回那一小块并同步影子。于是**每步代价与画布高度无关**，撤销深度恢复到 30 步（一个汉字 30 步仅 0.7MB）。仅「清空」这种整幅改动才存整幅（`snapshotFull`），另有 64MB 兜底。★`rebuild/扩充/清空/初次载入` 后都要 `syncShadow()`，否则撤销会把内容擦成空白。③ `pos()` 原先每次 `pointermove` 都 `getBoundingClientRect`（每秒上百次强制重排）→ 落笔时量一次、整笔复用。④ 橡皮光圈只在状态真变化时写 DOM。
- **手写区域可无限纵向扩充（2026-08，`components/HandwritePad.js`）**：草稿纸与手写作答共用同一组件，故两处都有。「⤓ 扩充手写区域」每点一次纵向加 `BASE_H=340`（初始高度的 100%），**上限 `MAX_EXPAND=12` 次**（到顶按钮置灰并提示「页面扩充到顶了，试试其他方式提交吧，手写的答案可以和其他提交方式的答案一起被看到」——宁可写之前就拦住，也不能让长篇作答在提交时被服务端保险丝悄悄截断），按钮显示当前 ×N。**画布上下各一个按钮**（`ExpandBtn dir="up"/"down"` 共用同一渲染，免得改一处漏一处）：点下面的往下加、点上面的往上加。★**向上扩充**要多做三件事：① 旧内容贴回时落在 `y=BASE_H`（整体下移一格）；② **撤销栈里每一块的 `y` 同步 +BASE_H×dpr**——否则之后撤销会错位一整格贴回；③ `window.scrollBy(0, BASE_H)` 让笔迹在屏幕上看起来没动。上下方向**共用** `MAX_EXPAND=12` 的次数上限。★canvas 改 width/height 会清空内容，故扩充流程＝`toDataURL` 存整张 → `rebuild()` 重建（重设 dpr scale、填白）→ `drawImage(im,0,0,cssW,oldH)` 原样贴回顶部（不缩放）→ `emit()`。`getImage()`/`onChange` 导出的都是**整张画布**，所以拉长部分天然随作答一起提交判卷（练习/模考/竞技场的手写附件都是 `getImage()` 直出 base64，**不经** `lib/attach.js` 的 `MAX_DIM=1600` 缩放，无裁切）。草稿恢复：`initial` 是整张图，按原图宽高比算高度并向上取整到整数格，避免把扩充过的草稿压扁。

- **手写长图切片（2026-08，`lib/handSplit.js`）**：拉得很长的手写图又窄又高，多模态整体降采样会糊。`h > w*1.6` 时额外生成切片（片高≈`w*1.1`，最多 12 片）。★**两种切法逐切口各自判断、混用**：先用 `inkPerRow` 逐行统计墨量，在目标切点 ±25% 窗口内找 ≥6px 的**全空白行**（`findBlankCut`）→ 从缝里下刀，干净无重复；该处找不到缝才**重叠**（`OV=min(h*6%, w*15%)`，≥24px），保证跨切口笔画至少在一张里完整。**整页原图始终第一位**，切片按序跟随（`handwriting-p{i}of{n}.png`）——用整页看结构、用切片看字迹，**由模型自己挑或对照着看**，代码不替它决定。
- **明确告知"两者内容相同"以省算力**：`lib/gemini.js` 导出 `handSliceNote(attachments)`（单一事实来源），检测到 `handwriting-p*` 即注入提示：两者是**同一份内容的两种呈现、不是两份作答**；**默认只读一遍**（优先切片，更清晰）；不要重复识别/重复计分；仅在切片看不清或需确认位置时才回看整页；相邻切片的重叠处只算一次。四条链路均已接：练习 `questions/answer`、模考 `mock/submit`、追问讨论 `questions/discuss`、竞技场 `lib/arena.js`。
- **不设条数上限**：手写拉长次数不限 → 切片张数也不封顶（`handSplit` 去掉 MAX_SLICES，张数随高度自然增长，每片高≈宽）；`attachParts` 去掉写死的 4 条截断（改为全部处理，仅留 `MAX_ATTACH=64` 防畸形请求的保险丝）；三处提交只限制**其它上传文件**（≤3），手写整页+切片**一条都不截断**。

- **草稿纸发给追问＝与手写作答同等待遇（2026-08）**：练习页「📝 发草稿纸」原先把草稿 `b64ToFile` 塞进 `dFiles`，随后走 `filesToAttachments` → **被压到 1600px 长边并转 JPEG**（拉长过的草稿最吃亏）。现改为独立 `dDraft` 状态：**原图 PNG + 切片**（`draft.png` / `draft-p{i}of{n}.png`），发送时直接并入 `attachments`，**不压缩、不截断**。`handSliceNote` 的识别改为 `/-p\d+of\d+\./`，同时覆盖 handwriting 与 draft。★**草稿只流向「追问」，不进判卷**；但**追问本身会影响成绩**——`discuss/finalize` 会据对话 `revise`/`newCorrect`/`newScore`，并写 insights、crossKp 掌握度、masteryTag、labels。故 `handSliceNote` **四处统一用计分口径**（练习判卷、模考判卷、竞技场、追问），不分场景。新增 `draftAttachNote(atts)`（**独立于切片**，草稿短没触发切片时同样注入）明确：**草稿是演算/思考过程、不是正式作答**，用来看懂他哪一步跑偏；**不得拿草稿判对错，不得因草稿潦草／算到一半／没写完就说他答错**，改分只能依据正式作答与讨论中事实层面确认的对错，**绝不能因草稿上的涂改试错而扣分**。
- **已知边界**：`discuss/finalize` 只收 `history`（文本），**不收 attachments**——即改分那一步看不到草稿/手写原图，只能凭讨论文字（含 AI 在讨论中对图片的描述）。若发现改判因此失准，需把附件一并传给 finalize（代价：重复上传图片）。
- **多种作答方式一并送判（已核实，2026-08）**：同一题的**打字作答 + 拍照/文件上传 + 手写作答（整页+切片）**会一起进同一次判卷调用——练习 `questions/answer`（`userAnswer` + `attachments`）、模考 `mock/submit`（`answers[qid]` + `attachments[qid]`）、竞技场 `lib/arena.js`（文本 + attachments 挂到最后一条 user 消息）三条链路均如此。**例外：草稿纸不算作答、判卷看不到**（UI 明写「不计入作答」，设计如此）。客户端**不再按条数截断任何一路**（原先 `slice(0,4)`／`slice(0,3)` 会在附件多时悄悄丢掉上传的照片，与界面上「都能一起被看到」的承诺矛盾），仅保留服务端 `MAX_ATTACH=64` 防畸形请求。

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
- **多小问的大题不再拆开（2026-08）**：一道大题下带 (1)(2)(3) 小问时，AI 原先会把每个小问识别成**独立一题**，于是小问脱离了大题主干（「设 f(x)=…」、那段材料、那张图表）→ **题干丢失、根本没法作答**（Will 反馈）。提示词已明确：**大题主干＋全部小问合并进同一个 `stem`**，保留小问编号，`qtype` 取能覆盖整题的（通常 short），`answer`/`explanation` 按同样编号逐条列全。★各小问之间要求用**空行**分隔——`components/MD.js` 没启用 breaks 插件，Markdown 里单换行不生效、小问会挤成一坨；用空行即可正确分行，**无需改动全站渲染**（改 MD 影响面太大）。
- **做完给整卷汇总（2026-08）**：上传做题只要识别出 **≥1 题**，全部做完后不再只显示「本轮完成 N/M」，而是像模拟考成绩页一样给**整卷回顾**：顶部得分（百分比＋对题数），下面逐题列出 ✓/✗、**你的作答**、**标准答案**、可折叠**解析**与 AI 点评；底部「再传一份卷子／错题本／回首页」。数据全部现成：`answers[qid]` 里存着每题的 `{sel,text,result}`（`next()` 时写入），`result` 含 `correct/score/answer/explanation/feedback`，无需额外请求。**仅 `mode=quiz` 走这个汇总**，自由练习/复习仍是原来的轻量结束页。
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
- **Token 用量统计（2026-08 · `token_usage` 表）**：`lib/gemini.js` 每次调用后 `recordUsage()` 把 `usageMetadata` 落库，按 **用户×日期×模型** UPSERT 累加（`UNIQUE(user_id,day,model)`）。记录 **prompt / cached / thoughts / output / tool_use / total + calls** 六项：★`thoughts`（思考/reasoning）**不含在 `candidatesTokenCount` 里但照样计费**，只看输入输出会严重低估；★`cached`（命中隐式缓存的输入）是 **prompt 的子集、不是额外量**，计费时拆成 `(prompt−cached)` 全价 + `cached` 折扣价；★`tool_use` 是工具调用产生的输入，也计费。`total` 直接取官方 `totalTokenCount`。用户归属经 `lib/reqctx.js` 的 `currentUserId()`；后台任务（入库/判题/cron）拿不到请求用户 → 记到 `user_id=0` 的「后台/系统」账上，**不摊给任何人**。`/api/admin/usage` 返回每人 `tokens{...,total7,byModel[]}` + `tokenSystem` + `tokenAll`，管理面板显示全站合计与每人明细（输入/其中缓存/思考/输出/总计 + 按模型拆分）。
- **管理面板** `app/admin`：只看使用频率（做题数/活跃天/聊天数/最近活跃），**看不到任何人学习内容**；建开发者子账号。**开发者工具** `app/dev`（+`dev/bricks` 砖头目录、`dev/items` 栏目）。
- **设置** `app/settings`：界面语言、我的档案（学校）、数据导出（全量 JSON `app/api/export`）、AI 密钥+模型（管理员）、Judge0（管理员）、「测试AI的API」「测试 Judge0」。**账号**：用户名密码 / Google 一键登录。**PWA**。首个账号=管理员。
- **/welcome 中文改用楷体（2026-08）**：全站原先**没给中文指定字体**，靠 Tailwind 默认西文栈的系统兜底 → Windows 上落到**宋体**。现仅 `/welcome` 加 `.font-kai`（`app/globals.css`）：**自托管霞鹜文楷 LXGW WenKai**（OFL，`public/fonts/LXGWWenKai-OFL.txt`）。★**按页面实际用到的 655 字现打子集**：完整字库 30MB、npm 分区子集共 3.3MB/65 文件 → 合并重打成**单文件 154KB**（`fontTools` subset+merge）。只含 CJK 与中文标点，拉丁/西里尔/阿拉伯自动落回原字体栈；emoji（🗡📚💬…）本就走系统字体。回退链：自带子集 → 系统楷体（KaiTi/STKaiti/Kaiti SC/BiauKai/DFKai-SB）→ 黑体。**⚠️ 改过 welcome 中文文案后必须重跑 `node scripts/build-kai-subset.mjs`**，否则新字缺字形会静默掉回默认字体（不报错）。
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
- **杀手排期能力**:plan_by_day(按天重排,条目可带 href/taskId)、add_plan_items(把指定日期的事项加进排期)、plan_from_syllabus(读 syllabus 抽整学期作业due/考试日期→铺满整学期,多门课可累加)、set_task_due(只改一个作业截止不重排)。【build_study_plan 已于 2026-07-19 退役——它把知识点钉死在日期上,和今日任务「按完成推进」是两套平行系统、从来对不上;新知识的推进权只归今日任务,周计划只放真有日期的事 + 各考核的「这天之前要学完什么」】。【排计划必须锚定考核:先看每个 quiz/期中/期末/作业考啥、几号前必须学完,卡在它之前,再在锚点之间均匀,不准傻均匀】。
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

### 提醒的投递:收件箱留一份 + 应用外推送(推不出去会重试)
- `deliverDue` / 循环规则的 reminder:**先 `sendLetter` 进收件箱**(靠 `key` 幂等,重试不会刷屏)**再 `pushUser`**。
- ★**推送真的没发出去(`sent===0`)时不标记 `delivered`**,留着下次继续试(主人开了通知就能补上);**逾期超过 `GIVE_UP_HOURS=24` 小时**的旧提醒不再重试(过一天的提醒没意义了,也防止无限堆积——收件箱那份始终在)。
- `notify.pushStatus(userId)`:同时看推送开关与是否有已注册设备订阅;`systemPrompt` 注入该状态,让杀手别把提醒说成"一定会准时弹窗"。

### 改今日任务的四个砖头(按"改多少"分层)
| 需求 | 砖头 | 跑 AI? | 基础任务从哪来 |
|---|---|---|---|
| 只改题数/轮数 | `tweak_daily_plan` | 否 | 就地改现有 |
| 只改先后顺序(可顺带去掉某项) | `reorder_daily_plan`(新) | 否 | 就地改现有 |
| 在现在这份上改一改(加一项/换成辩论/去掉某项) | `adjust_daily_plan`(新) | 是 | **当前真实生效的今日任务**(保留已微调的题数) |
| 整份重新排一份 | `customize_daily_plan` | 是 | **从规划器重算**(之前手调的不保留) |
- 两个 AI 砖头共用 `planWithAI(args, ctx, fromCurrent)`,只有"基础任务从哪来"不同。
- P4-11 根因:原来**只有** `customize_daily_plan` 一个入口,任何请求(哪怕"只改顺序")都走整套 AI 重生成 ⇒ 题数被重新拍脑袋定、覆盖掉刚调好的值。解法是**按改动幅度分层给砖头**,而不是在提示词里加"别乱改"。
- `refresh_daily_plan` 仍是"清掉自定义、回到自动那三条"(不带主人的要求)。

### 合并考试的日期(不替主人做主)
- `exam_merge`:日期相同或只有一方有 → 直接合并并继承那个日期;**两边都有且不同 → 拒绝合并**,回去问主人(要合并成一门还是要父子结构 `exam_set_parent`?合并的话用哪个日期?),答复后经新入参 `examDate` 再合并。`exam_create` 新增 `examDate` 入参(留空的考试首页没倒计时、跨考试排期会漏排)。
- `plan_overview` 返回 `mustCover`(所有分到时间的考试 + 标出当前正开着的那门)+ 附注"一门都不许漏,确实不排也要明说为什么"(P4-8 核查结论:`allocate` 并不丢考试,是叙述时漏的)。

### 导航栏改版:新增「我的」·取消「更多 ☰」(2026-07-19)
- **新增 `mine`(我的)**:`lib/uilab/items.js` 里是个**菜单型项**(没有 `href`,带 `menu` 数组),`pinned:"nav"`。内容固定:你的全部杀技 / 收件箱 / 设置 / 意见反馈 / 回档(+ 管理员/开发者的 管理面板 / 开发者工具 / Bug 反馈,按 `itemVisibleTo` 过滤)。带 `badge:"inboxUnread"`,有未读会显红点。
- **可挪不可删**:`placementCore.PINNED = { home:"nav", mine:"nav" }`,`applyMove` 里固定项若目标容器不是它的 `pinned` 直接忽略 ⇒ 编辑器拖不出去、杀手 `ui_move_item` 也挪不走;`ui_remove_feature` 对 `home/mine` 明确拒绝。
- **取消「更多 ☰」**:`Nav.js` 删掉 ☰ 按钮与下拉面板;默认放置表里 `mock/prep` 改到 `morefeatures`,`profile` 进「我的」。
- **存量迁移**:`lib/db.js` 迁移把所有 `ui_item_placement` / `ui_placement:<examId>` 里 `where==="more"` 的项**直接改写成 `morefeatures`**;`applyMove` 也把 `more` 强制归一到 `morefeatures`,今后不会再有东西落进 more。
- **手动定制 UI(ItemLibrary)**:去掉「更多菜单」列;**不加「我的」列**(它的内容是固定的),并把 `MINE_FIXED` 那批项从整个面板里排除,避免被当成可摆放项。

### 手动建考试下线 · 建考试只由杀手做(2026-07-19)
- **删除** `app/onboarding`(手动填表建考试页)与 `app/api/onboarding/*`(仅它自己在用)。
- **新用户导引结束后直接落到【没有考试的首页】**(`Tour` 不再跳 `/onboarding`),首页空状态的按钮改成 **`openKiller()`**「告诉杀手你要考什么」。
- **追杀计划(/exams)**:去掉「+ 新考试」与「继续设置」;顶部加一条虚线提示「要加新考试?直接跟杀手说…」(点它叫出杀手);旧的未建完考试显示「这门还没建完」+「让杀手补完」按钮。
- 学习页/练习页的空状态也不再指向手动建考试,改为提示找杀手。
- appGuide 增加对应规则:建考试只由 `exam_provision` 做;补完旧考试要**先问清缺什么**(缺得多用 `ask_user_form` 一次问全);★**别在主人没开口时自己弹表单打断他**,正在进行别的对话时先把手上的事说完、先问一句再弹。

### 本周计划表与今日任务同源(2026-07-19)
- **退役 `build_study_plan`**(把知识点按天均匀铺):它把知识点钉死在日期上,而新知识是**按完成推进**;而且核实发现 `currentDailyItems` 与 `dayPlan` **从来互不引用**,本就是两套平行系统。
- **`planner.cycleDeadlines`**:用**和今日任务同一套判定**(范围=该考核自己的知识点、学完=做够 8 题)给出每个考核**「这天之前要学完什么」**(已学完 x/y、还剩几个、剩哪些)。
- `/api/day-plan` 返回 `deadlines` + `todayItems`;`/plan` 在考核当天渲染红色「这天之前要学完」块,在**今天**那格渲染实时的今日三条(只读、可点进)。**不做任何"预计哪天学哪个"的推算**。
- **`lib/dailyLabels.js`**:今日任务的链接与文案抽成共享模块,**首页与周计划共用同一份**,从机制上保证口径一致。

### 考试时长:变成一等数据,不再由 AI 编(2026-07-19)
- **根因**:`exams` 表**从来没有"真实考试时长"字段**。时长只存在于建考试时 AI 写进档案的一句话里,蓝图再忠实沿用 ⇒ 出现"基于**指定的** 30 分钟"这种把 AI 自己的假设当成既定事实的情况,题量还跟着这个假时长走。
- **修**:新增 `exams.duration_min`(真实考试时长,分钟);`set_exam_info` 增加 `durationMin` 供杀手记录(主人说了/大纲写了才记)。
- `generateBlueprint`:**已记录真实时长 → 必须原样使用**(后处理里也强制覆盖);**未记录 → 明令不许编**(`durationMin` 置空),且**不许拿假想时长反推题量**,题量按这门考试真实会考多少题定,并在依据说明里写明"真实时长未知,需要主人补充"。
- 蓝图页时长未知时显示「考试时长未知 — 告诉杀手真实时长」,而不是一个伪造的数字。
- appGuide 加规则:看到时长就记、不知道就问、别假设。
