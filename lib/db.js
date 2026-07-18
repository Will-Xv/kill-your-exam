import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
function openDb() {
  if (globalThis.__beikao_db) return globalThis.__beikao_db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
    db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      exam_date TEXT,
      daily_minutes INTEGER DEFAULT 60,
      status TEXT DEFAULT 'active',
      self_assessment TEXT,
      checklist TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- dossier | strategy | progress
      content_md TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(exam_id, type)
    );
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      filename TEXT,
      source_url TEXT,
      kind TEXT, -- pdf | docx | txt | image | web
      status TEXT DEFAULT 'processing', -- processing | ready | failed
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      heading_path TEXT DEFAULT '',
      embedding BLOB
    );
    CREATE TABLE IF NOT EXISTS knowledge_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      parent_id INTEGER,
      title TEXT NOT NULL,
      sort INTEGER DEFAULT 0,
      coverage TEXT DEFAULT 'none' -- covered | partial | none
    );
    CREATE TABLE IF NOT EXISTS explanations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kp_id INTEGER NOT NULL,
      content_md TEXT,
      source_type TEXT, -- material | model
      source_refs TEXT, -- JSON [{chunk_id, filename, heading}]
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      kp_id INTEGER,
      qtype TEXT, -- single | multi | judge | fill | short
      body TEXT, -- JSON {stem, options?}
      answer TEXT, -- JSON {answer, explanation, points?}
      difficulty INTEGER DEFAULT 2,
      source_type TEXT DEFAULT 'model', -- material | model
      source_refs TEXT,
      flagged INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      kp_id INTEGER,
      user_answer TEXT,
      correct INTEGER, -- 1 | 0, short answer: score>=60% counts correct
      score REAL,
      feedback TEXT,
      mode TEXT DEFAULT 'practice',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE COLLATE NOCASE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      role TEXT NOT NULL, -- user | model | tool_note
      content TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS review_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL UNIQUE,
      due_date TEXT NOT NULL,
      interval_level INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS taunts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user INTEGER, to_user INTEGER,
      from_name TEXT, kind TEXT, sticker TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT UNIQUE,
      keys_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bug_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER,
      user_id INTEGER,
      username TEXT,
      question_id INTEGER,
      qtype TEXT,
      snapshot TEXT,
      user_note TEXT,
      status TEXT DEFAULT 'open',
      admin_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS chat_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      user_id INTEGER,
      filename TEXT,
      mime TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS mock_exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      config_json TEXT,
      score_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      items_json TEXT,
      completed INTEGER DEFAULT 0,
      UNIQUE(exam_id, date)
    );
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      kp_id INTEGER,
      question_id INTEGER,
      kind TEXT,             -- understanding | gap
      text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS gen_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER, user_id INTEGER,
      status TEXT,
      steps_json TEXT DEFAULT '[]',
      reply TEXT,
      token TEXT, actions_json TEXT, pending_contents_json TEXT, pending_calls_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_pending (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      contents_json TEXT,
      calls_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS browser_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      goal TEXT,
      status TEXT DEFAULT 'pending',  -- pending | running | done | failed
      collected INTEGER DEFAULT 0,
      log TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    `);
    try { db.exec("ALTER TABLE mock_exams ADD COLUMN answers_json TEXT"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN notif_updates INTEGER DEFAULT 1"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN notif_bugfeedback INTEGER DEFAULT 1"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN notif_push INTEGER DEFAULT 1"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN timezone TEXT"); } catch {}
    try { db.exec("ALTER TABLE attempts ADD COLUMN tag TEXT"); } catch {}
    try { db.exec("ALTER TABLE attempts ADD COLUMN labels TEXT"); } catch {}
    try { db.exec("ALTER TABLE inbox ADD COLUMN notified_at TEXT"); } catch {}
    try { db.exec("ALTER TABLE bug_reports ADD COLUMN has_recording INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE bug_reports ADD COLUMN rec_mime TEXT"); } catch {}
    try { db.exec("ALTER TABLE bug_reports ADD COLUMN dev_answer_mime TEXT"); } catch {}
    try { db.exec("ALTER TABLE bug_reports ADD COLUMN dev_answer_score INTEGER"); } catch {}
    try { db.exec("ALTER TABLE bug_reports ADD COLUMN dev_answer_feedback TEXT"); } catch {}
    try { db.exec("ALTER TABLE inbox ADD COLUMN att_kind TEXT"); } catch {}
    try { db.exec("ALTER TABLE inbox ADD COLUMN att_ref INTEGER"); } catch {}
    try { db.exec("ALTER TABLE inbox ADD COLUMN att_mime TEXT"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN user_id INTEGER"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN deleted_at TEXT"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN exam_type TEXT"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN notes TEXT"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN school TEXT"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN assess_status TEXT DEFAULT 'done'"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN profile_json TEXT DEFAULT '{}'"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN lang TEXT DEFAULT 'en'"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN deleted_at TEXT"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN is_developer INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN email TEXT"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN name TEXT"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT"); } catch {}
    try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL"); } catch {}
    try { db.exec("ALTER TABLE questions ADD COLUMN flag_reason TEXT"); } catch {}
    try { db.exec("ALTER TABLE questions ADD COLUMN origin TEXT DEFAULT 'generated'"); } catch {}
    try { db.exec("ALTER TABLE questions ADD COLUMN answer_origin TEXT DEFAULT 'ai'"); } catch {}
    try { db.exec("ALTER TABLE questions ADD COLUMN source_url TEXT"); } catch {}
    try { db.exec("ALTER TABLE questions ADD COLUMN is_real INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE questions ADD COLUMN fixed_key TEXT"); } catch {}
    try { db.exec("ALTER TABLE questions ADD COLUMN must_include INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN closed_bank INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE materials ADD COLUMN mime TEXT"); } catch {}
    try { db.exec("ALTER TABLE materials ADD COLUMN stored INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE materials ADD COLUMN auto INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE materials ADD COLUMN ai_style TEXT"); } catch {}
    try { db.exec("ALTER TABLE attempts ADD COLUMN q_stem TEXT"); } catch {}
    try { db.exec("ALTER TABLE attempts ADD COLUMN music_material_id INTEGER"); } catch {}
    try { db.exec("UPDATE materials SET auto=1 WHERE auto IS NOT 1 AND filename LIKE '[配乐]%'"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN onboarded INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN guide_version INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN exam_lang TEXT"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN setup_state TEXT"); } catch {} // draft | generating | null(完成)
    try { db.exec("ALTER TABLE exams ADD COLUMN setup_progress TEXT"); } catch {} // 生成时的当前步骤(白话,给用户看进度)
    // 已完成 = 一个标记,不再用 status=\'completed\' 把考试归档;已完成的考试仍可选中/练习,只是不显示倒计时。
    try { db.exec("ALTER TABLE exams ADD COLUMN completed_at TEXT"); } catch {}
    try { db.exec("UPDATE exams SET completed_at=datetime('now'), status='archived' WHERE status='completed' AND completed_at IS NULL"); } catch {}
    // 砖头(bricks)体系:考试父子关系(某考试作为另一考试的小任务)+ 砖头发布标记
    try { db.exec("ALTER TABLE exams ADD COLUMN parent_exam_id INTEGER"); } catch {}
    try { db.exec("ALTER TABLE knowledge_points ADD COLUMN root_cause INTEGER DEFAULT 0"); } catch {} // 类11:根因诊断标记
    try { db.exec("ALTER TABLE mock_exams ADD COLUMN status TEXT"); } catch {}        // grading/done/failed(后台判题)
    try { db.exec("ALTER TABLE mock_exams ADD COLUMN results_json TEXT"); } catch {}
    try { db.exec("ALTER TABLE mock_exams ADD COLUMN grade_started_at TEXT"); } catch {}  // 后台判题起点,用于卡死自愈
    // 实践作业(编程/项目类):里程碑式任务 + Judge0 代码执行判分 / 证据AI审阅
    try { db.exec(`CREATE TABLE IF NOT EXISTS practical_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, kp_id INTEGER, user_id INTEGER, title TEXT, brief TEXT, language TEXT, milestones_json TEXT, created_at TEXT DEFAULT (datetime('now')))`); } catch {}
    try { db.exec(`ALTER TABLE practical_tasks ADD COLUMN kind TEXT DEFAULT 'practical'`); } catch {}         // 作业类型:practical=里程碑动手作业;assignment=只有作业助手聊天的作业
    try { db.exec(`ALTER TABLE practical_tasks ADD COLUMN completed_at TEXT`); } catch {}                              // assignment 用它标完成(practical 靠里程碑)
    try { db.exec("ALTER TABLE practical_tasks ADD COLUMN due_date TEXT"); } catch {}  // 任务截止日期 YYYY-MM-DD
    try { db.exec(`CREATE TABLE IF NOT EXISTS task_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, milestone_idx INTEGER, user_id INTEGER, submission TEXT, language TEXT, status TEXT, score REAL, feedback TEXT, exec_json TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(task_id, milestone_idx))`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS quiz_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, user_id INTEGER, parts_json TEXT, question_ids_json TEXT, created_at TEXT DEFAULT (datetime('now')))`); } catch {}  // 上传做题:留住上传文件(File API parts)以便"重新识别"
    try { db.exec(`CREATE TABLE IF NOT EXISTS task_test_appeals (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, milestone_idx INTEGER, test_index INTEGER, verdict TEXT, ai_note TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(task_id, milestone_idx, test_index))`); } catch {}  // 测试用例申诉复核
    try { db.exec(`CREATE TABLE IF NOT EXISTS task_chat (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, user_id INTEGER, role TEXT, content TEXT, created_at TEXT DEFAULT (datetime('now')))`); } catch {}  // 实践作业里的做题聊天(临时:任务完成即删,观察已进掌握度)
    try { db.exec(`CREATE TABLE IF NOT EXISTS exam_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, created_at TEXT DEFAULT (datetime('now')))`); } catch {}  // 【考试分组】纯界面/今日任务组织,不动作用域、不合并数据(区别于家族/exam_merge)
    try { db.exec(`CREATE TABLE IF NOT EXISTS exam_group_members (group_id INTEGER, exam_id INTEGER, UNIQUE(group_id, exam_id))`); } catch {}
    // C1/B:自定义互动模式(游戏化玩法 或 自定义考核/考试形式)——由用户或杀手撰写,复用竞技场互动引擎。
    try { db.exec(`CREATE TABLE IF NOT EXISTS custom_modes (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, user_id INTEGER, kind TEXT, name TEXT, emoji TEXT, spec TEXT, meter_label TEXT, win_desc TEXT, meter_start INTEGER DEFAULT 50, meter_dir TEXT DEFAULT 'up', scope TEXT DEFAULT 'exam', created_at TEXT DEFAULT (datetime('now')))`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS custom_mode_results (id INTEGER PRIMARY KEY AUTOINCREMENT, mode_id INTEGER, exam_id INTEGER, user_id INTEGER, score INTEGER, win INTEGER, created_at TEXT DEFAULT (datetime('now')))`); } catch {}  // 自定义考核成绩
    // Workflow Recipe(planner-for-planner)MVP:多阶段学习配方(learning_modes 的超集,先dev灰度)
    try { db.exec(`CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, exam_id INTEGER, name TEXT, description TEXT, spec_json TEXT, priority INTEGER DEFAULT 0, active INTEGER DEFAULT 1, version INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS recipe_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id INTEGER, version INTEGER, spec_json TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now')))`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS recipe_phase_state (id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id INTEGER, phase_index INTEGER, method TEXT, start_json TEXT, start_at TEXT, done_at TEXT, gain REAL, kp_count INTEGER, UNIQUE(recipe_id, phase_index))`); } catch {}  // MVP-2 阶段效果测量
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN redo_json TEXT"); } catch {}  // 回档可重做:存撤销前的状态
    // 【统一聊天】一次性:把现有各考试的聊天记录/摘要合并到"每用户一条"(exam_id = -user_id);记忆不动、仍按考试。
    try {
      const _cd = db.prepare("SELECT value FROM settings WHERE key=?").get("_unify_chat_v1");
      if (!_cd) {
        try { db.exec("UPDATE chat_messages SET exam_id = -(SELECT e.user_id FROM exams e WHERE e.id = chat_messages.exam_id) WHERE exam_id > 0 AND EXISTS(SELECT 1 FROM exams e WHERE e.id = chat_messages.exam_id)"); } catch {}
        try { db.exec("DELETE FROM chat_summary WHERE exam_id > 0"); } catch {}   // 旧的按考试摘要作废,统一摘要会重新累积
        db.prepare("INSERT INTO settings(key,value) VALUES('_unify_chat_v1','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
      }
    } catch {}
    try { db.exec("ALTER TABLE custom_modes ADD COLUMN format TEXT DEFAULT 'interactive'"); } catch {}  // interactive(对话) | video(视频作答)
    // 自愈:早期把自定义考核卡的标题截到20字、描述截到40字(customModes.js),导致"Coding-First Challenge"→"Coding-First Challen"。从 custom_modes 的完整 name/win_desc 回填 feature_registry 与 ui_custom_items(一次性)。
    try {
      const done = db.prepare("SELECT value FROM settings WHERE key=?").get("_heal_xform_labels_v1");
      if (!done) {
        const modes = db.prepare("SELECT id,name,win_desc FROM custom_modes WHERE kind='exam_form'").all();
        const byFid = {}; modes.forEach((m) => { byFid["xform" + m.id] = { name: String(m.name || "").slice(0, 40), desc: String(m.win_desc || "").slice(0, 80) }; });
        // feature_registry.name
        for (const [fid, v] of Object.entries(byFid)) { if (v.name) try { db.prepare("UPDATE feature_registry SET name=? WHERE feature_id=?").run(v.name, fid); } catch {} }
        // ui_custom_items(settings JSON 数组)
        const row = db.prepare("SELECT value FROM settings WHERE key=?").get("ui_custom_items");
        if (row && row.value) {
          try {
            const arr = JSON.parse(row.value).map((it) => { const v = byFid[it.id]; return v ? { ...it, label: v.name || it.label, desc: v.desc || it.desc } : it; });
            db.prepare("INSERT INTO settings(key,value) VALUES('ui_custom_items',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(arr));
          } catch {}
        }
        db.prepare("INSERT INTO settings(key,value) VALUES('_heal_xform_labels_v1','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
      }
    } catch {}
    // 类16 三语迁移追踪:错误来源(母语/二外负迁移…)+ 三语对照表
    try { db.exec(`CREATE TABLE IF NOT EXISTS lang_transfer (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, kp_id INTEGER, attempt_id INTEGER UNIQUE, source TEXT, from_lang TEXT, to_lang TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now')))`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS lang_contrast (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, concept TEXT, native TEXT, l2 TEXT, target TEXT, pitfall TEXT, kind TEXT, created_at TEXT DEFAULT (datetime('now')))`); } catch {}
    // 类4 计划版本对比:每周一份计划快照,用于本周 vs 上周对比
    try { db.exec(`CREATE TABLE IF NOT EXISTS plan_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, week_key TEXT, plan_json TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, week_key))`); } catch {}
    try { db.exec("ALTER TABLE materials ADD COLUMN gemini_uri TEXT"); } catch {}      // Files API 缓存
    try { db.exec("ALTER TABLE materials ADD COLUMN gemini_name TEXT"); } catch {}
    try { db.exec("ALTER TABLE materials ADD COLUMN gemini_expiry TEXT"); } catch {}
    try { db.exec("ALTER TABLE exams ADD COLUMN aggregate_children INTEGER DEFAULT 0"); } catch {} // 汇总复习:母考试是否把子树的知识点/题库/进度合并复习
    // 事实级长期记忆(情景+语义):每条自我评估/偏好/目标作为独立、带时间戳、永不覆盖的事实;冲突并存、按新近加权。
    try { db.exec(`CREATE TABLE IF NOT EXISTS memory_facts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      exam_id INTEGER,
      subject TEXT,
      kind TEXT,
      claim TEXT,
      valence TEXT,
      quote TEXT,
      weight REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      active INTEGER DEFAULT 1
    )`); } catch {}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_memory_user ON memory_facts(user_id, subject)"); } catch {}
    try { db.exec("ALTER TABLE memory_facts ADD COLUMN scope TEXT"); } catch {} // exam / global(仅开发者账号启用分层;旧行=null 视为全局,行为不变)
    // 回档:结构性操作前的状态快照(逐级撤销);以及 AI/用户撤销后沉淀的“教训”
    try { db.exec(`CREATE TABLE IF NOT EXISTS checkpoints (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      run_id INTEGER,
      exam_ids TEXT,
      op TEXT,
      label TEXT,
      snapshot_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      undone INTEGER DEFAULT 0
    )`); } catch {}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_ckpt_user ON checkpoints(user_id, id)"); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS agent_lessons (
      id INTEGER PRIMARY KEY, user_id INTEGER, text TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`); } catch {}
    try { db.exec("CREATE TABLE IF NOT EXISTS brick_flags (name TEXT PRIMARY KEY, published INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')))"); } catch {}
    // 提醒(H3):杀手可排一个到点提醒,到时推送+进收件箱。due_at 为 UTC "YYYY-MM-DD HH:MM:SS"。
    try { db.exec("CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, exam_id INTEGER, text TEXT, due_at TEXT, delivered INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))"); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS learning_modes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      exam_id INTEGER,
      name TEXT,
      rules TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`); } catch {}
    try { db.exec("ALTER TABLE learning_modes ADD COLUMN triggers TEXT"); } catch {}
    // 砖头默认发布(一次性种子:用 INSERT OR IGNORE,之后开发者仍可在实验室里取消发布,不会被重新覆盖)
    try {
      const _bn = ["exam_list","exam_create","exam_set_parent","exam_unset_parent","exam_match_kps","exam_copy_kps","exam_copy_questions","exam_set_aggregate","exam_tree","exam_promote_weak","exam_provision","exam_gen_status","diagnose_root_cause","diagnose_config","bank_list","bank_set_closed","bank_paste","bank_add","bank_set_must","bank_delete","resolve_reference_list","plan_review","study_map","where_to_start","lang_background_set","lang_transfer_analyze","lang_transfer_predict","arena_play","plan_compare","assign_practical_task","list_practical_tasks","delete_practical_task","add_assignment","set_task_due","create_custom_mode","list_custom_modes","generate_custom_modes","recipe_save","recipe_activate","recipe_status","recipe_list","recipe_resegment_preview","recipe_resegment_apply","customize_daily_plan","tweak_daily_plan","recipe_revert","active_rules","recipe_tweak","set_practical_mode","exam_merge","exam_split","exam_integrity_check","set_reminder","list_reminders","plan_by_day","clear_day_plan","plan_from_syllabus"];
      const _st = db.prepare("INSERT OR IGNORE INTO brick_flags(name,published,updated_at) VALUES(?,1,datetime('now'))");
      for (const _n of _bn) _st.run(_n);
      // 一次性:把家族融合/拆分/体检这3个砖头强制置为已发布(即使老库里已有 published=0 的行)——已在开发者账号测试通过,对普通用户开放
      try {
        const _done = db.prepare("SELECT value FROM settings WHERE key=?").get("_publish_family_bricks_v1");
        if (!_done) {
          const _up = db.prepare("INSERT INTO brick_flags(name,published,updated_at) VALUES(?,1,datetime('now')) ON CONFLICT(name) DO UPDATE SET published=1, updated_at=datetime('now')");
          for (const _n of ["exam_merge","exam_split","exam_integrity_check"]) _up.run(_n);
          db.prepare("INSERT INTO settings(key,value) VALUES('_publish_family_bricks_v1','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
        }
      } catch {}
    } catch {}
    // 杀手计划确认门:暂停等主人同意/调整计划
    try { db.exec("ALTER TABLE chat_runs ADD COLUMN pending_kind TEXT"); } catch {}
    try { db.exec("ALTER TABLE chat_runs ADD COLUMN plan_json TEXT"); } catch {}
    try { db.exec("ALTER TABLE chat_runs ADD COLUMN ask_text TEXT"); } catch {}
    try { db.exec("ALTER TABLE daily_plans ADD COLUMN custom INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE materials ADD COLUMN offtopic INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE materials ADD COLUMN offtopic_reason TEXT"); } catch {}
    try { db.exec("ALTER TABLE attempts ADD COLUMN dims_json TEXT"); } catch {} // 表演/口语类每维度评分(eye contact / 结构 / 台词...),用于按维度驱动下一次任务
    try { db.exec("ALTER TABLE chat_files ADD COLUMN source TEXT"); } catch {} // generated=杀手生成的可下载文件;upload=用户在聊天里发的附件(可存进资料库)
    try { db.exec("ALTER TABLE chat_files ADD COLUMN saved_material_id INTEGER"); } catch {} // 该聊天附件已被存进资料库的 material id
    // 一次性清噪:PDF/图片改为一律走 File API 多模态、不再产生 chunk。旧代码给扫描 PDF/图片留下的"薄文字层"碎块是纯噪声,删掉。
    try {
      const done = db.prepare("SELECT value FROM settings WHERE key='mig_drop_pdf_img_chunks'").get();
      if (!done) {
        try { db.prepare("DELETE FROM chunks WHERE material_id IN (SELECT id FROM materials WHERE kind IN ('pdf','image'))").run(); } catch {}
        db.prepare("INSERT INTO settings(key,value) VALUES('mig_drop_pdf_img_chunks','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
      }
    } catch {}
    db.exec(`CREATE TABLE IF NOT EXISTS chat_summary (
      exam_id INTEGER PRIMARY KEY,
      summary TEXT DEFAULT '',
      last_id INTEGER DEFAULT 0
    );`);
    db.exec(`CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      exam_id INTEGER,
      question_id INTEGER,
      body TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );`);
    db.exec(`CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      exam_id INTEGER,
      message TEXT NOT NULL,
      attachments_json TEXT,
      emailed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );`);
    db.exec(`CREATE TABLE IF NOT EXISTS ingest_tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')));`);
    db.exec(`CREATE TABLE IF NOT EXISTS inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lkey TEXT,
      title TEXT,
      body TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      read_at TEXT,
      deleted_at TEXT
    );`);
  globalThis.__beikao_db = db;
  return db;
}

// 懒加载代理:构建期 import 不会打开数据库,首次真正使用时才打开
const db = new Proxy({}, {
  get(_, prop) {
    const d = openDb();
    const v = d[prop];
    return typeof v === "function" ? v.bind(d) : v;
  }
});


export function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}
export function getActiveExam(userId) {
  if (!userId) return null;
  return db.prepare("SELECT * FROM exams WHERE status='active' AND user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1").get(userId);
}

// 汇总复习:某考试的“作用域”= 它自己;若开了 aggregate_children,则再加上它的全部子孙考试(未删除)。
// 用于让母考试的学习/练习/模拟/错题本按整棵子树读取,而不复制任何数据。
export function examScope(examId) {
  const id = Number(examId);
  if (!id) return [];
  // Will 的设计原则:家族=一棵树,激活哪个考试都不该影响视图 → 学习/练习/掌握度/错题/复习/竞技场等一律取【整个家族】(爬到根+全部后代,等同 familyScope),不再看 aggregate_children 开关、也不管激活的是母还是子。材料/RAG 本来就用 familyScope,这样两边统一。
  return familyScope(id);
}
// SQL 片段:形如 "(1,2,3)"(已做数字化,安全)。
export function scopeSql(ids) { return "(" + (ids && ids.length ? ids.map((n) => Number(n)).filter(Number.isFinite).join(",") : "0") + ")"; }
// 目标考试是否在某激活考试的作用域内(用于跨子考试的访问放行)。
export function inScope(activeExamId, targetExamId) {
  const t = Number(targetExamId);
  return examScope(activeExamId).includes(t);
}
// 关联考试共享资料:某考试所在的整棵“家族树”(先上溯到根,再收集根的全部子孙)。
// 任何成员都返回同一组 id;独立考试(无父无子)返回 [自己]。用于让同一棵树里的考试互相共用资料库。
export function rootExamId(examId) {
  let cur = db.prepare("SELECT id, parent_exam_id FROM exams WHERE id=?").get(Number(examId));
  if (!cur) return Number(examId);
  const seen = new Set([cur.id]); let guard = 0;
  while (cur && cur.parent_exam_id && guard++ < 50) {
    const p = db.prepare("SELECT id, parent_exam_id FROM exams WHERE id=? AND deleted_at IS NULL").get(cur.parent_exam_id);
    if (!p || seen.has(p.id)) break;
    seen.add(p.id); cur = p;
  }
  return cur.id;
}
export function familyScope(examId) {
  const root = rootExamId(examId);
  const ids = [root], seen = new Set(ids);
  let frontier = [root], guard = 0;
  while (frontier.length && guard++ < 200) {
    const next = [];
    for (const pid of frontier) {
      const kids = db.prepare("SELECT id FROM exams WHERE parent_exam_id=? AND deleted_at IS NULL").all(pid);
      for (const k of kids) if (!seen.has(k.id)) { seen.add(k.id); ids.push(k.id); next.push(k.id); }
    }
    frontier = next;
  }
  return ids;
}
export function isAggregating(examId) {
  const ex = db.prepare("SELECT aggregate_children FROM exams WHERE id=?").get(Number(examId));
  return !!(ex && ex.aggregate_children);
}
export function getDocument(examId, type) {
  return db.prepare("SELECT * FROM documents WHERE exam_id=? AND type=?").get(examId, type);
}
export function upsertDocument(examId, type, content) {
  db.prepare(`INSERT INTO documents(exam_id,type,content_md,updated_at) VALUES(?,?,?,datetime('now'))
    ON CONFLICT(exam_id,type) DO UPDATE SET content_md=excluded.content_md, updated_at=datetime('now')`).run(examId, type, content);
}
export default db;

// 级联删除一个用户的全部数据
export function purgeUser(userId) {
  const examIds = db.prepare("SELECT id FROM exams WHERE user_id=?").all(userId).map((r) => r.id);
  const tx = db.transaction(() => {
    for (const eid of examIds) {
      db.prepare("DELETE FROM chunks WHERE exam_id=?").run(eid);
      db.prepare("DELETE FROM materials WHERE exam_id=?").run(eid);
      db.prepare("DELETE FROM explanations WHERE kp_id IN (SELECT id FROM knowledge_points WHERE exam_id=?)").run(eid);
      db.prepare("DELETE FROM review_queue WHERE question_id IN (SELECT id FROM questions WHERE exam_id=?)").run(eid);
      db.prepare("DELETE FROM attempts WHERE exam_id=?").run(eid);
      db.prepare("DELETE FROM questions WHERE exam_id=?").run(eid);
      db.prepare("DELETE FROM knowledge_points WHERE exam_id=?").run(eid);
      db.prepare("DELETE FROM chat_messages WHERE exam_id=?").run(eid);
      db.prepare("DELETE FROM daily_plans WHERE exam_id=?").run(eid);
      db.prepare("DELETE FROM documents WHERE exam_id=?").run(eid);
      db.prepare("DELETE FROM exams WHERE id=?").run(eid);
    }
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM users WHERE id=?").run(userId);
  });
  tx();
}
// 清除软删除超过 30 天的账号
export function purgeExpiredBugs() {
  try {
    const dead = db.prepare("SELECT id FROM bug_reports WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')").all();
    for (const r of dead) { try { require("fs").unlinkSync(require("path").join(process.env.DATA_DIR || (process.cwd()+"/data"), "bug_files", String(r.id))); } catch {} }
    db.prepare("DELETE FROM bug_reports WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')").run();
  } catch {}
}
export function purgeExpiredUsers() {
  const rows = db.prepare("SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')").all();
  for (const r of rows) purgeUser(r.id);
  return rows.length;
}

// 开发者一键重置:清空该用户【自己的全部备考数据】(考试及其一切、聊天、记忆、检查点、教训、整体画像),
// 但【保留账号本身】(登录、开发者身份、密钥/设置)。用于反复演示。
export function resetUserData(userId) {
  const uid = Number(userId);
  const examIds = db.prepare("SELECT id FROM exams WHERE user_id=?").all(uid).map((r) => r.id);
  const del = (sql, ...a) => { try { db.prepare(sql).run(...a); } catch {} };
  const tx = db.transaction(() => {
    for (const eid of examIds) {
      del("DELETE FROM chunks WHERE exam_id=?", eid);
      del("DELETE FROM materials WHERE exam_id=?", eid);
      del("DELETE FROM explanations WHERE kp_id IN (SELECT id FROM knowledge_points WHERE exam_id=?)", eid);
      del("DELETE FROM review_queue WHERE question_id IN (SELECT id FROM questions WHERE exam_id=?)", eid);
      del("DELETE FROM attempts WHERE exam_id=?", eid);
      del("DELETE FROM questions WHERE exam_id=?", eid);
      del("DELETE FROM knowledge_points WHERE exam_id=?", eid);
      del("DELETE FROM insights WHERE exam_id=?", eid);
      del("DELETE FROM daily_plans WHERE exam_id=?", eid);
      del("DELETE FROM mock_exams WHERE exam_id=?", eid);
      del("DELETE FROM documents WHERE exam_id=?", eid);
      del("DELETE FROM chat_messages WHERE exam_id=?", eid);
      del("DELETE FROM chat_summary WHERE exam_id=?", eid);
      del("DELETE FROM chat_runs WHERE exam_id=?", eid);
      del("DELETE FROM chat_files WHERE exam_id=?", eid);
      del("DELETE FROM exams WHERE id=?", eid);
    }
    // 用户级 & 无考试对话(哨兵键 -uid)
    del("DELETE FROM memory_facts WHERE user_id=?", uid);
    del("DELETE FROM checkpoints WHERE user_id=?", uid);
    del("DELETE FROM agent_lessons WHERE user_id=?", uid);
    del("DELETE FROM notes WHERE user_id=?", uid);
    del("DELETE FROM browser_jobs WHERE user_id=?", uid);
    del("DELETE FROM chat_messages WHERE exam_id=?", -uid);
    del("DELETE FROM chat_summary WHERE exam_id=?", -uid);
    del("DELETE FROM chat_runs WHERE exam_id=?", -uid);
    del("DELETE FROM chat_files WHERE exam_id=?", -uid);
    // 清掉整体画像,保留账号/设置/登录
    try {
      const u = db.prepare("SELECT profile_json FROM users WHERE id=?").get(uid);
      let p = {}; try { p = JSON.parse(u?.profile_json || "{}"); } catch {}
      delete p.overallDoc; delete p.overallUpdatedAt;
      db.prepare("UPDATE users SET profile_json=? WHERE id=?").run(JSON.stringify(p), uid);
    } catch {}
  });
  tx();
  return { exams: examIds.length };
}

export function purgeExam(examId) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM chunks WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM materials WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM explanations WHERE kp_id IN (SELECT id FROM knowledge_points WHERE exam_id=?)").run(examId);
    db.prepare("DELETE FROM review_queue WHERE question_id IN (SELECT id FROM questions WHERE exam_id=?)").run(examId);
    db.prepare("DELETE FROM attempts WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM questions WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM knowledge_points WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM chat_messages WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM daily_plans WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM mock_exams WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM documents WHERE exam_id=?").run(examId);
    db.prepare("DELETE FROM exams WHERE id=?").run(examId);
  });
  tx();
}
export function purgeExpiredExams() {
  const rows = db.prepare("SELECT id FROM exams WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-60 days')").all();
  for (const r of rows) purgeExam(r.id);
  return rows.length;
}
