# Kill Your Exam

An AI-driven, exam-agnostic study companion. Give it any exam and it first researches the exam online, honestly reports what it does and doesn't know, then builds a personalized knowledge map, generates and grades questions, tracks your true understanding, and drills your weak spots until you "kill" the exam.

Open the same URL on phone or desktop — progress syncs automatically (all data lives on the server). Live at **killyourexam.up.railway.app**.

The default UI language is English, with a playful "assassin / murder plan" theme (the exam is the target, the AI is your private killer), and full localization into 7 languages (including Chinese, with the killer/追杀 wording most vivid there).

---

## Features

### Exam setup & onboarding
- **New-exam wizard**: pick a type (school / professional / language / entrance / other / "study-only"), then the AI searches the exam online and produces a **cognitive self-assessment** (what it knows, what it doesn't, the risks) — it does not pretend to be omniscient.
- Flow: exam info → online research + self-assessment → supplementary materials (upload files + answer an AI-generated checklist, skippable) → knowledge tree + strategy.
- Suggests borrowable materials from your other exams via embedding similarity.

### Multimodal material library (RAG)
- Upload PDF / Word / text / images / audio (camera capture, drag, paste). A free-text "other notes" field and a collection checklist.
- Every file is viewable in place (image / audio player / inline PDF / extracted text).
- **Chrome capture extension** pulls content (incl. images/audio/PDFs) from logged-in study sites into the library, without touching your password.
- Images, audio, and PDFs are read **natively by Gemini** across explanation, question generation, grading, mock exams, chat, and tree building.

### Knowledge tree & mastery
- A personalized knowledge map, colored by mastery (mastered / ok / weak / unlearned) with material-coverage dots.
- **Mastery reflects understanding, not just right/wrong**: it weighs three kinds of evidence (answers, short-answer reasoning, and discussion) with recency weighting.
- **Cross-topic inference**: showing understanding of another topic in an answer/discussion updates that topic too; showing a misconception marks it weak.
- **Rebuild tree** (via the killer) with a retention choice: keep (semantically migrate old records), summarize (condense into observations on new points), or wipe.

### Learn & practice
- Per-topic AI explanations with source badges (material-based vs model-knowledge).
- Practice by weak topic with instant grading; short answers scored with feedback.
- **Ask / argue**: the AI only changes a grade when you're genuinely right — never to please you; the revised verdict updates live.
- **Handwriting** (stylus/pad/mouse) or photo upload, OCR-graded; a per-question scratchpad (hidden from the AI unless you send it).
- **"Don't know"** button on all question types.

### Performance / skill exams (art, recitation, singing, speech, dance…)
- **Audio & video answers**, graded multimodally against a rubric.
- Video is analyzed by sampling frames across the whole clip (up to 5fps, 720p) plus the extracted audio track — reliable for any length, no size/timeout limits.
- Beat alignment for given-music tasks; a mic-off exception for dance-with-given-music (so the phone can keep playing the music); performance replays are stored permanently.

### Mock exams
- The AI plans an **exam blueprint** (which topics, how many questions each, marks, total, duration) and assembles the paper from it (generating what the bank lacks).
- **Question count follows the real exam** (not a fixed 20); a **structure-source confidence** badge (official / inferred / estimated).
- **Real-paper mode** (only your provided materials); persistent state across refresh; history; post-submission discuss that re-grades and recomputes the total.
- **User question bank / closed bank**: paste known/guaranteed questions in verbatim, mark some "always include", or lock practice + mock to only your provided questions.

### The Killer (agentic chat)
- Your private assistant that operates the study loop with tools (read/write docs, RAG, web search, generate questions, build tree, send files, customize the blueprint, drive the capture extension, …).
- Runs as a **background job** (survives disconnect) with a live process panel and reconnect.
- **Planner**: complex/system-affecting requests produce a previewable ordered plan you can one-click approve or revise before execution; simple requests skip it.
- Dangerous writes still ask for per-action confirmation; confirmations arrive as an in-app banner or a push when you're away.

### Social & engagement
- **Leaderboard** (weekly + all-time by questions done) with a medieval hand-drawn sticker theme; **taunt / disdain** duels with real-time popups.
- **Inbox** (updates, bug replies, letters/attachments), **Web Push notifications** with per-category prefs and an iOS "add to Home Screen" note.

### Feedback & support
- **One-tap bug report** that ships the whole question to admins/developers (media, the user's recording, their answer, the AI's grade incl. failures, discussion) with device diagnostics; developers can "try it themselves" to reproduce and send a demo answer back to the user.
- A floating feedback button (prefilled email).

### Platform
- **7 UI languages** (Simplified Chinese, English, French, Spanish, Russian, Arabic w/ RTL, Indonesian) + Traditional Chinese (TW/HK); all new features localized.
- Daily task home, wrong-question book with spaced repetition (1/3/7/15/30 days), notebook, "all your killing skills" cross-exam profile, pre-exam prep.
- PWA; data export; admin panel (usage frequency only, never learning content); developer sub-accounts with debug tools and quick account switching.

---

## Tech stack
- **Next.js 15** (App Router, JS) + Tailwind CSS
- **SQLite** (better-sqlite3); data dir via `DATA_DIR` (default `./data`)
- **Google Gemini** (`@google/genai`) — generation / JSON / grounded search / multimodal / embeddings; model configurable in Settings
- Vector retrieval: Gemini embeddings + in-memory cosine similarity
- **Web Push** (VAPID), service worker; **ffmpeg** (video frame extraction, audio transcode, beat detection) and Noto CJK fonts in the runtime image
- Background agent jobs on the persistent server; IndexedDB client persistence; LaTeX rendering
- Deployed on **Railway** via a standalone Docker build; auto-deploy on push

## Deploy (Railway)
1. Push this repo to GitHub.
2. railway.app → New Project → Deploy from GitHub repo (the Dockerfile is auto-detected).
3. Attach a Volume with mount path `/data` (the database lives here; survives redeploys).
4. Set variables: `ACCESS_CODE` (registration invite code) and `PORT=3000`.
5. Settings → Networking → Generate Domain.
6. Open the URL → register the first account (becomes admin) → paste your Gemini API key in Settings → test connection → set up an exam.

## Local development
```bash
npm install
npm run dev        # http://localhost:3000
```
Optional env: `ACCESS_CODE` (invite code); `GEMINI_API_KEY` can also be entered in Settings.

## Project structure
```
app/                      Pages & API routes
  onboarding/             New-exam wizard (self-assessment / checklist / upload)
  study/  practice/       Knowledge tree + explanations; question practice & grading
  mock/                   Mock exams, blueprint, question bank, history
  materials/  chat/        Material library (RAG); the Killer agent (with tools)
  performances/           Performance replays + AI feedback
  bugs/  inbox/  dev/      Bug console; message inbox; developer tools
lib/db.js                 SQLite schema & queries
lib/gemini.js             Gemini adapter (generate / JSON / search / multimodal / embed)
lib/generators.js         Knowledge-tree build/rebuild + question generation
lib/blueprint.js          Mock blueprint + paper composition
lib/chatAgent.js          The Killer: tools, planner, background run loop
lib/media.js              ffmpeg: frame extraction, audio/mp3 transcode, beat detection
lib/bricks/               Isolated composable "bricks" (e.g. cross-exam management)
lib/translations.js       i18n dictionaries
```

## Vision (in progress)
Turning the app from a single study tool into a **configurable learning-agent platform**: choose or let the AI design a workflow to match your plan (study-only, practice-only, discuss-only, homework help, Socratic tutoring, closed question banks, cross-exam sub-tasks…), with a customizable UI where no function is ever lost, domain-isolated agents, previewable plans, and one-click revert. The ultimate goal: anyone facing any learning goal gets an AI that truly understands them and helps their way — killing an exam is only the start.

Maintainer: Will &lt;xuy413682@gmail.com&gt;
