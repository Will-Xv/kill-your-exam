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
  const mockRef = useRef(null);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" && localStorage.getItem("kye_welcome_lang");
    if (saved && L[saved]) setLang(saved);
  }, []);
  function pick(l) { setLang(l); try { localStorage.setItem("kye_welcome_lang", l); } catch {} }

  useEffect(() => {
    let raf = 0;
    const scrub = () => {
      raf = 0;
      const vh = window.innerHeight;
      const sy = window.scrollY;
      setScrolled(sy > 24);
      const bg = document.getElementById("kye-bg");
      if (bg) bg.style.transform = `translateY(${(sy * 0.16).toFixed(1)}px)`;
      document.querySelectorAll("[data-scrub]").forEach((el) => {
        const r = el.getBoundingClientRect();
        let p = (vh - r.top) / (vh * 0.62);
        p = Math.max(0, Math.min(1, p));
        const floor = parseFloat(el.dataset.floor || "0");
        const dist = parseFloat(el.dataset.dist || "44");
        const dir = el.dataset.dir || "up";
        const k = (1 - p) * dist;
        let x = 0, y = 0;
        if (dir === "up") y = k; else if (dir === "down") y = -k;
        else if (dir === "left") x = -k; else if (dir === "right") x = k;
        el.style.opacity = (floor + (1 - floor) * p).toFixed(3);
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      });
      document.querySelectorAll("[data-para]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2 - vh / 2;
        el.style.transform = `translate3d(0,${(-center * parseFloat(el.dataset.para)).toFixed(1)}px,0)`;
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(scrub); };
    scrub();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const t = setTimeout(scrub, 60);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); clearTimeout(t); };
  }, [lang]);

  function tilt(e) {
    const el = mockRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = ((e.clientY - r.top) / r.height - 0.5) * -10;
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 12;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
  function untilt() { if (mockRef.current) mockRef.current.style.transform = "perspective(900px) rotateX(0) rotateY(0)"; }

  const t = L[lang];
  const rtl = lang === "ar";

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="relative min-h-screen overflow-x-clip bg-[#04201f] text-white">
      <div id="kye-bg" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden will-change-transform">
        <div className="kye-blob h-96 w-96 bg-emerald-500/40" style={{ top: "-6rem", left: "-4rem", animation: "kyeFloat 11s ease-in-out infinite" }} />
        <div className="kye-blob h-[28rem] w-[28rem] bg-cyan-500/30" style={{ top: "18%", right: "-8rem", animation: "kyeDrift 15s ease-in-out infinite" }} />
        <div className="kye-blob h-80 w-80 bg-teal-400/30" style={{ bottom: "-6rem", left: "28%", animation: "kyeFloat2 13s ease-in-out infinite" }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(45,212,191,.16),transparent_60%)]" />
      </div>

      {/* sticky frosted nav */}
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

      {/* hero */}
      <section className="relative mx-auto max-w-6xl px-6 pt-32 pb-24 text-center md:pt-40">
        <Dots className="left-0 top-24 h-40 w-40 opacity-40 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
        <p data-scrub data-floor="0" className="mx-auto mb-6 w-fit rounded-full bg-white/10 px-4 py-1.5 text-sm text-emerald-200 ring-1 ring-white/15">✨ {t.badge}</p>
        <h1 data-scrub data-floor="0.15" data-dir="left" data-dist="60" className="font-hero text-6xl leading-[1.04] tracking-tight md:text-8xl">
          {t.h1a}<br /><span className="kye-gradtext">{t.h1b}</span>
        </h1>
        <p data-scrub data-dir="right" data-dist="60" className="mx-auto mt-8 max-w-2xl text-lg text-slate-300 md:text-xl">{t.sub}</p>
        <div data-scrub className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a href="/" className="group rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 px-8 py-4 text-lg font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-2xl">
            {t.start} <span className="inline-block transition group-hover:translate-x-1">→</span>
          </a>
        </div>
        <div data-scrub className="mx-auto mt-16 grid max-w-xl grid-cols-3 gap-4 text-center">
          {[["7", t.s1], ["100%", t.s2], ["24/7", t.s3]].map(([a, b]) => (
            <div key={b} className="rounded-2xl bg-white/5 py-4 ring-1 ring-white/10"><div className="font-hero text-3xl">{a}</div><div className="mt-1 text-xs text-slate-400">{b}</div></div>
          ))}
        </div>
      </section>

      {/* why — nanfu-style split with glowing app mock + scroll-scrubbed reasons */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-12 overflow-hidden px-6 py-24 md:grid-cols-2">
        <Dots className="-right-10 bottom-0 h-56 w-56 opacity-40 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
        <div data-scrub data-dir="left" data-dist="80" className="mx-auto w-full max-w-md">
        <div ref={mockRef} onMouseMove={tilt} onMouseLeave={untilt} className="relative transition-transform duration-200 will-change-transform">
          <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-emerald-400/30 to-cyan-400/20 blur-2xl" />
          <div className="relative rounded-[2rem] bg-[#0a2b2a] p-5 ring-1 ring-white/10 shadow-2xl">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white">
              <div className="text-lg font-black">MAT235 midterm</div>
              <div className="mt-1 text-emerald-100 text-sm">Kill in <span className="font-hero text-3xl align-middle text-white">2</span> days</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                {[["12","today"],["86%","acc."],["7","streak"]].map(([a,b])=>(<div key={b} className="rounded-xl bg-white/10 py-2"><div className="font-bold">{a}</div><div className="text-emerald-100/80">{b}</div></div>))}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {["✓  Review due mistakes","2  Vectors & planes","3  Free practice (0/10)"].map((r,i)=>(
                <div key={i} className={"rounded-xl px-3 py-2.5 text-sm ring-1 " + (i===0?"bg-emerald-500/15 text-emerald-200 ring-emerald-400/20":"bg-white/5 text-slate-300 ring-white/10")}>{r}</div>
              ))}
            </div>
          </div>
        </div>
        </div>
        <div>
          <h2 data-scrub data-floor="0.12" data-dir="right" data-dist="60" className="font-hero text-4xl md:text-6xl">{t.whyT}</h2>
          <div className="mt-8 space-y-7">
            {t.why.map((w, i) => (
              <div key={i} data-scrub data-dir="right" data-dist="50" className="border-l-2 border-emerald-400/60 pl-5 rtl:border-l-0 rtl:border-r-2 rtl:pr-5 rtl:pl-0">
                <h3 className="text-xl font-bold text-emerald-200">{w[0]}</h3>
                <p className="mt-1 text-slate-300">{w[1]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <h2 data-scrub data-floor="0.12" className="font-hero text-center text-4xl md:text-5xl">{t.featT}</h2>
        <p data-scrub className="mx-auto mt-3 max-w-xl text-center text-slate-400">{t.featS}</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {t.feats.map((f, i) => (
            <div key={i} data-scrub data-dir={["left","up","right"][i%3]} data-dist="56" className="kye-card rounded-3xl bg-white/[0.04] p-6 ring-1 ring-white/10 backdrop-blur">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-500/20 text-3xl ring-1 ring-white/15">{f[0]}</div>
              <h3 className="mt-4 text-xl font-bold">{f[1]}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{f[2]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* steps */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 data-scrub data-floor="0.12" className="font-hero text-center text-4xl md:text-5xl">{t.stepT}</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {t.steps.map((s, i) => (
            <div key={i} data-scrub data-dir={["left","up","right"][i%3]} data-dist="56" className="rounded-3xl bg-white/5 p-8 ring-1 ring-white/10">
              <div className="font-hero text-6xl text-emerald-300/40">{i + 1}</div>
              <h3 className="mt-2 text-2xl font-bold">{s[0]}</h3>
              <p className="mt-2 text-slate-300">{s[1]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* final cta */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div data-scrub className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 p-12 ring-1 ring-white/15 backdrop-blur">
          <Dots className="right-4 top-4 h-40 w-40 opacity-30 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
          <h2 className="font-hero text-4xl md:text-6xl">{t.ctaT}</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">{t.ctaS}</p>
          <a href="/" className="mt-8 inline-block rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 px-10 py-4 text-lg font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:-translate-y-0.5">{t.ctaB} →</a>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-sm text-slate-500">
        © 2026 Kill Your Exam · <a href="/privacy" className="underline hover:text-slate-300">{t.priv}</a> · <a href="/" className="underline hover:text-slate-300">{t.enter}</a>
      </footer>
    </div>
  );
}
