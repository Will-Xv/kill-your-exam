# AI 备考助手

单用户、考试无关的 AI 备考网站。手机/电脑打开同一网址即可使用,进度自动同步(数据都在服务器上)。

## 功能(第一期)
- **新建考试向导**:AI 联网搜索考试信息 → 生成"认知自评报告"(知道什么/不知道什么/风险)→ 资料收集清单 → 知识点树 + 备考策略
- **资料库(RAG)**:上传 PDF/Word/文本/图片(拍照 OCR),所有讲解和出题优先基于资料
- **学习**:知识点讲解,🟢基于资料 / 🟡模型知识 溯源标记
- **练习**:自动挑薄弱知识点出题(单选/多选/判断/填空/简答),AI 批改简答,"这题有问题"一键反馈
- **聊天管家**:说想法即可改备考策略/考试档案,可检索资料、联网搜索、读进度数据
- **API 故障透明提示**:AI 服务出问题时明确告知"不是你的问题",一键邮件联系 Will

## 部署(Railway,推荐)
1. 把本项目推到 GitHub 私有仓库
2. railway.app → New Project → Deploy from GitHub repo,Railway 会自动识别 Dockerfile
3. 给服务挂一个 Volume,Mount Path 填 `/data`(数据库存这里,重新部署不丢数据)
4. Variables 里设置 `ACCESS_CODE=你想要的访问口令`(默认 666666)
5. Settings → Networking → Generate Domain,得到访问网址
6. 打开网址 → 输入口令 → 设置页粘贴 Gemini API key → 测试连接 → 开始设置考试

## 本地运行(开发)
```bash
npm install
npm run dev        # http://localhost:3000
```
环境变量(可选):`ACCESS_CODE` 访问口令;`GEMINI_API_KEY` 也可直接在网站设置页填。

## 技术说明
- Next.js 15(App Router,JS)+ Tailwind CSS 3
- SQLite(better-sqlite3),数据目录由 `DATA_DIR` 控制,默认 `./data`
- 向量检索:Gemini embedding(768 维)+ 内存余弦相似度(单用户规模足够)
- AI:Google Gemini(@google/genai),模型名可在设置页改,默认 gemini-2.5-flash
- 所有 AI 错误经 `lib/errors.js` 统一分类,前端 `AiErrorDialog` 弹窗提示并可一键联系维护者

## 目录速览
```
app/            页面与 API 路由
  onboarding/   新建考试向导(认知自评/清单/上传)
  study/        知识点树 + 讲解
  practice/     做题与批改
  materials/    资料库
  chat/         聊天管家(带工具)
  settings/     API 配置
lib/db.js       SQLite schema 与常用查询
lib/gemini.js   Gemini 适配层(生成/JSON/搜索/多模态/embedding)
lib/errors.js   错误分类与友好提示
lib/rag.js      分块、索引、检索
lib/parse.js    PDF/docx/图片解析
middleware.js   访问口令拦截
```

## 第二期计划(未实现)
掌握度矩阵、每日任务首页、错题本 + 间隔重复、联网找资料入库、资料覆盖度视图、PWA。
维护者:Will <xuy413682@gmail.com>
