import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let db = globalThis.__beikao_db;
if (!db) {
  db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
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
  `);
  try { db.exec("ALTER TABLE exams ADD COLUMN user_id INTEGER"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN lang TEXT DEFAULT 'zh'"); } catch {}
  globalThis.__beikao_db = db;
}

export function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}
export function getActiveExam(userId) {
  if (!userId) return null;
  return db.prepare("SELECT * FROM exams WHERE status='active' AND user_id=? ORDER BY id DESC LIMIT 1").get(userId);
}
export function getDocument(examId, type) {
  return db.prepare("SELECT * FROM documents WHERE exam_id=? AND type=?").get(examId, type);
}
export function upsertDocument(examId, type, content) {
  db.prepare(`INSERT INTO documents(exam_id,type,content_md,updated_at) VALUES(?,?,?,datetime('now'))
    ON CONFLICT(exam_id,type) DO UPDATE SET content_md=excluded.content_md, updated_at=datetime('now')`).run(examId, type, content);
}
export default db;
