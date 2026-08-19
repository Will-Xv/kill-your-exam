"use client";
import { useEffect, useRef, useState } from "react";
import { toTradTW, toTradHK } from "@/lib/s2t";

const LANGS = [["en","English"],["zh","中文"],["zh-TW","繁體中文（台灣）"],["zh-HK","繁體中文（港澳）"],["fr","Français"],["es","Español"],["ru","Русский"],["ar","العربية"],["id","Bahasa"]];

const L = {
  en: { enter:"Enter app", badge:"Your personal AI exam assassin", h1a:"Any exam,", h1b:"hunted down.",
    sub:"Drop in your syllabus, notes, past papers — even photos and recordings. The AI teaches from your own material, hunts your weak spots, and tells you the three things worth doing today.",
    start:"Get started", see:"See features", s1:"languages", s2:"from your materials", s3:"always available",
    whyT:"Why Kill Your Exam", why:[["It actually knows your material","Explanations and questions are built from the files you upload — not generic guesses."],["A plan that adapts to you","Mastery tracking, spaced repetition and root-cause diagnosis that reshape the plan as you go."],["One assistant, full control","The chat AI can read, plan and change anything — and asks before it touches a thing."]],
    featT:"What it does for you", featS:"The whole hunt — from casing the target to the final strike.",
    feats:[["🗡️","Murder Plan","Case the target first. Feed it your syllabus and files and it maps every topic, colours what is solid against what is shaky, and digs out the root causes quietly dragging your score down. Every exam planned together, with countdowns and one clear thing to do today."],["📖","Learn + Practice","Then draw the bow. Explanations and endless questions grow out of your own material and are graded on the spot — type, handwrite with a stylus, or snap a photo. Beyond drilling you can learn by debate, Socratic questioning or a boss fight against your own mistakes. Wrong answers come back at 1/3/7/15/30 days until they stick."],["💬","Ask Killer","Your mentor, on call. It reads your files, creates exams, plans your week, sets tasks, even rearranges the app — and asks before it changes anything. Think a mark was unfair? Argue it out; if you are right, it changes."],["🧭","All Your Killing Skills","It gets to know you. A long-term profile across every exam remembers your strengths, your repeat mistakes and how you really study, while root-cause diagnosis names the few topics truly holding you back. Every change can be rolled back."],["📚","Library · RAG","PDFs, Word, images, audio — any size. Teaching and questions stay grounded in your own data instead of vague generalities."],["🎒","Slaughter Prep · Mock","A full timed paper built to the real exam blueprint, marked by AI, followed by a cross-chapter root-cause report — plus rules, mindset and exam-day reminders."]],
    stepT:"Three steps to the kill", steps:[["Create an exam","Just tell Killer what you are up against (studying with no exam is fine). It looks the exam up and says honestly what it is sure of and what it needs from you."],["Feed it material","Slides, past papers, notes, photos, recordings — any size. From then on every explanation and question comes from your own material."],["Go for the kill","Three things a day: due mistakes, weak spots, one new topic. Before exam day sit a full timed mock — it is marked for you and tells you exactly what is still missing."]],
    ctaT:"Ready to kill your next exam?", ctaS:"One message to Killer and you are set up. Start today.", ctaB:"Enter now", priv:"Privacy" },
  zh: { enter:"进入应用", badge:"你的私人 AI 备考杀手", h1a:"任何考试,", h1b:"都是猎物。",
    sub:"把课件、笔记、真题,甚至录音和随手拍的照片丢进来。AI 只依据你自己的资料讲题、出题、批改,盯住你的薄弱点,每天只告诉你三件值得做的事。",
    start:"立即开始", see:"看看功能", s1:"种语言", s2:"基于你的资料", s3:"随时可用",
    whyT:"为什么选 Kill Your Exam", why:[["真的懂你的资料","讲解和出题都长自你上传的文件,而不是泛泛而谈、瞎猜。"],["会随你调整的计划","掌握度追踪、间隔重复、根因诊断,计划随你的状态不断重排。"],["一个助手,全程掌控","聊天 AI 什么都能读、能排、能改——动手之前一定先问你。"]],
    featT:"它能替你做的事", featS:"从摸清猎物到最后一刀,一整套。",
    feats:[["🗡️","追杀计划","先把猎物摸透。传上考纲和资料,它给这门课画出知识点地图,标清哪些已经稳、哪些还虚,并挖出真正拖垮成绩的根因。多门考试一起排期,倒计时和「今天该做什么」一目了然。"],["📖","学习 + 练习","然后对着弱点开弓。讲解和习题都从你的资料里长出来,无限出题、当场批改;可以打字、用触控笔手写,或拍照上传。除了刷题,还能靠辩论、苏格拉底式追问、错题 Boss 战来学。答错的按 1/3/7/15/30 天回来找你,直到真会为止。"],["💬","问问杀手","你的军师随叫随到。它能读你的资料、建考试、排计划、布置任务,连界面都能替你改——动手之前先问你一声。觉得判分冤枉?当场争论,你有理它就改。"],["🧭","你的全部杀技","它越用越懂你。一份跨所有考试的长期画像,记得你的强项、惯犯的错和真实的学习习惯;根因诊断挑出真正拖后腿的那几个点。任何改动都能回档。"],["📚","资料库 · RAG","PDF、Word、图片、音频,多大的文件都传得上;讲解和出题永远基于你自己的材料,而不是空泛的通用内容。"],["🎒","屠杀准备 · 模拟考","按真实考试结构组一套限时全真卷,AI 阅卷后自动做跨章节根因诊断;考前还有规则、心态和临场提醒。"]],
    stepT:"三步开杀", steps:[["建考试","跟杀手说一声你要考什么(只想学、没有考试也行)。它会把这门考试查清楚,并诚实告诉你哪些它有把握、哪些需要你补资料。"],["喂资料","课件、真题、笔记、录音、照片都丢进去,多大的文件都行。从此讲解和出题都基于你自己的材料。"],["开杀","每天照三件事做:复习到期错题、补薄弱点、学一个新知识。临考前做一套限时全真模拟,判完直接告诉你还差哪儿。"]],
    ctaT:"准备好干掉下一场考试了吗?", ctaS:"跟杀手说一句就能开始,今天就动手。", ctaB:"立即进入", priv:"隐私政策" },
  "zh-TW": { enter:"進入應用", badge:"你的私人 AI 備考殺手", h1a:"任何考試,", h1b:"都是獵物。",
    sub:"把課堂講義、筆記、考古題,甚至錄音和隨手拍的照片丟進來。AI 只依據你自己的資料講題、出題、批改,盯住你的弱點,每天只告訴你三件值得做的事。",
    start:"立即開始", see:"看看功能", s1:"種語言", s2:"依據你的資料", s3:"隨時可用",
    whyT:"為什麼選 Kill Your Exam", why:[["真的懂你的資料","講解和出題都長自你上傳的檔案,而不是空泛的通則或亂猜。"],["會隨你調整的計畫","熟練度追蹤、間隔複習、根因診斷,計畫隨你的狀態不斷重排。"],["一個助理,全程掌控","聊天 AI 什麼都能讀、能排、能改——動手之前一定先問過你。"]],
    featT:"它能替你做的事", featS:"從摸清獵物到最後一刀,一整套。",
    feats:[["🗡️","追殺計畫","先把獵物摸透。上傳課綱和資料,它替這門課畫出知識點地圖,標清楚哪些已經穩、哪些還虛,並挖出真正拖垮成績的根本原因。多門考試一起排程,倒數計時和「今天該做什麼」一目了然。"],["📖","學習 + 練習","接著對著弱點開弓。講解和練習題都從你的資料長出來,無限出題、當場批改;可以打字、用觸控筆手寫,或拍照上傳。除了刷題,還能靠辯論、蘇格拉底式追問、錯題王對戰來學。答錯的會在 1/3/7/15/30 天後回來找你,直到真的會為止。"],["💬","問問殺手","你的軍師隨叫隨到。它能讀你的檔案、建考試、排計畫、指派作業,連介面都能替你調整——動手之前先問你一聲。覺得分數判得冤枉?當場爭論,你有理它就改。"],["🧭","你的全部殺技","它越用越懂你。一份跨所有考試的長期側寫,記得你的強項、常犯的錯,還有你真正的讀書習慣;根因診斷挑出真正扯後腿的那幾個點。任何更動都能還原。"],["📚","資料庫 · RAG","PDF、Word、圖片、音訊,多大的檔案都傳得上;講解和出題永遠依據你自己的素材,而不是通用內容。"],["🎒","屠殺準備 · 模擬考","依照真實考試結構出一份限時全真考卷,AI 閱卷後自動做跨章節根因分析;考前還有規則、心態和臨場提醒。"]],
    stepT:"三步開殺", steps:[["建考試","跟殺手說一聲你要考什麼(只想學、沒有考試也行)。它會把這場考試查清楚,並老實告訴你哪些它有把握、哪些需要你補資料。"],["餵資料","講義、考古題、筆記、錄音、照片都丟進去,多大的檔案都行。從此講解和出題都依據你自己的素材。"],["開殺","每天照三件事做:複習到期的錯題、補弱點、學一個新知識。考前做一份限時全真模擬,批改完直接告訴你還差哪裡。"]],
    ctaT:"準備好幹掉下一場考試了嗎?", ctaS:"跟殺手說一句就能開始,今天就動手。", ctaB:"立即進入", priv:"隱私權政策" },
  "zh-HK": { enter:"進入應用", badge:"你的私人 AI 備考殺手", h1a:"任何考試,", h1b:"都係獵物。",
    sub:"將課堂筆記、溫習資料、歷屆試題,甚至錄音同隨手影嘅相都掉入嚟。AI 只根據你自己嘅資料講題、出題、批改,盯住你嘅弱項,每日淨係話你知三件值得做嘅事。",
    start:"立即開始", see:"睇睇功能", s1:"種語言", s2:"根據你嘅資料", s3:"隨時可用",
    whyT:"點解揀 Kill Your Exam", why:[["真係識你嘅資料","講解同出題都係由你上載嘅檔案而嚟,唔係空泛嘅通則或者亂噏。"],["會跟住你調整嘅計劃","熟練度追蹤、間隔複習、根源分析,計劃跟住你嘅狀態不斷重排。"],["一個助手,全程話事","傾偈嘅 AI 乜都讀得、排得、改得——郁手之前一定會問過你。"]],
    featT:"佢可以幫你做嘅嘢", featS:"由摸清獵物到最後一刀,一整套。",
    feats:[["🗡️","追殺計劃","先摸清獵物。上載課程大綱同資料,佢會幫呢一科畫出知識點地圖,標清楚邊啲已經穩陣、邊啲仲虛,再揪出真正拖低成績嘅根源。幾科考試一齊排期,倒數同「今日要做乜」一目了然。"],["📖","學習 + 練習","跟住就向住弱項開弓。講解同練習題都由你嘅資料生出嚟,無限出題、即刻批改;可以打字、用觸控筆手寫,或者影相上載。除咗操練,仲可以靠辯論、蘇格拉底式追問、錯題大佬戰嚟學。答錯嘅會喺 1/3/7/15/30 日之後返嚟搵你,直到真係識為止。"],["💬","問問殺手","你嘅軍師隨傳隨到。佢讀得你嘅檔案、開得考試、排得計劃、派得功課,連介面都幫到你改——郁手之前會問你一聲。覺得分數批得唔公道?即場拗,你有道理佢就改。"],["🧭","你嘅全部殺技","佢越用越識你。一份跨晒所有考試嘅長期側寫,記得你嘅強項、慣性錯法,同埋你真正嘅溫習習慣;根源分析會揀出真正扯你後腿嗰幾點。任何改動都可以還原。"],["📚","資料庫 · RAG","PDF、Word、圖片、音訊,幾大嘅檔案都上載到;講解同出題永遠根據你自己嘅素材,唔會係通用內容。"],["🎒","屠殺準備 · 模擬試","按真實考試結構出一份限時全真試卷,AI 批改之後自動做跨章節根源分析;考前仲有規則、心態同臨場提示。"]],
    stepT:"三步開殺", steps:[["開一科考試","同殺手講一聲你要考乜(淨係想學、冇考試都得)。佢會查清楚呢個考試,再老實話你知邊啲佢有把握、邊啲要你補資料。"],["餵資料","筆記、歷屆試題、講義、錄音、相片都掉入去,幾大都得。之後講解同出題都根據你自己嘅素材。"],["開殺","每日照三件事做:複習到期嘅錯題、補弱項、學一個新知識。考前做一份限時全真模擬,批改完即刻話你知仲差邊度。"]],
    ctaT:"準備好搞掂下一場考試未?", ctaS:"同殺手講一句就可以開始,今日就郁手。", ctaB:"立即進入", priv:"私隱政策" },
  fr: { enter:"Ouvrir l'app", badge:"Ton assassin d'examens, propulsé par l'IA", h1a:"N'importe quel examen,", h1b:"traqué.",
    sub:"Dépose ton programme, tes notes, tes annales — même des photos et des enregistrements. L'IA enseigne à partir de tes propres documents, traque tes points faibles et te dit les trois choses à faire aujourd'hui.",
    start:"Commencer", see:"Voir les fonctions", s1:"langues", s2:"selon tes documents", s3:"disponible 24/7",
    whyT:"Pourquoi Kill Your Exam", why:[["Il connaît vraiment tes documents","Explications et questions naissent de tes fichiers, pas de généralités."],["Un plan qui s'adapte à toi","Suivi de maîtrise, révisions espacées et diagnostic des causes profondes réorganisent le plan en continu."],["Un assistant, contrôle total","L'IA lit, planifie et modifie tout — et demande toujours avant d'agir."]],
    featT:"Ce qu'il fait pour toi", featS:"Toute la chasse, du repérage au coup final.",
    feats:[["🗡️","Plan de Meurtre","Repère la cible d'abord. Donne-lui ton programme et tes fichiers : il cartographie chaque notion, distingue l'acquis du fragile et débusque les causes profondes qui plombent tes notes. Tous tes examens planifiés ensemble, avec comptes à rebours et une priorité claire pour aujourd'hui."],["📖","Apprendre + S'entraîner","Puis bande l'arc. Explications et exercices illimités issus de tes propres documents, corrigés immédiatement — au clavier, au stylet ou par photo. Au-delà des exercices : débat, questionnement socratique ou combat de boss contre tes erreurs. Les erreurs reviennent à 1/3/7/15/30 jours jusqu'à ce que ça rentre."],["💬","Demande au Tueur","Ton mentor, toujours dispo. Il lit tes fichiers, crée des examens, planifie ta semaine, assigne des tâches et réorganise même l'appli — en demandant avant de toucher à quoi que ce soit. Une note injuste ? Discute : si tu as raison, il corrige."],["🧭","Tout Ton Art de Tuer","Il apprend à te connaître. Un profil durable sur tous tes examens retient tes forces, tes erreurs récurrentes et ta vraie façon de travailler ; le diagnostic des causes profondes nomme les quelques notions qui te freinent. Tout est réversible."],["📚","Bibliothèque · RAG","PDF, Word, images, audio — toute taille. Cours et questions restent fondés sur tes données, jamais sur du vague."],["🎒","Prépa Massacre · Blanc","Un examen blanc chronométré bâti sur la structure réelle, corrigé par l'IA, suivi d'un bilan des causes profondes — plus règles, mental et rappels du jour J."]],
    stepT:"Trois pas vers la mise à mort", steps:[["Créer un examen","Dis simplement au Tueur ce que tu prépares (étudier sans examen, c'est permis). Il se renseigne puis t'annonce honnêtement ce dont il est sûr et ce qu'il te faut fournir."],["Le nourrir de documents","Cours, annales, notes, photos, enregistrements — toute taille. Ensuite, chaque explication et chaque question viennent de tes propres documents."],["Passer à l'attaque","Trois choses par jour : erreurs à revoir, points faibles, une notion nouvelle. Avant le jour J, un blanc chronométré : corrigé pour toi, il dit exactement ce qui manque encore."]],
    ctaT:"Prêt à tuer ton prochain examen ?", ctaS:"Un message au Tueur et tout est prêt. Commence aujourd'hui.", ctaB:"Entrer", priv:"Confidentialité" },
  es: { enter:"Abrir app", badge:"Tu asesino de exámenes con IA", h1a:"Cualquier examen,", h1b:"cazado.",
    sub:"Suelta tu temario, apuntes y exámenes pasados — incluso fotos y grabaciones. La IA enseña desde tus propios materiales, caza tus puntos débiles y te dice las tres cosas que merece la pena hacer hoy.",
    start:"Empezar", see:"Ver funciones", s1:"idiomas", s2:"desde tus materiales", s3:"siempre disponible",
    whyT:"Por qué Kill Your Exam", why:[["Conoce de verdad tus materiales","Explicaciones y preguntas nacen de tus archivos, no de suposiciones."],["Un plan que se adapta a ti","Seguimiento de dominio, repaso espaciado y diagnóstico de causas raíz reordenan el plan sobre la marcha."],["Un asistente, control total","La IA lee, planifica y cambia lo que haga falta — y pregunta antes de tocar nada."]],
    featT:"Lo que hace por ti", featS:"Toda la cacería, del rastreo al golpe final.",
    feats:[["🗡️","Plan de Asesinato","Primero estudia a la presa. Dale tu temario y tus archivos: mapea cada tema, separa lo firme de lo frágil y desentierra las causas raíz que hunden tu nota. Todos tus exámenes planificados juntos, con cuentas atrás y una prioridad clara para hoy."],["📖","Aprender + Practicar","Luego tensa el arco. Explicaciones y preguntas infinitas salen de tus propios materiales y se corrigen al instante — escribe, usa lápiz óptico o sube una foto. Más allá de repetir ejercicios: debate, preguntas socráticas o un combate contra tus propios fallos. Los errores vuelven a los 1/3/7/15/30 días hasta que se queden."],["💬","Pregunta al Asesino","Tu mentor, siempre disponible. Lee tus archivos, crea exámenes, planifica tu semana, asigna tareas e incluso reorganiza la app — preguntando antes de cambiar nada. ¿Una nota injusta? Discútela: si tienes razón, la cambia."],["🧭","Todas Tus Habilidades Asesinas","Va conociéndote. Un perfil a largo plazo de todos tus exámenes recuerda tus fortalezas, tus fallos repetidos y cómo estudias de verdad; el diagnóstico de causas raíz señala los pocos temas que te frenan. Todo se puede deshacer."],["📚","Biblioteca · RAG","PDF, Word, imágenes, audio — de cualquier tamaño. Clases y preguntas siempre basadas en tus datos, no en vaguedades."],["🎒","Prep. de la Masacre · Simulacro","Un examen completo y cronometrado con la estructura real, corregido por IA y seguido de un informe de causas raíz — más reglas, mentalidad y recordatorios del día."]],
    stepT:"Tres pasos para matar", steps:[["Crea un examen","Solo dile al Asesino a qué te enfrentas (estudiar sin examen también vale). Lo investiga y te dice con honestidad de qué está seguro y qué necesita de ti."],["Dale materiales","Apuntes, exámenes, fotos, grabaciones — de cualquier tamaño. Desde entonces cada explicación y pregunta sale de tus propios materiales."],["A por la caza","Tres cosas al día: fallos pendientes, puntos débiles y un tema nuevo. Antes del examen, un simulacro cronometrado: se corrige solo y te dice justo qué falta."]],
    ctaT:"¿Listo para matar tu próximo examen?", ctaS:"Un mensaje al Asesino y ya está listo. Empieza hoy.", ctaB:"Entrar", priv:"Privacidad" },
  ru: { enter:"Открыть", badge:"Твой личный ИИ-убийца экзаменов", h1a:"Любой экзамен —", h1b:"добыча.",
    sub:"Загрузи программу, конспекты и прошлые работы — даже фото и аудиозаписи. ИИ учит по твоим собственным материалам, охотится на слабые места и называет три дела, которые стоит сделать сегодня.",
    start:"Начать", see:"Функции", s1:"языков", s2:"по твоим материалам", s3:"доступно 24/7",
    whyT:"Почему Kill Your Exam", why:[["Он правда знает твои материалы","Объяснения и вопросы вырастают из твоих файлов, а не из общих догадок."],["План, который подстраивается","Отслеживание уровня, интервальные повторения и поиск первопричин постоянно перестраивают план."],["Один помощник, полный контроль","ИИ читает, планирует и меняет всё — и всегда спрашивает перед действием."]],
    featT:"Что он делает за тебя", featS:"Вся охота — от разведки до последнего удара.",
    feats:[["🗡️","План убийства","Сначала разведка. Дай ему программу и файлы: он построит карту тем, отделит твёрдое от шаткого и выкопает первопричины, которые тихо тянут оценку вниз. Все экзамены спланированы вместе, с таймерами и одним понятным делом на сегодня."],["📖","Учись + Практикуйся","Затем натяни тетиву. Объяснения и бесконечные вопросы вырастают из твоих материалов и проверяются сразу — печатай, пиши стилусом или сфотографируй. Кроме решения задач: дебаты, сократовские вопросы или бой с боссом из твоих же ошибок. Ошибки возвращаются через 1/3/7/15/30 дней, пока не осядут."],["💬","Спроси убийцу","Наставник всегда на связи. Читает твои файлы, создаёт экзамены, планирует неделю, ставит задачи и даже переставляет интерфейс — спрашивая перед каждым изменением. Считаешь оценку несправедливой? Поспорь: если ты прав, он исправит."],["🧭","Все твои навыки убийцы","Он узнаёт тебя. Долгосрочный профиль по всем экзаменам помнит сильные стороны, повторяющиеся ошибки и то, как ты учишься на самом деле; поиск первопричин называет те немногие темы, что тянут назад. Любое изменение можно откатить."],["📚","Библиотека · RAG","PDF, Word, картинки, аудио — любого размера. Обучение и вопросы всегда опираются на твои данные, а не на общие слова."],["🎒","Подготовка к бойне · Пробник","Полный пробник на время по реальной структуре, проверка ИИ и отчёт о первопричинах по всем разделам — плюс правила, настрой и напоминания к дню экзамена."]],
    stepT:"Три шага к убийству", steps:[["Создай экзамен","Просто скажи убийце, что тебе предстоит (можно и просто учиться). Он изучит вопрос и честно скажет, в чём уверен, а что нужно от тебя."],["Загрузи материалы","Лекции, прошлые работы, конспекты, фото, записи — любого размера. Дальше каждое объяснение и вопрос идут из твоих материалов."],["В атаку","Три дела в день: просроченные ошибки, слабые места, одна новая тема. Перед экзаменом — пробник на время: его проверят и точно скажут, чего не хватает."]],
    ctaT:"Готов убить следующий экзамен?", ctaS:"Одно сообщение убийце — и всё готово. Начни сегодня.", ctaB:"Войти", priv:"Конфиденциальность" },
  ar: { enter:"ادخل التطبيق", badge:"قاتل امتحاناتك الشخصي بالذكاء الاصطناعي", h1a:"أي امتحان،", h1b:"فريسة.",
    sub:"ألقِ بمنهجك وملاحظاتك ونماذجك السابقة — بل وحتى الصور والتسجيلات. يشرح الذكاء الاصطناعي من موادّك أنت، ويقتنص نقاط ضعفك، ويخبرك بالأشياء الثلاثة التي تستحق الإنجاز اليوم.",
    start:"ابدأ الآن", see:"المزايا", s1:"لغات", s2:"من موادّك", s3:"متاح دائمًا",
    whyT:"لماذا Kill Your Exam", why:[["يعرف موادّك فعلاً","الشروح والأسئلة تنبع من ملفاتك، لا من تخمينات عامة."],["خطة تتكيّف معك","تتبّع الإتقان والمراجعة المتباعدة وتشخيص الأسباب الجذرية تعيد ترتيب الخطة باستمرار."],["مساعد واحد، تحكّم كامل","يقرأ ويخطّط ويغيّر كل شيء — ويستأذنك قبل أي تعديل."]],
    featT:"ما الذي يفعله لك", featS:"المطاردة كاملة، من الاستطلاع إلى الضربة الأخيرة.",
    feats:[["🗡️","خطة القتل","استطلع الهدف أولًا. أعطه منهجك وملفاتك فيرسم خريطة لكل موضوع، ويفصل الراسخ عن الهشّ، ويستخرج الأسباب الجذرية التي تسحب درجاتك بهدوء. كل امتحاناتك مُخطّطة معًا، مع عدّادات تنازلية وأولوية واحدة واضحة لليوم."],["📖","تعلّم + تدرّب","ثم شُدّ القوس. الشروح والأسئلة اللانهائية تنبت من موادّك وتُصحَّح فورًا — اكتب، أو خُطّ بالقلم، أو صوّر إجابتك. وإلى جانب حل الأسئلة: مناظرة، وأسئلة سقراطية، ومعركة ضد أخطائك نفسها. الأخطاء تعود بعد 1/3/7/15/30 يومًا حتى ترسخ."],["💬","اسأل القاتل","مرشدك جاهز دائمًا. يقرأ ملفاتك، وينشئ الامتحانات، ويخطّط أسبوعك، ويوزّع المهام، بل ويعيد ترتيب التطبيق — ويستأذن قبل أي تغيير. تظن الدرجة ظالمة؟ ناقشه، وإن كنت محقًا غيّرها."],["🧭","كل مهارات القتل لديك","يتعرّف عليك مع الوقت. ملف طويل الأمد عبر كل امتحاناتك يتذكّر نقاط قوّتك وأخطاءك المتكررة وطريقتك الحقيقية في المذاكرة، وتشخيص الأسباب الجذرية يسمّي المواضيع القليلة التي تعوقك فعلًا. وكل تغيير قابل للتراجع."],["📚","المكتبة · RAG","PDF وWord وصور وصوتيات بأي حجم؛ الشرح والأسئلة تبقى مبنية على بياناتك لا على كلام عام."],["🎒","تحضير المذبحة · تجريبي","نموذج كامل مؤقّت مبني على البنية الحقيقية، يصحّحه الذكاء الاصطناعي ثم يتبعه تقرير بالأسباب الجذرية عبر الفصول — مع القواعد والحالة الذهنية وتذكيرات يوم الامتحان."]],
    stepT:"ثلاث خطوات للقتل", steps:[["أنشئ امتحانًا","قل للقاتل ما الذي تواجهه (والتعلّم بلا امتحان مقبول). سيبحث عنه ثم يخبرك بصدق بما هو واثق منه وما يحتاجه منك."],["زوّده بالمواد","محاضرات ونماذج وملاحظات وصور وتسجيلات بأي حجم. بعدها يأتي كل شرح وكل سؤال من موادّك أنت."],["انطلق للقتل","ثلاثة أشياء يوميًا: أخطاء مستحقة المراجعة، ونقاط ضعف، وموضوع جديد واحد. وقبل يوم الامتحان اجلس لنموذج كامل مؤقّت يُصحَّح لك ويحدّد ما ينقصك بالضبط."]],
    ctaT:"مستعد لقتل امتحانك القادم؟", ctaS:"رسالة واحدة للقاتل ويصبح كل شيء جاهزًا. ابدأ اليوم.", ctaB:"ادخل", priv:"الخصوصية" },
  id: { enter:"Masuk aplikasi", badge:"Pembunuh ujian pribadimu bertenaga AI", h1a:"Ujian apa pun,", h1b:"jadi buruan.",
    sub:"Lempar saja silabus, catatan, dan soal-soal lama — bahkan foto dan rekaman. AI mengajar dari materimu sendiri, memburu titik lemahmu, dan menyebut tiga hal yang layak dikerjakan hari ini.",
    start:"Mulai", see:"Lihat fitur", s1:"bahasa", s2:"dari materimu", s3:"selalu tersedia",
    whyT:"Kenapa Kill Your Exam", why:[["Benar-benar tahu materimu","Penjelasan dan soal tumbuh dari berkasmu, bukan tebakan umum."],["Rencana yang menyesuaikan","Pelacakan penguasaan, ulangan berjarak, dan diagnosis akar masalah terus menata ulang rencana."],["Satu asisten, kendali penuh","AI membaca, merencanakan, dan mengubah apa saja — dan selalu bertanya sebelum bertindak."]],
    featT:"Yang dikerjakan untukmu", featS:"Satu perburuan penuh, dari mengintai sampai tebasan terakhir.",
    feats:[["🗡️","Rencana Pembunuhan","Intai sasaran dulu. Beri silabus dan berkasmu: ia memetakan tiap topik, memisahkan yang kokoh dari yang rapuh, dan menggali akar masalah yang diam-diam menyeret nilaimu. Semua ujian direncanakan sekaligus, lengkap dengan hitung mundur dan satu hal jelas untuk hari ini."],["📖","Belajar + Latihan","Lalu tarik busurnya. Penjelasan dan soal tanpa batas tumbuh dari materimu dan dinilai seketika — ketik, tulis tangan dengan stilus, atau unggah foto. Selain mengerjakan soal: debat, tanya-jawab Sokratik, atau bos-fight melawan kesalahanmu sendiri. Salah akan kembali di hari 1/3/7/15/30 sampai benar-benar melekat."],["💬","Tanya Sang Pembunuh","Mentormu selalu siap. Ia membaca berkasmu, membuat ujian, menyusun rencana mingguan, memberi tugas, bahkan menata ulang aplikasi — dan bertanya sebelum mengubah apa pun. Merasa nilaimu tak adil? Debat saja; kalau kamu benar, ia mengubahnya."],["🧭","Semua Keahlian Membunuhmu","Ia makin mengenalmu. Profil jangka panjang lintas ujian mengingat kekuatanmu, kesalahan yang berulang, dan cara belajarmu yang sebenarnya; diagnosis akar masalah menyebut sedikit topik yang benar-benar menahanmu. Semua perubahan bisa dibatalkan."],["📚","Perpustakaan · RAG","PDF, Word, gambar, audio — ukuran berapa pun. Pengajaran dan soal tetap berpijak pada datamu, bukan pada kalimat umum."],["🎒","Persiapan Pembantaian · Simulasi","Satu paket berwaktu sesuai struktur ujian asli, dinilai AI, lalu laporan akar masalah lintas bab — plus aturan, mental, dan pengingat hari-H."]],
    stepT:"Tiga langkah membunuh", steps:[["Buat ujian","Cukup beri tahu Sang Pembunuh apa yang kamu hadapi (belajar tanpa ujian juga boleh). Ia menelusurinya lalu jujur menyebut apa yang ia yakini dan apa yang ia butuhkan darimu."],["Beri materi","Slide, soal lama, catatan, foto, rekaman — ukuran berapa pun. Setelah itu setiap penjelasan dan soal berasal dari materimu sendiri."],["Serang","Tiga hal tiap hari: kesalahan yang jatuh tempo, titik lemah, dan satu topik baru. Menjelang hari-H, kerjakan simulasi berwaktu penuh — dinilai untukmu dan menunjuk persis apa yang masih kurang."]],
    ctaT:"Siap membunuh ujianmu berikutnya?", ctaS:"Satu pesan ke Sang Pembunuh dan semua siap. Mulai hari ini.", ctaB:"Masuk", priv:"Privasi" },
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
function tradifyObj(o, conv) {
  if (typeof o === "string") return conv(o);
  if (Array.isArray(o)) return o.map((x) => tradifyObj(x, conv));
  if (o && typeof o === "object") { const r = {}; for (const k in o) r[k] = tradifyObj(o[k], conv); return r; }
  return o;
}

export default function Welcome() {
  const [lang, setLang] = useState("en");
  const [scrolled, setScrolled] = useState(false);
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    if (desktop) return; // 手机版:滚动进入淡入
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver((ents) => { ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [desktop, lang]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply);
    window.addEventListener("orientationchange", apply);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", apply) : mq.removeListener(apply); window.removeEventListener("orientationchange", apply); };
  }, []);
  const sceneRef = useRef(null);
  const bookRef = useRef(null);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" && localStorage.getItem("kye_welcome_lang");
    if (saved && L[saved]) setLang(saved);
  }, []);
  function pick(l) { setLang(l); try { localStorage.setItem("kye_welcome_lang", l); } catch {} }
  useEffect(() => {
    const onS = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onS, { passive: true });
    onS();
    return () => window.removeEventListener("scroll", onS);
  }, []);
  useEffect(() => {
    const b = document.body.style.background, h = document.documentElement.style.background;
    document.body.style.background = "#052620"; document.documentElement.style.background = "#052620";
    return () => { document.body.style.background = b; document.documentElement.style.background = h; };
  }, []);

  // 繁体【手写】台/港两套(用词与语感各不相同:軟體/軟件、計畫/計劃、書面語/港式口語…)。
  // 绝不再用 s2t 逐字机械转换来充数——那只换字形、换不了地区用词,还会把「复习」转成「復習」。
  // s2t 仅在极端情况(词典意外缺失)兜底,正常走不到。
  const t = L[lang] || (lang === "zh-TW" ? tradifyObj(L.zh, toTradTW) : lang === "zh-HK" ? tradifyObj(L.zh, toTradHK) : L.en);
  const rtl = lang === "ar";
  const fe = t.feats.slice(0, 4);
  // 6 页:封面 + 4 内容页 + ready-to-kill
  const pages = [
    { type: "cover" },
    { type: "leaf", scene: 1, title: fe[0][1], desc: fe[0][2] },
    { type: "leaf", scene: 2, title: fe[1][1], desc: fe[1][2] },
    { type: "leaf", scene: 3, title: fe[2][1], desc: fe[2][2] },
    { type: "leaf", scene: 4, title: fe[3][1], desc: fe[3][2] },
    { type: "leaf", scene: 5, title: "Kill Your Exam!", desc: t.ctaS },
  ];

  useEffect(() => {
    const isDesk = window.matchMedia("(min-width: 900px)").matches; // 宽屏(含平板横屏)都用桌面版翻书界面
    setDesktop(isDesk);
    if (!isDesk) return;
    const scene = sceneRef.current, book = bookRef.current;
    if (!scene || !book) return;
    const clamp = (x) => Math.max(0, Math.min(1, x));
    const leaves = [...book.querySelectorAll(".fb-leaf")];
    const flips = leaves.length - 1;
    const somerEnd = 0.2;
    const flipEnd = 0.68;
    let raf = 0;
    const upd = () => {
      raf = 0;
      const total = Math.max(1, scene.offsetHeight - window.innerHeight);
      const p = clamp(-scene.getBoundingClientRect().top / total);
      setScrolled(window.scrollY > 24);
      const fin = clamp((p - flipEnd) / 0.22);
      // 书:空翻飞入 → 结尾放大淡出
      let bt = p < somerEnd
        ? `translateZ(${(-2600 * (1 - p / somerEnd)).toFixed(0)}px) rotateX(${((p / somerEnd) * 720).toFixed(1)}deg)`
        : "translateZ(0px) rotateX(0deg)";
      if (fin > 0) bt += ` scale(${(1 + fin * 0.5).toFixed(3)})`;
      book.style.transform = bt;
      book.style.opacity = (1 - clamp(fin * 2.4)).toFixed(2);
      // 结尾书已不可见:整本从渲染中移除,极大降低合成开销(低端设备更流畅)
      book.style.visibility = fin >= 0.42 ? "hidden" : "visible";
      const segLen = (flipEnd - somerEnd) / flips;
      const depth = 34;
      let current = 0;
      leaves.forEach((leaf, i) => {
        const baseZ = -(i / Math.max(1, leaves.length - 1)) * depth;
        const sh = leaf.querySelector(".fb-shade");
        if (i === leaves.length - 1) { leaf.style.transform = `translateZ(${baseZ.toFixed(1)}px) rotateY(0deg)`; leaf.style.zIndex = "0"; if (sh) sh.style.opacity = "0"; return; }
        const local = clamp((p - (somerEnd + i * segLen)) / segLen);
        const e = local < 0.5 ? 4 * local * local * local : 1 - Math.pow(-2 * local + 2, 3) / 2;
        const arc = Math.sin(Math.PI * local) * 160;
        const curl = Math.sin(Math.PI * local) * 16;
        leaf.style.transform = `translateZ(${(baseZ + arc).toFixed(1)}px) rotateY(${(-178 * e).toFixed(1)}deg) rotateZ(${curl.toFixed(1)}deg)`;
        leaf.style.zIndex = String(e < 0.5 ? 100 - i : 10 + i);
        if (sh) sh.style.opacity = (Math.sin(Math.PI * local) * 0.55).toFixed(2);
        if (e >= 0.5) current = i + 1;
      });
      // 右侧文字随当前页切换;进入结尾时整列淡出(避免挡住满屏羊皮纸)
      const col = document.getElementById("fb-textcol");
      if (col) { col.style.opacity = (1 - clamp(fin / 0.06)).toFixed(2); col.style.pointerEvents = fin > 0.02 ? "none" : "auto"; }
      const blocks = scene.querySelectorAll("[data-txt]");
      blocks.forEach((b) => { const on = Number(b.dataset.txt) === current; b.style.opacity = on ? "1" : "0"; });
      // ===== 结尾惊吓桥段 =====
      const fy = document.getElementById("fin-yellow"); if (fy) fy.style.opacity = clamp(fin / 0.10).toFixed(2);
      const fs = document.getElementById("fin-scare"); if (fs) {
        const rise = clamp((fin - 0.06) / 0.26);   // 从下方升起,把正脸抬到画面中央
        const zoom = clamp((fin - 0.46) / 0.16);   // 停留后放大,~0.62 到达最大并保持
        const ty = (60 - rise * 70).toFixed(0);   // 60% -> -10%:升到全身构图后锁定,不再上移
        const sc = (0.95 + rise * 0.20 + zoom * 1.10).toFixed(3); // 停留~1.15,原地放大冲到~2.25
        const fade = clamp((fin - 0.74) / 0.06);   // 最大停留后快速虚化,~0.80 前彻底消失
        fs.style.transform = `translate(-50%, ${ty}%) scale(${sc})`;
        fs.style.opacity = fin < 0.06 ? "0" : (1 - fade).toFixed(2);
      }
      const ft = document.getElementById("fin-text"); if (ft) {   // 图消失后浮现大字+按钮
        const o = clamp((fin - 0.82) / 0.10);   // 突脸消失后浮现,并在结尾长时间停留可见
        ft.style.opacity = o.toFixed(2);
        ft.style.transform = `translateY(${((1 - o) * 30).toFixed(0)}px)`;
        ft.style.pointerEvents = o > 0.5 ? "auto" : "none";
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    upd();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const tm = setTimeout(upd, 140);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); clearTimeout(tm); };
  }, [lang, desktop]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

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
              <img src={`/illustrations/${pg.scene}.png`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" style={{ mixBlendMode: "multiply" }} />
            </div>
            <div className="text-center text-[11px] tracking-widest" style={{ opacity: .6 }}>· {pages.findIndex((x) => x === pg)} / {pages.length - 1} ·</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="relative text-[#f4ecd8]">
      <div className="fixed inset-0" style={{ zIndex: -20, background: "radial-gradient(1200px 700px at 15% -10%, #0d5348 0%, transparent 55%), radial-gradient(1000px 600px at 100% 0%, #0a6b5c 0%, transparent 48%), linear-gradient(180deg,#052620,#04211c)" }} />
      <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -10 }}>
        <div className="kye-blob h-96 w-96" style={{ background: "rgba(202,162,90,.30)", top: "-6rem", left: "-4rem", animation: "kyeFloat 12s ease-in-out infinite" }} />
        <div className="kye-blob h-[28rem] w-[28rem]" style={{ background: "rgba(16,120,100,.35)", top: "20%", right: "-8rem", animation: "kyeDrift 16s ease-in-out infinite" }} />
        <div className="kye-blob h-80 w-80" style={{ background: "rgba(232,201,135,.22)", bottom: "-6rem", left: "30%", animation: "kyeFloat2 14s ease-in-out infinite" }} />
      </div>

      <header className={"fixed inset-x-0 top-0 z-50 transition-all duration-300 " + (scrolled ? "-translate-y-full opacity-0 pointer-events-none" : "")}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-xl font-black">📘 Kill Your <span className="text-[#e8c987]">Exam</span></div>
          <div className="flex items-center gap-3">
            <select value={lang} onChange={(e) => pick(e.target.value)} className="rounded-full bg-[#e8c987]/10 px-3 py-1.5 text-sm text-[#f4ecd8] ring-1 ring-[#e8c987]/25 outline-none">
              {LANGS.map(([c, n]) => <option key={c} value={c} className="text-black">{n}</option>)}
            </select>
          </div>
        </div>
      </header>

      {desktop ? (
        <section ref={sceneRef} style={{ height: `${pages.length * 132}vh` }} className="relative">
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
            <div id="fb-textcol" className="fb-text relative hidden h-[560px] w-[360px] shrink-0 md:block">
              {pages.map((pg, i) => (
                <div key={i} data-txt={i} className="absolute inset-0 flex flex-col justify-center transition-opacity duration-500" style={{ opacity: i === 0 ? 1 : 0 }}>
                  {pg.type === "cover" ? (
                    <>
                      <p className="rounded-full bg-[#e8c987]/12 px-3 py-1 text-xs text-[#e8c987] ring-1 ring-[#e8c987]/25 w-fit">✨ {t.badge}</p>
                      <h2 className="font-hero mt-5 text-5xl">{t.h1a}<br /><span className="kye-goldtext">{t.h1b}</span></h2>
                      <p className="mt-5 text-[#cdbfa0]">{t.sub}</p>
                      <p className="mt-10 animate-bounce text-3xl font-black text-[#e8c987]">↓ {t.see || "scroll"}</p>
                    </>
                  ) : (
                    <>
                      <h2 className="font-hero text-4xl text-[#e8c987]">{pg.title}</h2>
                      <div className="mt-3 h-px w-16 bg-[#e8c987]/50" />
                      <p className="mt-4 text-lg leading-relaxed text-[#cdbfa0]">{pg.desc}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="mx-auto max-w-md px-5 pb-24 pt-24">
          {/* Hero */}
          <section className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-[#e8c987]/10 ring-1 ring-[#e8c987]/25">
              <svg viewBox="0 0 120 120" className="h-11 w-11">
                <path d="M60,16 L67,54 L60,100 L53,54 Z" fill="#e8c987" />
                <path d="M40,60 h40 M45,67 h30" stroke="#e8c987" strokeWidth="3" />
                <path d="M60,100 l-6,9 h12 Z" fill="#e8c987" />
              </svg>
            </div>
            <p className="mx-auto mt-5 w-fit rounded-full bg-[#e8c987]/12 px-3 py-1 text-xs text-[#e8c987] ring-1 ring-[#e8c987]/25">✨ {t.badge}</p>
            <h1 className="font-hero mt-4 text-[2.6rem] leading-[1.05]">{t.h1a} <span className="kye-goldtext">{t.h1b}</span></h1>
            <p className="mt-4 text-[15px] leading-relaxed text-[#cdbfa0]">{t.sub}</p>
            <a href="/" className="mt-7 inline-block rounded-2xl bg-[#e8c987] px-9 py-3.5 text-lg font-black text-[#2e2013] shadow-xl shadow-[#e8c987]/20">{t.start} →</a>
            <div className="mt-9 grid grid-cols-3 gap-2">
              {[["9", t.s1], ["RAG", t.s2], ["24/7", t.s3]].map(([n, lb], i) => (
                <div key={i} className="rounded-2xl bg-[#e8c987]/[0.05] py-3 ring-1 ring-[#e8c987]/10">
                  <div className="font-hero text-xl text-[#e8c987]">{n}</div>
                  <div className="mt-0.5 px-1 text-[11px] leading-tight text-[#9db0a4]">{lb}</div>
                </div>
              ))}
            </div>
            <p className="mt-9 animate-bounce text-xl font-black text-[#e8c987]">↓ {t.see}</p>
          </section>

          {/* Features */}
          <h2 data-reveal className="rv font-hero mt-14 text-center text-3xl text-[#e8c987]">{t.featT}</h2>
          <p data-reveal className="rv mx-auto mt-1 max-w-xs text-center text-sm text-[#9db0a4]">{t.featS}</p>
          <div className="mt-6 space-y-6">
            {pages.slice(1, 5).map((pg, i) => (
              <div key={i} data-reveal className="rv overflow-hidden rounded-[1.6rem] bg-[#e8c987]/[0.06] shadow-lg ring-1 ring-[#e8c987]/12" style={{ transitionDelay: `${(i % 2) * 90}ms` }}>
                <div className="flex items-center justify-center px-4 pt-4" style={{ background: "radial-gradient(120% 100% at 50% 0%, #efe7d2 0%, #e2d5b4 100%)" }}>
                  <img src={`/illustrations/${pg.scene}.png`} alt="" loading="lazy" className="max-h-48 w-auto object-contain kye-bob" style={{ mixBlendMode: "multiply", animationDelay: `${i * 0.7}s` }} />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2"><span className="text-2xl">{t.feats[i][0]}</span><h3 className="font-hero text-xl text-[#e8c987]">{pg.title}</h3></div>
                  <p className="mt-2.5 leading-relaxed text-[#cdbfa0]">{pg.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Steps */}
          <h2 data-reveal className="rv font-hero mt-14 text-center text-3xl text-[#e8c987]">{t.stepT}</h2>
          <div className="mt-6 space-y-3">
            {t.steps.map((st, i) => (
              <div key={i} data-reveal className="rv flex gap-3.5 rounded-2xl bg-[#e8c987]/[0.05] p-4 ring-1 ring-[#e8c987]/10" style={{ transitionDelay: `${i * 80}ms` }}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8c987] font-black text-[#2e2013]">{i + 1}</div>
                <div>
                  <h4 className="font-bold text-[#f4ecd8]">{st[0]}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-[#cdbfa0]">{st[1]}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Kill Your Exam! —— 对应电脑版最后一张内页 */}
          <div data-reveal className="rv mt-16 overflow-hidden rounded-[1.6rem] ring-1 ring-[#e8c987]/15 shadow-xl" style={{ background: "radial-gradient(120% 100% at 50% 0%, #efe7d2 0%, #e2d5b4 100%)" }}>
            <img src="/illustrations/5.png" alt="" loading="lazy" className="mx-auto block max-h-56 w-auto object-contain kye-bob" style={{ mixBlendMode: "multiply" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <div className="px-6 pb-7 pt-1 text-center">
              <h2 className="font-hero text-4xl text-[#2e2013]">Kill Your Exam!</h2>
            </div>
          </div>

          {/* Final scare + CTA */}
          <div data-reveal className="rv relative mt-16 overflow-hidden rounded-[1.6rem] ring-1 ring-[#2e2013]/30 shadow-2xl" style={{ background: "radial-gradient(130% 120% at 50% 15%, #efe7d2 0%, #e6dabb 60%, #dccdab 100%)" }}>
            <img src="/illustrations/scary.png" alt="" loading="lazy" className="mx-auto block max-h-[46vh] w-auto" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <div className="px-6 pb-8 pt-2 text-center">
              <h2 className="font-hero text-2xl leading-tight text-[#2e2013]">{t.ctaT}</h2>
              <p className="mx-auto mt-2 max-w-xs text-sm text-[#5a4327]">{t.ctaS}</p>
              <a href="/" className="mt-5 inline-block rounded-2xl bg-[#2e2013] px-10 py-3.5 text-lg font-black text-[#efe7d2] shadow-xl">{t.ctaB} →</a>
            </div>
          </div>
          <footer className="mt-10 text-center text-sm text-[#8a9b8e]">
            © 2026 Kill Your Exam · <a href="/privacy" className="underline">{t.priv}</a>
          </footer>
        </div>
      )}

      {desktop && (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          <div id="fin-yellow" className="absolute inset-0" style={{ opacity: 0, background: "radial-gradient(130% 130% at 50% 30%, #efe7d2 0%, #e6dabb 55%, #dccdab 100%)" }} />
          <img id="fin-scare" src="/illustrations/scary.png" alt="" className="absolute bottom-0 left-1/2 h-[100vh] w-auto max-w-none" style={{ transform: "translate(-50%,60%) scale(0.95)", opacity: 0, transformOrigin: "50% 44%" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div id="fin-text" className="absolute inset-x-0 top-[14vh] z-10 flex flex-col items-center px-6 text-center" style={{ opacity: 0 }}>
            <div className="rounded-[2rem] bg-[#efe7d2]/92 px-10 py-8 shadow-2xl ring-1 ring-[#2e2013]/20">
              <h2 className="font-hero text-5xl leading-[1.05] text-[#2e2013] md:text-7xl">{t.ctaT}</h2>
              <a href="/" className="mt-8 inline-block rounded-2xl bg-[#2e2013] px-12 py-4 text-xl font-black text-[#efe7d2] shadow-xl transition hover:-translate-y-0.5">{t.ctaB} →</a>
            </div>
            <p className="mt-4 text-xs text-[#5a4327]">© 2026 Kill Your Exam · <a href="/privacy" className="underline">{t.priv}</a></p>
          </div>
        </div>
      )}
    </div>
  );
}
