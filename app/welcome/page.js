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


// 中世纪羊皮纸墨色
const INK = "#3a2a17";
const PARCH = "#e9ddc0";

function MFrame() {
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      <rect x="3" y="3" width="94" height="124" fill="none" stroke={INK} strokeWidth="0.8" />
      <rect x="5" y="5" width="90" height="120" fill="none" stroke={INK} strokeWidth="0.4" />
      {[[5,5,1,1],[95,5,-1,1],[5,125,1,-1],[95,125,-1,-1]].map(([x,y,sx,sy],k)=>(
        <path key={k} d={`M ${x} ${y} q ${8*sx} ${1*sy} ${9*sx} ${9*sy} q ${-1*sx} ${-8*sy} ${-9*sx} ${-9*sy} m ${9*sx} ${9*sy} q ${1*sx} ${5*sy} ${-2*sx} ${7*sy}`} fill="none" stroke={INK} strokeWidth="0.5" />
      ))}
    </svg>
  );
}

// 5 个墨线场景(兜帽刺客),直接画在羊皮纸上
function InkScene({ i }) {
  const common = { fill: "none", stroke: INK, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  const fillFig = { fill: INK, stroke: INK, strokeWidth: 1.2, strokeLinejoin: "round" };
  const A = (x, y, sc, extra) => (
    <g transform={`translate(${x} ${y}) scale(${sc})`}>
      {/* 兜帽头 */}
      <path d="M0,-42 C -14,-42 -18,-26 -14,-16 L 14,-16 C 18,-26 14,-42 0,-42 Z" {...fillFig} />
      <path d="M -9,-24 q 9,6 18,0" fill="none" stroke={PARCH} strokeWidth="2" />
      {/* 斗篷身体 */}
      <path d="M -16,-16 C -22,10 -20,30 -18,40 L 18,40 C 20,30 22,10 16,-16 Z" {...fillFig} />
      {extra}
    </g>
  );
  if (i === 1) return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      {/* 城堡墙 + 目标 */}
      <g {...common}>
        <path d="M170,300 V150 h120 v150" />
        {[170,190,210,230,250,270].map((x,k)=>(<rect key={k} x={x} y="140" width="12" height="14" fill={PARCH} stroke={INK} strokeWidth="2"/>))}
        <path d="M200,150 V95" /><circle cx="200" cy="80" r="14" />
        <path d="M186,150 C 188,120 212,120 214,150" />
      </g>
      {/* 刺客躲墙后偷窥,持刀 */}
      {A(110,180,1.5,<g><path d="M18,-8 L 46,-20" stroke={INK} strokeWidth="3" /><path d="M42,-24 L 52,-14 L 46,-8 Z" {...fillFig}/></g>)}
      <path d="M150,300 V150" fill="none" stroke={INK} strokeWidth="2" opacity="0.25"/>
    </svg>
  );
  if (i === 2) return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      {/* 靶 */}
      <g {...common}>
        {[46,34,22,10].map((r,k)=>(<circle key={k} cx="235" cy="150" r={r} />))}
        <circle cx="235" cy="150" r="3" fill={INK}/>
        <path d="M235,196 V250" />
      </g>
      {/* 刺客拉弓 */}
      {A(95,180,1.6,<g stroke={INK}><path d="M8,-14 q 40,0 0,44" fill="none" strokeWidth="3"/><path d="M8,8 L 150,8" strokeWidth="1.6"/><path d="M8,-14 L 8,30" strokeWidth="1.6"/></g>)}
    </svg>
  );
  if (i === 3) return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      {/* 兜帽神秘师父(高) */}
      <g transform="translate(215 150) scale(2)">
        <path d="M0,-52 C -18,-52 -22,-30 -16,-18 L 16,-18 C 22,-30 18,-52 0,-52 Z" {...fillFig}/>
        <path d="M -20,-18 C -30,20 -26,52 -24,64 L 24,64 C 26,52 30,20 20,-18 Z" {...fillFig}/>
        <path d="M 20,0 L 20,-70" stroke={INK} strokeWidth="3"/>
      </g>
      {/* 刺客下跪拜师 */}
      {A(95,205,1.15,<path d="M -18,40 q 20,10 40,-2" fill="none" stroke={INK} strokeWidth="2"/>)}
      <path d="M60,258 h190" stroke={INK} strokeWidth="2"/>
    </svg>
  );
  if (i === 4) return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      {/* 草地盘坐冥想 */}
      <g transform="translate(150 150) scale(1.7)">
        <path d="M0,-42 C -14,-42 -18,-26 -14,-16 L 14,-16 C 18,-26 14,-42 0,-42 Z" {...fillFig}/>
        <path d="M -18,-16 C -26,6 -26,20 -30,26 C -10,20 10,20 30,26 C 26,20 26,6 18,-16 Z" {...fillFig}/>
        <path d="M -30,26 q 30,10 60,0" fill={INK} stroke={INK}/>
      </g>
      <g stroke={INK} strokeWidth="2">{[60,90,120,180,210,240].map((x,k)=>(<path key={k} d={`M${x},250 q -3,-14 0,-22 M${x},250 q 3,-14 0,-22`} fill="none"/>))}<path d="M40,252 h220"/></g>
    </svg>
  );
  return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      {/* 刺客拔刀 面对惊恐目标 */}
      {A(95,175,1.5,<g><path d="M12,-18 L 30,-46" stroke={INK} strokeWidth="3"/><path d="M26,-50 L 36,-40 L 30,-34 Z" {...fillFig}/></g>)}
      {/* 目标惊恐,举手 */}
      <g transform="translate(215 185) scale(1.3)">
        <circle cx="0" cy="-30" r="14" fill={PARCH} stroke={INK} strokeWidth="2"/>
        <circle cx="-5" cy="-32" r="2" fill={INK}/><circle cx="5" cy="-32" r="2" fill={INK}/>
        <ellipse cx="0" cy="-23" rx="4" ry="5" fill={INK}/>
        <path d="M -14,-16 C -18,10 -16,34 -14,44 L 14,44 C 16,34 18,10 14,-16 Z" fill={PARCH} stroke={INK} strokeWidth="2"/>
        <path d="M -12,-12 L -30,-34 M 12,-12 L 30,-34" stroke={INK} strokeWidth="3" fill="none"/>
      </g>
      <path d="M60,262 h200" stroke={INK} strokeWidth="2"/>
    </svg>
  );
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
  useEffect(() => {
    const b = document.body.style.background, h = document.documentElement.style.background;
    document.body.style.background = "#04201f"; document.documentElement.style.background = "#04201f";
    return () => { document.body.style.background = b; document.documentElement.style.background = h; };
  }, []);

  const t = L[lang];
  const rtl = lang === "ar";
  const fe = t.feats.slice(0, 4);
  // 6 页:封面 + 4 内容页 + ready-to-kill(CTA)
  const pages = [
    { type: "cover" },
    { type: "leaf", scene: 1, title: fe[0][1], desc: fe[0][2] },
    { type: "leaf", scene: 2, title: fe[1][1], desc: fe[1][2] },
    { type: "leaf", scene: 3, title: fe[2][1], desc: fe[2][2] },
    { type: "leaf", scene: 4, title: fe[3][1], desc: fe[3][2] },
    { type: "leaf", scene: 5, title: "Kill Your Exams!", desc: t.ctaS },
  ];

  useEffect(() => {
    const isDesk = window.matchMedia("(min-width: 900px) and (pointer: fine)").matches;
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
      const flipEnd = 0.72;
      const fin = Math.max(0, Math.min(1, (p - flipEnd) / 0.24));
      let bt = p < somerEnd ? `translateZ(${(-2600 * (1 - p / somerEnd)).toFixed(0)}px) rotateX(${((p / somerEnd) * 720).toFixed(1)}deg)` : "translateZ(0px) rotateX(0deg)";
      if (fin > 0) bt += ` scale(${(1 + fin * 0.6).toFixed(3)})`;
      book.style.transform = bt;
      book.style.opacity = (1 - Math.min(1, fin * 1.9)).toFixed(2);
      const segLen = (flipEnd - somerEnd) / flips;
      const depth = 34;
      let current = 0;
      leaves.forEach((leaf, i) => {
        const baseZ = -(i / Math.max(1, leaves.length - 1)) * depth;
        const sh = leaf.querySelector(".fb-shade");
        if (i === leaves.length - 1) { leaf.style.transform = `translateZ(${baseZ.toFixed(1)}px) rotateY(0deg)`; leaf.style.zIndex = "0"; if (sh) sh.style.opacity = "0"; return; }
        const local = Math.max(0, Math.min(1, (p - (somerEnd + i * segLen)) / segLen));
        const e = local < 0.5 ? 4 * local * local * local : 1 - Math.pow(-2 * local + 2, 3) / 2; // easeInOutCubic
        const arc = Math.sin(Math.PI * local) * 110;   // 中段大幅拱起
        const curl = Math.sin(Math.PI * local) * 8;     // 边缘弯曲
        leaf.style.transform = `translateZ(${(baseZ + arc).toFixed(1)}px) rotateY(${(-178 * e).toFixed(1)}deg) rotateZ(${curl.toFixed(1)}deg)`;
        leaf.style.zIndex = String(e < 0.5 ? 100 - i : 10 + i);
        if (sh) sh.style.opacity = (Math.sin(Math.PI * local) * 0.55).toFixed(2);
        if (e >= 0.5) current = i + 1;
      });
      // 右侧文字随当前页切换
      const blocks = scene.querySelectorAll("[data-txt]");
      blocks.forEach((b) => { b.style.opacity = Number(b.dataset.txt) === current ? "1" : "0"; b.style.pointerEvents = Number(b.dataset.txt) === current ? "auto" : "none"; });
      // 结尾惊吓桥段
      const fy = document.getElementById("fin-yellow"); if (fy) fy.style.opacity = Math.min(1, fin * 1.7).toFixed(2);
      const fs = document.getElementById("fin-scare"); if (fs) { const rise = Math.max(0, 1 - Math.max(0, fin - 0.15) / 0.5); fs.style.transform = `translate(-50%, ${(rise * 100).toFixed(0)}%)`; fs.style.opacity = fin > 0.12 ? "1" : "0"; }
      const ft = document.getElementById("fin-text"); if (ft) { const o = Math.max(0, Math.min(1, (fin - 0.6) / 0.34)); ft.style.opacity = o.toFixed(2); ft.style.transform = `translateY(${((1 - o) * 24).toFixed(0)}px)`; ft.style.pointerEvents = o > 0.5 ? "auto" : "none"; }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    upd();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const tm = setTimeout(upd, 140);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); clearTimeout(tm); };
  }, [lang, desktop]);

  function LeafFront({ pg }) {
    return (
      <div className="fb-face" style={{ background: PARCH, color: INK }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 30% 20%, rgba(255,255,255,.25), transparent 60%), radial-gradient(100% 100% at 80% 100%, rgba(120,90,40,.15), transparent 60%)" }} />
        <MFrame />
        {pg.type === "cover" ? (
          <div className="relative flex h-full flex-col items-center justify-center p-8 text-center">
            <svg viewBox="0 0 120 120" className="h-24 w-24">
              <path d="M60,18 L66,52 L60,96 L54,52 Z" fill={INK} />
              <path d="M42,60 h36 M46,66 h28" stroke={INK} strokeWidth="3" /><path d="M60,96 l-5,8 h10 Z" fill={INK}/>
              <circle cx="60" cy="60" r="46" fill="none" stroke={INK} strokeWidth="1.5" />
            </svg>
            <h1 className="font-hero mt-4 text-4xl leading-none" style={{ color: INK }}>Kill Your<br />Exam</h1>
            <p className="mt-4 text-xs tracking-widest">— A · D · MMXXVI —</p>
          </div>
        ) : (
          <div className="relative flex h-full flex-col p-7">
            <h3 className="font-hero text-center text-2xl" style={{ color: INK }}>{pg.title}</h3>
            <div className="mx-auto mt-1 h-px w-24" style={{ background: INK, opacity: .5 }} />
            <div className="relative mt-2 flex-1">
              <InkScene i={pg.scene} />
              <img src={`/illustrations/${pg.scene}.png`} alt="" className="absolute inset-0 h-full w-full object-contain" style={{ mixBlendMode: "multiply" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </div>
            <div className="text-center text-[11px] tracking-widest" style={{ opacity: .6 }}>· {pages.findIndex((x) => x === pg)} / {pages.length - 1} ·</div>
          </div>
        )}
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
        <section ref={sceneRef} style={{ height: `${pages.length * 115}vh` }} className="relative">
          <div className="fb-stage">
            <div className="fb-persp">
              <div ref={bookRef} className="fb-book">
                <div className="fb-thick" style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", zIndex: 0 }}>
                  <div style={{ position: "absolute", inset: 0, transform: "translateZ(-36px)", borderRadius: "4px 12px 12px 4px", background: "linear-gradient(135deg,#5b3d1e,#3c2812)", boxShadow: "0 45px 80px -26px rgba(0,0,0,.7)" }} />
                  <div style={{ position: "absolute", top: 0, right: 0, width: "36px", height: "100%", transformOrigin: "right center", transform: "rotateY(-90deg)", background: "repeating-linear-gradient(to bottom,#efe6cf 0 2px,#cdbe98 2px 4px)" }} />
                  <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: "36px", transformOrigin: "bottom center", transform: "rotateX(90deg)", background: "repeating-linear-gradient(to right,#efe6cf 0 2px,#cdbe98 2px 4px)" }} />
                  <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "36px", transformOrigin: "top center", transform: "rotateX(-90deg)", background: "repeating-linear-gradient(to right,#efe6cf 0 2px,#cdbe98 2px 4px)" }} />
                </div>
                {pages.map((pg, i) => (
                  <div key={i} className="fb-leaf" style={{ zIndex: pages.length - i }}>
                    <LeafFront pg={pg} />
                    <div className="fb-shade" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0, background: "linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.08) 45%, transparent 70%)" }} />
                    <div className="fb-face fb-back" style={{ background: "linear-gradient(90deg,#5b3d1e,#6b4a25)" }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="fb-text relative hidden h-[560px] w-[360px] shrink-0 md:block">
              {pages.map((pg, i) => (
                <div key={i} data-txt={i} className="absolute inset-0 flex flex-col justify-center transition-opacity duration-500" style={{ opacity: i === 0 ? 1 : 0 }}>
                  {pg.type === "cover" ? (
                    <>
                      <p className="rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-200 ring-1 ring-white/15 w-fit">✨ {t.badge}</p>
                      <h2 className="font-hero mt-5 text-5xl">{t.h1a}<br /><span className="kye-gradtext">{t.h1b}</span></h2>
                      <p className="mt-5 text-slate-300">{t.sub}</p>
                      <p className="mt-8 animate-bounce text-emerald-300">↓ scroll</p>
                    </>
                  ) : pg.type === "cta" ? (
                    <>
                      <h2 className="font-hero text-4xl leading-tight">{t.ctaT}</h2>
                      <p className="mt-4 text-slate-300">{t.ctaS}</p>
                      <a href="/" className="mt-7 w-fit rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 px-8 py-3 text-lg font-bold text-emerald-950 shadow-lg transition hover:-translate-y-0.5">{t.ctaB} →</a>
                    </>
                  ) : (
                    <>
                      <h2 className="font-hero text-4xl text-emerald-200">{pg.title}</h2>
                      <div className="mt-3 h-px w-16 bg-emerald-400/50" />
                      <p className="mt-4 text-lg leading-relaxed text-slate-300">{pg.desc}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="mx-auto max-w-md space-y-6 px-5 pb-16 pt-24">
          {pages.map((pg, i) => (
            <div key={i} className="overflow-hidden rounded-3xl ring-1 ring-white/10">
              <div className="aspect-[3/4] w-full"><LeafFront pg={pg} /></div>
              <div className="bg-white/[0.04] p-5">
                {pg.type === "cta"
                  ? <><h3 className="font-hero text-2xl">{t.ctaT}</h3><a href="/" className="mt-3 inline-block rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 px-6 py-2.5 font-bold text-emerald-950">{t.ctaB} →</a></>
                  : pg.type === "cover"
                  ? <p className="text-slate-300">{t.sub}</p>
                  : <><h3 className="font-hero text-2xl text-emerald-200">{pg.title}</h3><p className="mt-2 text-slate-300">{pg.desc}</p></>}
              </div>
            </div>
          ))}
        </div>
      )}

      {desktop && (
        <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
          <div id="fin-yellow" className="absolute inset-0" style={{ opacity: 0, background: "radial-gradient(130% 130% at 50% 120%, #f2dc86 0%, #dcbb54 55%, #c9a844 100%)" }} />
          <img id="fin-scare" src="/illustrations/scare.png" alt="" className="absolute bottom-0 left-1/2 h-[86vh] max-w-none" style={{ transform: "translate(-50%,100%)", opacity: 0, mixBlendMode: "multiply" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div id="fin-text" className="absolute inset-x-0 top-[16vh] z-10 text-center" style={{ opacity: 0 }}>
            <h2 className="font-hero text-5xl leading-tight text-[#3a2a17] md:text-7xl">{t.ctaT}</h2>
            <a href="/" className="mt-7 inline-block rounded-2xl bg-[#3a2a17] px-10 py-4 text-lg font-bold text-[#f2dc86] shadow-2xl transition hover:-translate-y-0.5">{t.ctaB} →</a>
            <p className="mt-6 text-xs text-[#5a4327]">© 2026 Kill Your Exam · <a href="/privacy" className="underline">{t.priv}</a></p>
          </div>
        </div>
      )}
      {!desktop && <footer className="relative z-10 mx-auto max-w-6xl px-6 py-10 text-center text-sm text-slate-500">
        © 2026 Kill Your Exam · <a href="/privacy" className="underline hover:text-slate-300">{t.priv}</a> · <a href="/" className="underline hover:text-slate-300">{t.enter}</a>
      </footer>}
    </div>
  );
}
