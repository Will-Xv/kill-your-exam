# Kill Your Exam — 项目约定 / 长期记忆

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
- 自定义/AI生成**考核形式** `lib/customModes.js`（`custom_modes`，kind=play/exam_form，format=interactive/video）；**exam_form 会自动成为独立栏目**（`uiRegistry.saveCustomItem` id=`xform<id>` + `uiPlacement.moveFeature` 放进该考试首页；`/arena?launch=<id>` 直达）；视频类判分 `/api/arena/video-grade`；成绩记 `custom_mode_results`。
- 实践任务 `lib/practical.js` + **Judge0** `lib/judge0.js`（`/tasks`，代码里程碑跑测试用例；证据里程碑 AI 审阅；用例申诉 `task_test_appeals`；`judge0_url/judge0_key` 在设置里由管理员配，创建提交+轮询、rapidapi/官方/自建三种鉴权自动判断）。
- 模拟考**后台判题**：`/api/mock/submit` 立即返回 grading，`gradeMock` 后台跑，`/api/mock/status` 轮询（`mock_exams.status/grade_started_at/results_json`）。
- 两层界面：`lib/uilab/*` + `/api/ui-items`。**每门考试可独立改布局（所有用户）**；**发布为默认仅开发者**；`normalizePlacement` 让新功能在旧布局里自动补位。

## i18n
- `lib/translations.js` 8 个字典（ZH_EN/FR/ES/RU/AR/ID/TW/HK），源键=简体中文，8 个都要同步加键。TW/HK 可用 opencc（s2twp/s2hk）从简体键机械生成。

## Judge0（Will 已买官方 per-use，实为 RapidAPI 计费）
- 设置里：地址 `https://judge0-ce.p.rapidapi.com` + RapidAPI Key。已实测代码执行判分通（正确 4/4、错误按用例扣分）。
