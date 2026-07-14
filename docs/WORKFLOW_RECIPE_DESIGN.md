# Workflow Recipe —— 设计文档（planner-for-planner）

> 状态：**设计草案，尚未实现**。目的：把现有的强功能统一到一个用户可控的 workflow 层之下。评审通过后再分阶段实现。
> 一句话：让用户用**自然语言**定义一套**可保存 / 修改 / 复用 / 验证 / 回退**的 planner 行为规则，而不只是接受 AI 生成的一次性计划。

---

## 1. 目标与非目标
**目标**：用户能说"以后遇到这类学习任务时，你要按这种方式拆解、诊断、练习、复盘、调整、回退"，系统把它变成一个**稳定、持久、可改、可回退**的控制结构，真正改变后续 planner 行为。
**非目标**：不是又一个一次性 plan，不是普通 prompt，不是再堆一个新功能——而是把**已有能力**组织起来的上层抽象。

## 2. 复用现有底座（不重造）
| Recipe 需要的能力 | 现有实现 | 差距 |
|---|---|---|
| 规则持久化 + 改规则改行为 + 作用域 | `learning_modes`(rules) + `triggers`(结构化触发器)，scope=exam/global，激活后注入杀手系统提示 | 单条规则集，无**多阶段**、无版本、无优先级冲突解析 |
| 按作用域回退 | `checkpoints`(结构性操作前快照，逐级还原) | 未按"某次 workflow 修改"的**精确作用域**回退 |
| 计划 + 版本对比 | `planner`(crossExamPlan/daily) + `planVersions`(本周vs上周、保守vs激进) | planner 不读 recipe；无 recipe 自身的版本历史 |
| 结构变更时旧数据重映射 | `kp/rebuild` 保留策略(按合并时间线重放遗忘曲线) | 只在整树重建时；无"旧KP→新KP"通用**非破坏性**映射 |
| 掌握度/诊断驱动 | `mastery`/`diagnose`/`startHere` | 未作为 recipe 的"效果检测"信号闭环回来改 recipe |

**结论**：Recipe 层 ≈ 在 `learning_modes` 之上加【多阶段 + 效果检测→自动改写 + 结构重映射 + diff + 作用域回退 + 冲突优先级】，其余复用。

## 3. 数据模型（提案）
### 3.1 Recipe 对象
```
recipes(
  id, user_id, exam_id(NULL=全局), name, description,
  spec_json,          -- 完整配方(见下)
  priority INTEGER,   -- 冲突时高者胜
  active INTEGER,
  version INTEGER,    -- 当前版本号
  created_at, updated_at
)
recipe_versions(id, recipe_id, version, spec_json, note, created_at)  -- 配方自身的版本历史(改 recipe 可回退到旧配方)
kp_remap(id, exam_id, recipe_id, old_kp_id, new_kp_id, created_at)    -- 非破坏性结构重映射日志
```
（状态回退复用 `checkpoints`；效果观察复用 `insights`/`memory_facts`。）

### 3.2 spec_json 结构
```jsonc
{
  "goal": "用户的自然语言目标(原话保留)",
  "phases": [
    {
      "id": "p1",
      "name": "前三章·练习题打底",
      "selector": { "type": "chapters", "value": ["第1章","第2章","第3章"] },  // 或 kp_ids / weak / all / range
      "method": { "type": "practice" },        // practice | socratic | custom_mode:<id> | video | ai_choose | explain_first ...
      "exit": { "type": "mastery_ge", "level": "ok" },   // 何时算过这个阶段: mastery_ge / accuracy_ge / count / manual
      "effectiveness": { "measure": ["accuracy","speed","retention"] }  // 阶段后测什么
    },
    { "id":"p2","name":"中三章·苏格拉底","selector":{...},"method":{"type":"custom_mode","modeId":123} },
    { "id":"p3","name":"后三章·AI按表现选","method":{"type":"ai_choose","candidates":["practice","socratic"]},
      "adapt": { "if":"logical_segmentation_better", "then":"resegment_and_remap" } }  // 学后测→改后续
  ],
  "rules": "跨阶段通用规则(大白话，注入杀手，同 learning_modes.rules)",
  "triggers": [ /* 复用 lib/triggers.js 的结构化触发器 */ ],
  "on_structure_change": { "remap": true, "diff_first": true, "checkpoint": true }
}
```

## 4. 六种关键能力的设计
1. **Recipe persistence**：`recipes` 持久化 + 激活；每次改存一份 `recipe_versions`。
2. **Planner behavior change**：`planner`(daily/crossExamPlan) 在生成任务前**读激活 recipe**：对每个 phase 用 selector 圈定 KP、按 method 决定今天这些 KP 用什么方式学（练习/苏格拉底/自定义考核/AI选）。即 recipe **改写** planner 产出。
3. **多阶段 + 学后测效果→自动改写**：每个 phase 有 `exit`(何时算过) 和 `effectiveness`(测什么)。阶段结束触发一次轻量效果评估（对比该阶段 KP 在方法A vs 记录基线的 accuracy/speed/retention）；若命中 `adapt.if`（如"逻辑分段更适合你"），就改写后续 phase 的 method/selector，并（若涉及结构）触发重映射。信号复用 `mastery`/`diagnose`。
4. **State remapping（★已实现，直接复用）**：`rebuildKnowledgeTree`(`lib/generators.js`) 已做**embedding 语义映射**——建新树后把旧叶子 KP 与新叶子 cosine 匹配(≥0.5)，`旧KP→新KP` 重映射 `questions/attempts/insights` 的 kp_id，重建前打 checkpoint。keep/summarize/none 三档。**Recipe 的结构重切 = 调它 + 加 diff 预览**（可选:持久化 `kp_remap` 日志、把 review_queue 也显式带上，目前 review_queue 经 question 间接跟随）。
5. **Diff before major change**：应用结构性改动前**先 dry-run**，算并展示影响面：受影响的 KP 数 / 错题数 / 复习任务数 / 迁移去向，以及**不受影响**的部分；用户确认后才 apply（apply 前打 `checkpoint`）。
6. **Scoped rollback**：每次 recipe 结构改动 = 一个 checkpoint（作用域=受影响考试/KP 集）。回退只还原该作用域，**保留无关学习记录**。recipe 配方本身也可回退到 `recipe_versions` 的旧版。
7. **Conflict handling**：多个激活的 recipe/mode 规则冲突时，解析器按 **① 作用域特异性（exam > global、phase > recipe）② priority 字段 ③ 近期**决定生效规则，合并成"有效规则集"注入 planner/杀手，而非简单覆盖。

## 5. 端到端链路（ChatGPT 的例子）
> "前三章练习题、中三章苏格拉底、后三章 AI 按表现选；每章后检测我适合哪种方式；若发现更适合逻辑分段，就把后续改成逻辑分段，并把旧错题/不熟概念/复习任务重整到新结构。"

1. 用户自然语言 → 杀手 `recipe_save` 生成上面的 spec_json（3 phases + adapt 规则）→ 用户确认。
2. planner 每天读 recipe：现在在 phase1 → 今天这三章用练习题出题。
3. phase1 达到 `exit`(掌握度 ok) → 效果评估 → 进 phase2（苏格拉底/自定义考核）。
4. phase3 的 `ai_choose` + 学后测发现"逻辑分段更适合" → 触发 `resegment_and_remap`：
   - **diff 预览**：将影响 X 个 KP、Y 道错题、Z 个复习任务，迁移到新逻辑段；不影响历史作答原始记录。
   - 用户确认 → 打 checkpoint → 重切知识结构 + `kp_remap` 迁移错题/复习/掌握度。
5. 后续 planner 按新结构继续；不满意 → **scoped rollback** 回到重切前，其它无关记录保留。

## 6. 接口 / 工具 / UI
- **杀手工具/砖头**：`recipe_save`(自然语言→spec，改前 diff)、`recipe_activate`、`recipe_diff`(dry-run 影响面)、`recipe_apply`(打 checkpoint 后执行结构改动)、`recipe_rollback`(作用域回退)、`recipe_list`、`recipe_status`(当前在哪个 phase/效果)。
- **API**：`/api/recipe`(CRUD+激活)、`/api/recipe/diff`、`/api/recipe/apply`、`/api/recipe/rollback`。
- **UI** `/recipe`（或并入 /plan）：看/改激活配方与各 phase、当前阶段与效果、diff 预览与确认、版本历史与回退。planner 读 recipe 后，今日任务/计划会体现当前 phase 的方法。
- **杀手认知**：appGuide 加"用户可以定义/修改一套持久的学习配方(recipe)，我据此规划、按阶段换方法、学后测效果自动调整、大改前给 diff、可作用域回退"。

## 7. 安全 / 约束
- 一切结构性改动**先 diff 后 apply**、apply 前**打 checkpoint**、**非破坏性**（原始作答永不删）。
- 高风险改动走杀手计划确认门（已有）。
- 规则冲突有确定性解析（scope+priority+recency），不静默覆盖。
- recipe 的 rules 注入仍在安全边界内（不得凌驾核心准则）。

## 8. 建议分阶段实现
- **MVP-1（骨架，价值最高）**：`recipes` + 多阶段 spec + 激活 + **planner 读 recipe 按 phase 选方法** + recipe 版本历史。≈ 把 learning_modes 升级成分阶段配方。
- **MVP-2（自适应）**：phase `exit`/`effectiveness` 检测 → 学后测 → 自动改写后续 phase 的 method（不含结构重切）。
- **MVP-3（结构与回退）**：`kp_remap` 非破坏性重映射 + **diff 预览** + scoped rollback + 冲突解析器。
- **MVP-4（打磨）**：/recipe UI、模板库、跨考试复用、迁移到科研复现/实验流程等场景（远期）。

## 9. 决策（已定，Will）
1. **Recipe = learning_modes 的超集**：recipe 逐步吃掉 `learning_modes`/`triggers`（modes 成为"只有一个默认 phase 的 recipe"），统一到一个概念。
2. **允许 recipe 重切知识点结构**：直接**复用现有 `rebuildKnowledgeTree` 的 embedding 语义映射 + checkpoint**（已实现），Recipe 层只加"由配方触发 + 大改前 diff 预览"。
3. **效果检测四信号都要**：正确率 + 速度 + 隔日留存 + 主观反馈，综合判定"某方法更适合你"。
4. **不做独立 /recipe 页**：就用**现在的杀手(聊天)**作为 recipe 的编排入口（杀手本就全局），效果体现在今日任务/计划里。
5. **先只对开发者灰度**，Will 说发布再对所有用户开放。

## 附：原开放问题（已被上面决策取代）
1. **优先级/冲突**：recipe 与现有 `learning_modes`/`triggers` 是合并成一个概念（recipe 吃掉 modes），还是 recipe 在 modes 之上？（建议：recipe = modes 的超集，逐步统一。）
2. **结构重切的粒度**：允许 recipe 重切**知识点结构**（影响大、需 remap+diff），还是先只允许"换方法、换顺序、换选择器"（不动结构、无需 remap）？（建议 MVP-1/2 不动结构，MVP-3 才做重切。）
3. **效果检测标准**：用什么客观信号判定"某方法更适合你"？accuracy / 速度 / 留存(隔日重测) / 主观反馈的权重。
4. **UI 深度**：先只做"杀手对话 + 今日任务体现"，还是要一个可视化的 /recipe 编辑页？
5. **面向对象**：只对开发者灰度，还是直接对所有用户？
