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
export function purgeExpiredUsers() {
  const rows = db.prepare("SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')").all();
  for (const r of rows) purgeUser(r.id);
  return rows.length;
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
