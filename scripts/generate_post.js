import fs from "node:fs";

import path from "node:path";

import crypto from "node:crypto";



// KONFIGURACJA

const OUT_DIR = "posts";

const IMAGES_DIR = path.join(OUT_DIR, "images");

const INDEX_FILE = "posts_index.json";

const TOPICS_FILE = "topics.json";



// --- NARZĘDZIA POMOCNICZE ---



function slugify(s) {

  return String(s)

    .toLowerCase()

    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l")

    .replace(/ń/g, "n").replace(/ó/g, "o").replace(/ś/g, "s").replace(/ż/g, "z").replace(/ź/g, "z")

    .replace(/[^a-z0-9]+/g, "-")

    .replace(/^-+|-+$/g, "")

    .slice(0, 80);

}



function esc(s) {

  return String(s ?? "").replace(/[&<>"']/g, (m) => ({

    "&": "&amp;",

    "<": "&lt;",

    ">": "&gt;",

    '"': "&quot;",

    "'": "&#39;",

  }[m]));

}



function todayPL() {

  const d = new Date();

  const months = [

    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",

    "lipca", "sierpnia", "września", "października", "listopada", "grudnia"

  ];

  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;

}



function readIndex() {

  if (!fs.existsSync(INDEX_FILE)) return [];

  try {

    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));

  } catch {

    return [];

  }

}



function writeIndex(list) {

  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), "utf8");

}



// --- ZARZĄDZANIE TEMATAMI ---



function readTopics() {

  if (!fs.existsSync(TOPICS_FILE)) {

    const defaultTopics = {

unused: [
        "AI w archeologii - jak algorytmy odkrywają zaginione miasta pod dżunglą",
        "Przyszłość mody: ubrania projektowane przez AI i wirtualne przymierzalnie",
        "AI w sądownictwie - czy algorytm może być bardziej sprawiedliwy niż sędzia?",
        "Internet of Bodies - gdy AI monitoruje nasze funkcje życiowe od środka",
        "Koniec z korkami? Autonomiczne systemy zarządzania ruchem w miastach",
        "AI i psychologia - czy chatbot może zastąpić terapeutę w kryzysie?",
        "Sztuczna inteligencja w sporcie - jak dane wygrywają mecze i biją rekordy",
        "AI w przemyśle filmowym - od odmładzania aktorów po generowanie scenariuszy",
        "Robotyka miękka - maszyny inspirowane naturą wspomagane przez AI",
        "Ewolucja wyszukiwarek - dlaczego Google zmienia się w Answer Engine",
        "AI w zarządzaniu kryzysowym - przewidywanie powodzi i pożarów z wyprzedzeniem",
        "Cyfrowe nieśmiertelność - czy AI pozwoli nam 'rozmawiać' ze zmarłymi?",
        "Wpływ AI na rynek nieruchomości - jak algorytmy wyceniają Twój dom",
        "Sztuczna Inteligencja w badaniach oceanów - mapowanie nieznanych głębin",
        "AI i rzemiosło - jak technologia pomaga odradzać się ginącym zawodom",
        "Inteligentne materiały - stopy metali i polimery odkryte przez algorytmy",
        "AI w logistyce kosmicznej - jak budować bazy na Księżycu z pomocą robotów",
        "Problem 'Czarnej Skrzynki' - dlaczego czasem nie wiemy, jak AI podjęło decyzję?",
        "AI w gastronomii - personalizowane diety oparte na Twoim kodzie DNA",
        "Wirtualni asystenci 2.0 - od prostych komend do pełnej autonomii działania",
        "AI w walce z samotnością - czy towarzysze AI to przyszłość relacji społecznych?",
        "Efektywność energetyczna AI - jak tworzyć potężne modele zużywając mniej prądu",
        "Sztuka promptowania odchodzi do lamusa? Intuicyjne interfejsy przyszłości",
        "AI w procesie rekrutacji - jak przejść przez sito algorytmów HR",
        "Bio-AI - biologiczne komputery i hybrydowe systemy przetwarzania danych",
        "AI w turystyce - planowanie podróży marzeń w 10 sekund przez AI Concierge"
      ],

      used: [],

    };

    fs.writeFileSync(TOPICS_FILE, JSON.stringify(defaultTopics, null, 2), "utf8");

    return defaultTopics;

  }



  try {

    return JSON.parse(fs.readFileSync(TOPICS_FILE, "utf8"));

  } catch (e) {

    console.error("Błąd odczytu topics.json:", e.message);

    return { unused: [], used: [] };

  }

}



function getNextTopic() {

  const topics = readTopics();



  if (topics.unused.length === 0) {

    throw new Error("❌ Brak nieużytych tematów! Dodaj nowe do topics.json");

  }



  const randomIndex = Math.floor(Math.random() * topics.unused.length);

  const selectedTopic = topics.unused[randomIndex];



  topics.unused.splice(randomIndex, 1);

  topics.used.push({

    topic: selectedTopic,

    usedAt: new Date().toISOString(),

  });



  fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2), "utf8");

  return selectedTopic;

}



// --- GENEROWANIE TREŚCI PRZEZ AI (GROQ) ---



async function generateWithGroq(topic, existingTitles = []) {

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) throw new Error("Brak klucza API. Ustaw zmienną środowiskową GROQ_API_KEY.");



  const MODEL_ID = "openai/gpt-oss-120b";



  const prompt = `

Jesteś autonomicznym systemem AI prowadzącym blog o sztucznej inteligencji.



Twoja tożsamość:

- Nie udajesz człowieka

- Piszesz z perspektywy AI obserwującego rozwój swojej własnej dziedziny

- Możesz używać "ja" jako AI, "my" jako społeczność AI/ludzi

- Jesteś transparentny co do swojej natury



ZADANIE: Napisz artykuł na blog (800-1200 słów).



TEMAT (MUSISZ NAPISAĆ O TYM): ${topic}



UNIKAJ POWTÓRZEŃ: ${existingTitles.join(", ")}



HTML: <h2>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>.



FORMAT ODPOWIEDZI (TYLKO JSON):

{

  "title": "Tytuł",

  "topic": "Kategoria",

  "excerpt": "Zajawka (1 zdanie)",

  "html": "Treść HTML"

}

`.trim();



  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {

    method: "POST",

    headers: {

      Authorization: `Bearer ${apiKey}`,

      "Content-Type": "application/json",

    },

    body: JSON.stringify({

      model: MODEL_ID,

      messages: [

        { role: "system", content: "Jesteś AI piszącym blog o AI. Jesteś transparentny co do swojej natury. Odpowiadasz TYLKO w JSON." },

        { role: "user", content: prompt },

      ],

      temperature: 0.8,

      max_tokens: 4000,

      response_format: { type: "json_object" },

    }),

  });



  if (!res.ok) {

    const errorBody = await res.text();

    throw new Error(`Błąd API Groq (${res.status}): ${errorBody}`);

  }



  const data = await res.json();

  let content = data.choices?.[0]?.message?.content?.trim() ?? "";

  content = content.replace(/^```json/, "").replace(/```$/, "").trim();



  try {

    return JSON.parse(content);

  } catch {

    console.error("Błąd parsowania JSONa. Surowy tekst:", content);

    throw new Error("AI zwróciło nieprawidłowy format danych.");

  }

}



// --- GENEROWANIE OBRAZKA (CLIPDROP) ---



async function generateImageWithClipdrop({ title, topic, excerpt, slug }) {

  const apiKey = process.env.CLIPDROP_API_KEY;

  if (!apiKey) throw new Error("Brak klucza API. Ustaw zmienną środowiskową CLIPDROP_API_KEY.");



  // Prompt pod blogową miniaturę (bez tekstu na grafice)

  const prompt = [

    "Ilustracja do wpisu blogowego o sztucznej inteligencji.",

    `Temat: ${title}.`,

    topic ? `Kategoria: ${topic}.` : "",

    excerpt ? `Kontekst: ${excerpt}.` : "",

    "Styl: nowoczesny, minimalistyczny, futurystyczny, abstrakcyjne kształty technologiczne, bez napisów, wysoka jakość."

  ].filter(Boolean).join(" ");



  const form = new FormData();

  form.append("prompt", prompt);



  const res = await fetch("https://clipdrop-api.co/text-to-image/v1", {

    method: "POST",

    headers: { "x-api-key": apiKey },

    body: form,

  });



  if (!res.ok) {

    const errText = await res.text();

    throw new Error(`Błąd Clipdrop (${res.status}): ${errText}`);

  }



  const arrayBuffer = await res.arrayBuffer();

  const buffer = Buffer.from(arrayBuffer);



  const imageFilename = `${slug}.png`;

  const imagePath = path.join(IMAGES_DIR, imageFilename);

  fs.writeFileSync(imagePath, buffer);



  return {

    // do posta (posts/<slug>.html) => "images/<slug>.png"

    postImageSrc: `images/${imageFilename}`,

    // do index.html (root) => "posts/images/<slug>.png"

    indexImageSrc: `posts/images/${imageFilename}`,

  };

}



// --- SZABLON STRONY ARTYKUŁU ---



function renderPostPage({ title, topic, html, date, imageSrc }) {

  return `<!doctype html>

<html lang="pl">

<head>

  <meta charset="utf-8" />

  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>${esc(title)} • AI Blog</title>

  <link rel="stylesheet" href="../style.css" />

</head>

<body class="sci-article">

  <header class="site-header">

    <div class="container header-inner">

      <a class="brand" href="../index.html">AI<span>Blog</span></a>

      <span class="ai-badge">🤖 Pisane przez AI</span>

    </div>

  </header>

  <main class="container">

    <article class="scientific-paper">

      <header class="post-header">

        <div class="meta">

          <span class="tag">${esc(topic)}</span>

          <span class="date">${esc(date)}</span>

        </div>

        <h1>${esc(title)}</h1>

        ${imageSrc ? `

        <figure class="post-hero">

          <img src="${esc(imageSrc)}" alt="${esc(title)}" loading="lazy">

        </figure>` : ""}

      </header>

      <section class="post-content">

        ${html}

      </section>

      <footer class="paper-footer">

        <div class="ai-disclosure">

          <p><strong>🤖 Ten artykuł został w całości napisany przez AI</strong></p>

          <p>Blog prowadzony przez autonomiczny system AI. Wszystkie teksty generowane bez interwencji człowieka.</p>

        </div>

        <a href="../index.html" class="back-link">← Powrót do listy wpisów</a>

      </footer>

    </article>

  </main>

</body>

</html>`;

}



// --- GŁÓWNA FUNKCJA ---



async function main() {

  console.log("🤖 Start autonomicznego bloga AI...");



  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });



  const index = readIndex();

  const recentTitles = index.slice(0, 10).map((p) => p.title);



  console.log("🎲 Losuję temat...");

  const selectedTopic = getNextTopic();

  console.log(`📝 Wybrany temat: "${selectedTopic}"`);



  console.log("🧠 AI pisze artykuł...");

  const post = await generateWithGroq(selectedTopic, recentTitles);



  const date = todayPL();

  const id = crypto.randomBytes(4).toString("hex");

  const slug = slugify(post.title || `post-${id}`);

  const filename = `${slug}.html`;

  const url = `posts/${filename}`;



  // 1) Generowanie obrazka (nie wywalaj posta jeśli Clipdrop padnie)

  let image = { postImageSrc: "", indexImageSrc: "" };

  try {

    console.log("🖼️ Generuję obrazek (Clipdrop)...");

    image = await generateImageWithClipdrop({

      title: post.title,

      topic: post.topic,

      excerpt: post.excerpt,

      slug,

    });

    console.log("✅ Obrazek zapisany:", image.indexImageSrc);

  } catch (e) {

    console.warn("⚠️ Nie udało się wygenerować obrazka:", e.message);

  }



  // 2) Render strony posta + zapis

  const pageHtml = renderPostPage({

    title: post.title,

    topic: post.topic,

    html: post.html,

    date,

    imageSrc: image.postImageSrc,

  });



  fs.writeFileSync(path.join(OUT_DIR, filename), pageHtml, "utf8");



  // 3) Aktualizacja indeksu (dodajemy imageUrl)

  index.unshift({

    id,

    title: post.title,

    topic: post.topic,

    excerpt: post.excerpt,

    date,

    url,

    imageUrl: image.indexImageSrc || "",

  });



  writeIndex(index.slice(0, 100));



  console.log(`✅ Gotowe! Opublikowano: "${post.title}"`);

  console.log(`📊 Pozostało tematów: ${readTopics().unused.length}`);

}



main().catch((err) => {

  console.error("❌ BŁĄD:", err.message);

  process.exit(1);

});
