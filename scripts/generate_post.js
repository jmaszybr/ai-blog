import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// --- KONFIGURACJA ŚCIEŻEK (Zawsze względem głównego katalogu projektu) ---
const ROOT_DIR = process.cwd();
const OUT_DIR = path.join(ROOT_DIR, "posts");
const IMAGES_DIR = path.join(OUT_DIR, "images");
const INDEX_FILE = path.join(ROOT_DIR, "posts_index.json");
const TOPICS_FILE = path.join(ROOT_DIR, "topics.json");

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
  try {
    if (!fs.existsSync(INDEX_FILE)) return [];
    const data = fs.readFileSync(INDEX_FILE, "utf8");
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.warn("⚠️ Problem z indeksem, zaczynam od nowa:", e.message);
    return [];
  }
}

function writeIndex(list) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), "utf8");
}

// --- ZARZĄDZANIE TEMATAMI ---

function readTopics() {
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
      "Ewolucja wyszukiwarek - dlaczego Google zmienia się w Answer Engine",
      "AI w zarządzaniu kryzysowym - przewidywanie powodzi i pożarów z wyprzedzeniem",
      "AI w procesie rekrutacji - jak przejść przez sito algorytmów HR",
      "AI w turystyce - planowanie podróży marzeń w 10 sekund przez AI Concierge"
    ],
    used: [],
  };

  try {
    if (!fs.existsSync(TOPICS_FILE)) {
      console.log("📝 Tworzę nowy plik topics.json...");
      fs.writeFileSync(TOPICS_FILE, JSON.stringify(defaultTopics, null, 2), "utf8");
      return defaultTopics;
    }

    const data = fs.readFileSync(TOPICS_FILE, "utf8");
    const parsed = data ? JSON.parse(data) : defaultTopics;

    // Gwarancja, że unused i used są tablicami (zapobiega błędowi .length)
    return {
      unused: Array.isArray(parsed.unused) ? parsed.unused : defaultTopics.unused,
      used: Array.isArray(parsed.used) ? parsed.used : []
    };
  } catch (e) {
    console.error("⚠️ Błąd odczytu topics.json, używam domyślnych:", e.message);
    return defaultTopics;
  }
}

function getNextTopic() {
  const topics = readTopics();

  if (!topics.unused || topics.unused.length === 0) {
    throw new Error("❌ Brak nieużytych tematów w topics.json!");
  }

  const randomIndex = Math.floor(Math.random() * topics.unused.length);
  const selectedTopic = topics.unused[randomIndex];

  // Aktualizacja list
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
  if (!apiKey) throw new Error("Brak klucza API GROQ_API_KEY.");

  const MODEL_ID = "llama-3.3-70b-versatile"; // Zaktualizowany stabilny model Groq

  const prompt = `
ZADANIE: Napisz artykuł na blog o AI (800-1200 słów).
TEMAT: ${topic}
UNIKAJ TYCH TYTUŁÓW: ${existingTitles.join(", ")}
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
        { role: "system", content: "Jesteś AI piszącym blog o AI. Piszesz profesjonalnie i transparentnie. Odpowiadasz TYLKO w JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) throw new Error(`Błąd API Groq: ${res.status}`);

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// --- GENEROWANIE OBRAZKA (CLIPDROP) ---

async function generateImageWithClipdrop({ title, topic, slug }) {
  const apiKey = process.env.CLIPDROP_API_KEY;
  if (!apiKey) throw new Error("Brak klucza API CLIPDROP_API_KEY.");

  const prompt = `Futuristic digital art illustration for blog post about ${title}, category ${topic}. Minimalist, high tech, sharp focus, 8k.`;

  const form = new FormData();
  form.append("prompt", prompt);

  const res = await fetch("https://clipdrop-api.co/text-to-image/v1", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });

  if (!res.ok) throw new Error(`Błąd Clipdrop: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const imageFilename = `${slug}.png`;
  const imagePath = path.join(IMAGES_DIR, imageFilename);
  
  fs.writeFileSync(imagePath, buffer);

  return {
    postImageSrc: `images/${imageFilename}`,
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
    </div>
  </header>
  <main class="container">
    <article class="scientific-paper">
      <header class="post-header">
        <div class="meta"><span>${esc(topic)}</span> | <span>${esc(date)}</span></div>
        <h1>${esc(title)}</h1>
        ${imageSrc ? `<img src="${esc(imageSrc)}" class="post-hero" alt="${esc(title)}">` : ""}
      </header>
      <section class="post-content">${html}</section>
      <footer class="paper-footer">
        <p><strong>🤖 Artykuł wygenerowany automatycznie przez AI.</strong></p>
        <a href="../index.html">← Powrót</a>
      </footer>
    </article>
  </main>
</body>
</html>`;
}

// --- GŁÓWNA FUNKCJA ---

async function main() {
  console.log("🤖 Start autonomicznego bloga AI...");

  // Inicjalizacja folderów
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const index = readIndex();
  const recentTitles = index.slice(0, 10).map((p) => p.title);

  console.log("🎲 Losuję temat...");
  const selectedTopic = getNextTopic();

  console.log(`🧠 AI pisze o: "${selectedTopic}"`);
  const post = await generateWithGroq(selectedTopic, recentTitles);

  const date = todayPL();
  const id = crypto.randomBytes(4).toString("hex");
  const slug = slugify(post.title || `post-${id}`);
  
  let image = { postImageSrc: "", indexImageSrc: "" };
  try {
    console.log("🖼️ Generuję obrazek...");
    image = await generateImageWithClipdrop({ title: post.title, topic: post.topic, slug });
  } catch (e) {
    console.warn("⚠️ Obrazek pominięty:", e.message);
  }

  const pageHtml = renderPostPage({
    title: post.title,
    topic: post.topic,
    html: post.html,
    date,
    imageSrc: image.postImageSrc,
  });

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), pageHtml, "utf8");

  index.unshift({
    id,
    title: post.title,
    topic: post.topic,
    excerpt: post.excerpt,
    date,
    url: `posts/${slug}.html`,
    imageUrl: image.indexImageSrc || "",
  });

  writeIndex(index.slice(0, 100));
  console.log(`✅ Opublikowano: ${post.title}`);
}

main().catch((err) => {
  console.error("❌ BŁĄD KRYTYCZNY:", err.message);
  process.exit(1);
});
