"use client";
import { useEffect, useRef, useState } from "react";

const LANGS = [["en","English"],["zh","中文"],["fr","Français"],["es","Español"],["ru","Русский"],["ar","العربية"],["id","Bahasa"]];

const L = {
  en: { enter:"Enter app", badge:"Your personal AI exam coach", h1a:"Any exam,", h1b:"aced.",
    sub:"Upload your materials — the AI explains topics, writes practice, tracks progress and plans your prep. Treat every exam as prey.",
    start:"Get started", see:"See features", s1:"languages", s2:"from your materials", s3:"always available",
    whyT:"Why Kill Your Exam", why:[["Actually knows your material","Explanations and questions are grounded in the files you upload — not generic guesses."],["A plan that adapts to you","Mastery tracking, spaced-repetition review and a strategy that auto-adjusts as you go."],["One assistant, full control","The chat AI can see and change anything — with your approval — and even collect pages from the web."]],
    featT:"What it does for you", featS:"A full prep loop, from setup to exam-day sprint.",
    feats:[["🗡️","Murder Plan","Manage every exam in one place, switch in a tap, countdowns and progress at a glance."],["📖","Learn + Practice","AI teaches from your materials, grades instantly; wrong answers return on a 1/3/7/15/30-day schedule."],["💬","Ask Killer","Your AI assistant — sees and edits anything (with your OK), and can drive the extension to collect from sites."],["🧭","All Your Killing Skills","A long-term profile across all your exams that gets to know you and feeds every subject."],["📚","Library · RAG","Upload PDF / Word / images or collect from the web; teaching and questions stay grounded in your data."],["🎒","Slaughter Prep · Mock","Exam-day reminders, rules and mindset, plus timed full mock papers with score reports."]],
    stepT:"Three steps to the kill", steps:[["Add an exam","Pick a type and name it (study-only is fine). The AI does an honest self-check."],["Feed materials","Upload syllabus, textbooks, past papers — or let the extension collect from the web."],["Go for the kill","Learn, drill real papers, ask Killer; progress and strategy update themselves."]],
    ctaT:"Ready to kill your next exam?", ctaS:"Set up an exam in 5 minutes — start today.", ctaB:"Enter now", priv:"Privacy" },
  zh: { enter:"进入应用", badge:"你的私人 AI 备考教练", h1a:"任何考试,", h1b:"轻松通过。",
    sub:"上传你的资料,AI 讲知识点、出练习题、盯进度、排计划——把每一场考试当成猎物。",
    start:"立即开始", see:"看看功能", s1:"种语言", s2:"基于你的资料", s3:"随时可用",
    whyT:"为什么选 Kill Your Exam", why:[["真的懂你的资料","讲解和出题都基于你上传的文件,而不是泛泛而谈、瞎猜。"],["会随你调整的计划","掌握度追踪、间隔重复复习,备考策略随进度自动调整。"],["一个助手,全程掌控","聊天 AI 什么都能看、能改(改前先问你),还能指挥扩展去网页采集。"]],
    featT:"它能替你做的事", featS:"一整套备考闭环,从建考试到临考冲刺。",
    feats:[["🗡️","追杀计划","多门考试统一管理、一键切换,倒计时和进度一目了然。"],["📖","学习 + 练习","AI 依据你的资料讲知识点、即时批改;答错的按 1/3/7/15/30 天科学重练。"],["💬","问问杀手","你的 AI 助手,什么都能看能改(改前征求同意),还能指挥扩展去网站采集。"],["🧭","你的全部杀技","一份跨所有考试的长期画像,越用越懂你,喂给每一门考试。"],["📚","资料库 · RAG","上传 PDF/Word/图片或网页采集;讲解出题都基于你自己的资料。"],["🎒","屠杀准备 · 模拟考","考前提醒、规则心态,加限时全真模拟卷和成绩报告。"]],
    stepT:"三步开杀", steps:[["建考试","选类型、填名字(只想学不考试也行),AI 先做认知自评。"],["喂资料","上传大纲教材真题,或让扩展从网页采集进资料库。"],["开杀","学知识、练真题、问问杀手,进度和策略自动更新。"]],
    ctaT:"准备好干掉下一场考试了吗?", ctaS:"花 5 分钟建好考试,今天就开始。", ctaB:"立即进入", priv:"隐私政策" },
  fr: { enter:"Ouvrir l'app", badge:"Ton coach d'examen IA personnel", h1a:"N'importe quel examen,", h1b:"réussi.",
    sub:"Téléverse tes documents — l'IA explique, crée des exercices, suit tes progrès et planifie ta prépa.",
    start:"Commencer", see:"Voir les fonctions", s1:"langues", s2:"selon tes documents", s3:"disponible 24/7",
    whyT:"Pourquoi Kill Your Exam", why:[["Il connaît vraiment tes documents","Explications et questions fondées sur tes fichiers, pas des généralités."],["Un plan qui s'adapte à toi","Suivi de maîtrise, révisions espacées et stratégie auto-ajustée."],["Un assistant, contrôle total","L'IA voit et modifie tout — avec ton accord — et collecte même des pages web."]],
    featT:"Ce qu'il fait pour toi", featS:"Une boucle complète, de la création au sprint final.",
    feats:[["🗡️","Plan de Meurtre","Gère chaque examen au même endroit, bascule d'un clic, compte à rebours clair."],["📖","Apprendre + S'entraîner","L'IA enseigne depuis tes docs, corrige aussitôt ; erreurs revues à 1/3/7/15/30 jours."],["💬","Demande au Tueur","Ton assistant IA voit et modifie tout (avec ton accord) et pilote l'extension de collecte."],["🧭","Tout Ton Art de Tuer","Un profil durable sur tous tes examens qui apprend à te connaître."],["📚","Bibliothèque · RAG","PDF/Word/images ou collecte web ; cours et questions restent fondés sur tes données."],["🎒","Prépa Massacre · Blanc","Rappels jour J, règles et mental, plus des examens blancs chronométrés."]],
    stepT:"Trois pas vers la mise à mort", steps:[["Créer un examen","Choisis un type et un nom (étude seule possible). L'IA fait son auto-bilan."],["Nourrir de documents","Téléverse cours, manuels, annales — ou laisse l'extension collecter."],["Passer à l'attaque","Apprends, révise des annales, demande au Tueur ; tout se met à jour."]],
    ctaT:"Prêt à tuer ton prochain examen ?", ctaS:"Crée un examen en 5 minutes — commence aujourd'hui.", ctaB:"Entrer", priv:"Confidentialité" },
  es: { enter:"Abrir app", badge:"Tu entrenador de examen con IA", h1a:"Cualquier examen,", h1b:"aprobado.",
    sub:"Sube tus materiales — la IA explica, crea práctica, sigue tu progreso y planifica tu preparación.",
    start:"Empezar", see:"Ver funciones", s1:"idiomas", s2:"desde tus materiales", s3:"siempre disponible",
    whyT:"Por qué Kill Your Exam", why:[["Conoce de verdad tus materiales","Explicaciones y preguntas basadas en tus archivos, no en suposiciones."],["Un plan que se adapta a ti","Seguimiento de dominio, repaso espaciado y estrategia que se autoajusta."],["Un asistente, control total","La IA ve y cambia todo — con tu permiso — e incluso recopila páginas web."]],
    featT:"Lo que hace por ti", featS:"Un ciclo completo, de la creación al sprint final.",
    feats:[["🗡️","Plan de Asesinato","Gestiona cada examen en un lugar, cambia con un toque, cuentas atrás claras."],["📖","Aprender + Practicar","La IA enseña desde tus docs y corrige al instante; fallos a 1/3/7/15/30 días."],["💬","Pregunta al Asesino","Tu asistente IA ve y edita todo (con tu permiso) y dirige la extensión de recogida."],["🧭","Todas Tus Habilidades Asesinas","Un perfil a largo plazo de todos tus exámenes que te va conociendo."],["📚","Biblioteca · RAG","PDF/Word/imágenes o recogida web; clases y preguntas basadas en tus datos."],["🎒","Prep. de la Masacre · Simulacro","Recordatorios del día, reglas y mentalidad, y simulacros cronometrados."]],
    stepT:"Tres pasos para matar", steps:[["Crea un examen","Elige tipo y nombre (solo estudiar vale). La IA hace su autoevaluación."],["Alimenta materiales","Sube temario, libros, exámenes — o deja que la extensión recopile."],["A por la caza","Aprende, practica exámenes, pregunta al Asesino; todo se actualiza solo."]],
    ctaT:"¿Listo para matar tu próximo examen?", ctaS:"Crea un examen en 5 minutos — empieza hoy.", ctaB:"Entrar", priv:"Privacidad" },
  ru: { enter:"Открыть", badge:"Твой личный ИИ-тренер по экзаменам", h1a:"Любой экзамен —", h1b:"на отлично.",
    sub:"Загрузи материалы — ИИ объяснит темы, создаст практику, отследит прогресс и составит план.",
    start:"Начать", see:"Функции", s1:"языков", s2:"по твоим материалам", s3:"доступно 24/7",
    whyT:"Почему Kill Your Exam", why:[["Действительно знает твои материалы","Объяснения и вопросы основаны на твоих файлах, а не на общих догадках."],["План, который подстраивается","Отслеживание уровня, интервальное повторение и авто-настройка стратегии."],["Один помощник, полный контроль","ИИ всё видит и меняет — с твоего согласия — и даже собирает страницы из сети."]],
    featT:"Что он делает за тебя", featS:"Полный цикл — от создания до финального рывка.",
    feats:[["🗡️","План убийства","Все экзамены в одном месте, переключение в один тап, наглядные таймеры."],["📖","Учись + Практикуйся","ИИ учит по твоим материалам и сразу проверяет; ошибки — по схеме 1/3/7/15/30 дней."],["💬","Спроси убийцу","ИИ-помощник видит и меняет всё (с твоего согласия) и управляет расширением-сборщиком."],["🧭","Все твои навыки убийцы","Долгосрочный профиль по всем экзаменам, который узнаёт тебя."],["📚","Библиотека · RAG","PDF/Word/картинки или сбор из сети; обучение и вопросы — по твоим данным."],["🎒","Подготовка к бойне · Пробник","Напоминания, правила и настрой, плюс пробники на время с отчётами."]],
    stepT:"Три шага к убийству", steps:[["Создай экзамен","Выбери тип и название (можно просто учиться). ИИ сделает самопроверку."],["Загрузи материалы","Программа, учебники, прошлые работы — или сбор расширением."],["В атаку","Учись, решай прошлые работы, спрашивай убийцу; всё обновляется само."]],
    ctaT:"Готов убить следующий экзамен?", ctaS:"Создай экзамен за 5 минут — начни сегодня.", ctaB:"Войти", priv:"Конфиденциальность" },
  ar: { enter:"ادخل التطبيق", badge:"مدرّبك الشخصي للامتحانات بالذكاء الاصطناعي", h1a:"أي امتحان،", h1b:"بتفوّق.",
    sub:"ارفع موادّك — يشرح الذكاء الاصطناعي المواضيع ويصنع التدريبات ويتابع تقدّمك ويخطّط مذاكرتك.",
    start:"ابدأ الآن", see:"المزايا", s1:"لغات", s2:"من موادّك", s3:"متاح دائمًا",
    whyT:"لماذا Kill Your Exam", why:[["يعرف موادّك فعلاً","الشروح والأسئلة مبنية على ملفاتك، لا على تخمينات عامة."],["خطة تتكيّف معك","تتبّع الإتقان، مراجعة متباعدة، واستراتيجية تُضبط تلقائيًا."],["مساعد واحد، تحكّم كامل","يرى ويعدّل كل شيء — بموافقتك — ويجمع صفحات الويب أيضًا."]],
    featT:"ما الذي يفعله لك", featS:"دورة تحضير كاملة من الإنشاء إلى السباق النهائي.",
    feats:[["🗡️","خطة القتل","أدر كل امتحاناتك في مكان واحد، بدّل بلمسة، وعدّات تنازلية واضحة."],["📖","تعلّم + تدرّب","يشرح من موادّك ويصحّح فورًا؛ الأخطاء تُراجَع وفق 1/3/7/15/30 يومًا."],["💬","اسأل القاتل","مساعدك يرى ويعدّل كل شيء (بموافقتك) ويدير إضافة الجمع."],["🧭","كل مهارات القتل لديك","ملف طويل الأمد عبر كل امتحاناتك يتعرّف عليك."],["📚","المكتبة · RAG","PDF/Word/صور أو جمع من الويب؛ الشرح والأسئلة من بياناتك."],["🎒","تحضير المذبحة · تجريبي","تذكيرات اليوم والقواعد والحالة، مع نماذج مؤقتة وتقارير."]],
    stepT:"ثلاث خطوات للقتل", steps:[["أنشئ امتحانًا","اختر نوعًا واسمًا (التعلّم فقط ممكن). يقوم الذكاء بتقييم ذاتي."],["زوّده بالمواد","ارفع المنهج والكتب والنماذج — أو دع الإضافة تجمع."],["انطلق للقتل","تعلّم، تدرّب على النماذج، اسأل القاتل؛ كله يتحدّث تلقائيًا."]],
    ctaT:"مستعد لقتل امتحانك القادم؟", ctaS:"جهّز امتحانًا في 5 دقائق — ابدأ اليوم.", ctaB:"ادخل", priv:"الخصوصية" },
  id: { enter:"Masuk aplikasi", badge:"Pelatih ujian AI pribadimu", h1a:"Ujian apa pun,", h1b:"lulus dengan baik.",
    sub:"Unggah materimu — AI menjelaskan topik, membuat latihan, memantau kemajuan, dan menyusun rencana.",
    start:"Mulai", see:"Lihat fitur", s1:"bahasa", s2:"dari materimu", s3:"selalu tersedia",
    whyT:"Kenapa Kill Your Exam", why:[["Benar-benar tahu materimu","Penjelasan dan soal berdasar berkasmu, bukan tebakan umum."],["Rencana yang menyesuaikan","Pelacakan penguasaan, ulangan berjarak, strategi menyesuaikan otomatis."],["Satu asisten, kendali penuh","AI melihat dan mengubah apa saja — dengan izinmu — bahkan mengumpulkan halaman web."]],
    featT:"Yang dikerjakan untukmu", featS:"Satu siklus lengkap, dari setup sampai sprint hari-H.",
    feats:[["🗡️","Rencana Pembunuhan","Kelola semua ujian di satu tempat, ganti sekali ketuk, hitung mundur jelas."],["📖","Belajar + Latihan","AI mengajar dari materimu dan menilai instan; salah diulang 1/3/7/15/30 hari."],["💬","Tanya Sang Pembunuh","Asistenmu melihat & mengubah apa saja (dengan izinmu) dan mengarahkan ekstensi."],["🧭","Semua Keahlian Membunuhmu","Profil jangka panjang lintas ujian yang mengenalmu."],["📚","Perpustakaan · RAG","PDF/Word/gambar atau ambil dari web; ajaran & soal berdasar datamu."],["🎒","Persiapan Pembantaian · Simulasi","Pengingat hari-H, aturan & mental, plus simulasi berwaktu."]],
    stepT:"Tiga langkah membunuh", steps:[["Buat ujian","Pilih tipe & nama (hanya belajar juga bisa). AI menilai diri jujur."],["Beri materi","Unggah silabus, buku, soal — atau biarkan ekstensi mengambil."],["Serang","Belajar, latih soal, tanya Sang Pembunuh; semua diperbarui sendiri."]],
    ctaT:"Siap membunuh ujianmu berikutnya?", ctaS:"Siapkan ujian dalam 5 menit — mulai hari ini.", ctaB:"Masuk", priv:"Privasi" },
};

function Dots({ className, style }) {
  return <div className={"pointer-events-none absolute " + className} style={{ backgroundImage: "radial-gradient(rgba(45,212,191,.55) 1.6px, transparent 1.6px)", backgroundSize: "24px 24px", ...style }} />;
}

export default function Welcome() {
  const [lang, setLang] = useState("en");
  const [scrolled, setScrolled] = useState(false);
  const [desktop, setDesktop] = useState(true);
  const sceneRef = useRef(null);
  const bookRef = useRef(null);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" && localStorage.getItem("kye_welcome_lang");
    if (saved && L[saved]) setLang(saved);
  }, []);
  function pick(l) { setLang(l); try { localStorage.setItem("kye_welcome_lang", l); } catch {} }

  // 营销页强制整页深色底
  useEffect(() => {
    const b = document.body.style.background, h = document.documentElement.style.background;
    document.body.style.background = "#04201f";
    document.documentElement.style.background = "#04201f";
    return () => { document.body.style.background = b; document.documentElement.style.background = h; };
  }, []);

  const t = L[lang];
  const rtl = lang === "ar";
  const feats = t.feats.slice(0, 4);
  // 书页:封面 + 4 内容页 + tryout
  const pages = [{ type: "cover" }, ...feats.map((f) => ({ type: "feat", f })), { type: "cta" }];

  // 翻书:滚动驱动。顶部静止 → 空翻两圈 → 逐页翻 → tryout
  useEffect(() => {
    const isDesk = window.matchMedia("(min-width: 821px) and (pointer: fine)").matches;
    setDesktop(isDesk);
    if (!isDesk) return;
    const scene = sceneRef.current, book = bookRef.current;
    if (!scene || !book) return;
    const leaves = [...book.querySelectorAll(".fb-leaf")];
    const flips = leaves.length - 1;
    const somerEnd = 0.2;
    let raf = 0;
    const upd = () => {
      raf = 0;
      const total = Math.max(1, scene.offsetHeight - window.innerHeight);
      const p = Math.max(0, Math.min(1, -scene.getBoundingClientRect().top / total));
      setScrolled(window.scrollY > 24);
      if (p < somerEnd) {
        const q = p / somerEnd;
        book.style.transform = `translateZ(${(-2600 * (1 - q)).toFixed(0)}px) rotateX(${(q * 720).toFixed(1)}deg)`;
      } else {
        book.style.transform = "translateZ(0px) rotateX(0deg)";
      }
      const segLen = (1 - somerEnd) / flips;
      const depth = 32;
      leaves.forEach((leaf, i) => {
        const baseZ = -(i / Math.max(1, leaves.length - 1)) * depth;
        if (i === leaves.length - 1) { leaf.style.transform = `translateZ(${baseZ.toFixed(1)}px) rotateY(0deg)`; leaf.style.zIndex = "0"; return; }
        const local = Math.max(0, Math.min(1, (p - (somerEnd + i * segLen)) / segLen));
        leaf.style.transform = `translateZ(${baseZ.toFixed(1)}px) rotateY(${(-178 * local).toFixed(1)}deg)`;
        leaf.style.zIndex = String(local < 0.5 ? 100 - i : 10 + i);
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    upd();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const tm = setTimeout(upd, 120);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); clearTimeout(tm); };
  }, [lang, desktop]);

  function Front({ pg, i }) {
    if (pg.type === "cover") return (
      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-800 p-8 text-center">
        <p className="rounded-full bg-white/15 px-3 py-1 text-xs text-emerald-50 ring-1 ring-white/20">✨ {t.badge}</p>
        <div className="mt-6 text-6xl">📘</div>
        <h1 className="font-hero mt-4 text-5xl leading-[1.02]">Kill Your<br /><span className="kye-gradtext">Exam</span></h1>
        <p className="mt-5 text-sm text-emerald-50/90">{t.h1a} {t.h1b}</p>
        <p className="mt-8 animate-bounce text-emerald-100/80">↓</p>
      </div>
    );
    if (pg.type === "cta") return (
      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-emerald-500 to-cyan-700 p-8 text-center">
        <h2 className="font-hero text-4xl leading-tight text-white">{t.ctaT}</h2>
        <p className="mt-4 max-w-xs text-emerald-50">{t.ctaS}</p>
        <a href="/" className="mt-7 rounded-2xl bg-white px-8 py-3 text-lg font-bold text-emerald-800 shadow-lg transition hover:-translate-y-0.5">{t.ctaB} →</a>
      </div>
    );
    const f = pg.f;
    return (
      <div className="flex h-full flex-col justify-center bg-gradient-to-br from-[#0d322d] to-[#081f1d] p-9">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-4xl ring-1 ring-white/15">{f[0]}</div>
        <h3 className="font-hero mt-5 text-3xl text-white">{f[1]}</h3>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">{f[2]}</p>
        <div className="mt-auto pt-6 text-xs text-slate-500">{i} / {pages.length - 1}</div>
      </div>
    );
  }

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="relative text-white">
      <div className="fixed inset-0 bg-[#04201f]" style={{ zIndex: -20 }} />
      <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -10 }}>
        <div className="kye-blob h-96 w-96 bg-emerald-500/40" style={{ top: "-6rem", left: "-4rem", animation: "kyeFloat 12s ease-in-out infinite" }} />
        <div className="kye-blob h-[28rem] w-[28rem] bg-cyan-500/25" style={{ top: "20%", right: "-8rem", animation: "kyeDrift 16s ease-in-out infinite" }} />
        <div className="kye-blob h-80 w-80 bg-teal-400/25" style={{ bottom: "-6rem", left: "30%", animation: "kyeFloat2 14s ease-in-out infinite" }} />
      </div>

      <header className={"fixed inset-x-0 top-0 z-50 transition-all duration-300 " + (scrolled ? "bg-[#04201f]/70 backdrop-blur-xl ring-1 ring-white/10" : "")}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-xl font-black">📘 Kill Your <span className="text-emerald-300">Exam</span></div>
          <div className="flex items-center gap-3">
            <select value={lang} onChange={(e) => pick(e.target.value)} className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/20 outline-none">
              {LANGS.map(([c, n]) => <option key={c} value={c} className="text-black">{n}</option>)}
            </select>
            <a href="/" className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20">{t.enter} →</a>
          </div>
        </div>
      </header>

      {desktop ? (
        <section ref={sceneRef} style={{ height: `${pages.length * 108}vh` }} className="relative">
          <div className="fb-stage">
            <div ref={bookRef} className="fb-book">
              <div className="fb-thick" style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", zIndex: 0 }}>
                <div style={{ position: "absolute", inset: 0, transform: "translateZ(-34px)", borderRadius: "6px 16px 16px 6px", background: "linear-gradient(135deg,#0c7568,#0a4a43)", boxShadow: "0 45px 80px -26px rgba(0,0,0,.7)" }} />
                <div style={{ position: "absolute", top: 0, right: 0, width: "34px", height: "100%", transformOrigin: "right center", transform: "rotateY(-90deg)", background: "repeating-linear-gradient(to bottom,#eef6f3 0 2px,#c9e2db 2px 4px)" }} />
                <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: "34px", transformOrigin: "bottom center", transform: "rotateX(90deg)", background: "repeating-linear-gradient(to right,#eef6f3 0 2px,#c9e2db 2px 4px)" }} />
                <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "34px", transformOrigin: "top center", transform: "rotateX(-90deg)", background: "repeating-linear-gradient(to right,#eef6f3 0 2px,#c9e2db 2px 4px)" }} />
              </div>
              {pages.map((pg, i) => (
                <div key={i} className="fb-leaf" style={{ zIndex: pages.length - i }}>
                  <div className="fb-face"><Front pg={pg} i={i} /></div>
                  <div className="fb-face fb-back" style={{ background: "linear-gradient(90deg,#0b3b34,#0e463d)" }} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="mx-auto max-w-md space-y-5 px-5 pb-16 pt-24">
          {pages.map((pg, i) => (
            <div key={i} className="overflow-hidden rounded-3xl ring-1 ring-white/10">
              <div className="min-h-[60vh]"><Front pg={pg} i={i} /></div>
            </div>
          ))}
        </div>
      )}

      <footer className="relative z-10 mx-auto max-w-6xl px-6 py-10 text-center text-sm text-slate-500">
        © 2026 Kill Your Exam · <a href="/privacy" className="underline hover:text-slate-300">{t.priv}</a> · <a href="/" className="underline hover:text-slate-300">{t.enter}</a>
      </footer>
    </div>
  );
}
