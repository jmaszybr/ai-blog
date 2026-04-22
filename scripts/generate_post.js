/**
 * =============================================================================
 *  AUTONOMICZNY GENERATOR BLOGA AI
 * =============================================================================
 *  Skrypt generuje jeden wpis blogowy przy pomocy:
 *    - Gemini API (treść artykułu + grounding Google Search)
 *    - Clipdrop API (ilustracja do wpisu)
 *
 *  Wymagane zmienne środowiskowe:
 *    - GEMINI_API_KEY     - klucz do Gemini (Google AI Studio)
 *    - CLIPDROP_API_KEY   - klucz do Clipdrop (opcjonalny - bez niego brak obrazka)
 *
 *  Uruchomienie:
 *    node generate-post.mjs
 *
 *  Struktura wyjściowa (względem katalogu uruchomienia):
 *    ./posts/<slug>.html           - wygenerowany artykuł
 *    ./posts/images/<slug>.png     - ilustracja (jeśli się udała)
 *    ./posts_index.json            - indeks wszystkich wpisów (max 100)
 *    ./topics.json                 - pula tematów (unused/used)
 *
 *  Założenia projektowe:
 *    - Atomowe zapisy JSON (tmp + rename) chroniące przed uszkodzeniem pliku
 *    - Temat jest oznaczany jako "użyty" dopiero po pełnym sukcesie generacji,
 *      dzięki czemu błąd API nie marnuje tematu.
 *    - Kod zorganizowany w małe, jednoodpowiedzialne funkcje.
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// =============================================================================
//  KONFIGURACJA
// =============================================================================

const CONFIG = {
  paths: {
    root: process.cwd(),
    posts: path.join(process.cwd(), "posts"),
    images: path.join(process.cwd(), "posts", "images"),
    index: path.join(process.cwd(), "posts_index.json"),
    topics: path.join(process.cwd(), "topics.json"),
  },

  // Parametry Gemini
gemini: {
  model: "gemini-2.5-flash",
  temperature: 0.8,
  maxOutputTokens: 8192,
  timeoutMs: 90_000,
},

  // Parametry Clipdrop (generowanie obrazka)
  clipdrop: {
    endpoint: "https://clipdrop-api.co/text-to-image/v1",
    timeoutMs: 45_000,
  },

  // Limity
  maxIndexEntries: 100,
  recentTitlesLookback: 10,
  slugMaxLength: 80,
};

const DEFAULT_TOPICS = [
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
  "AI w turystyce - planowanie podróży marzeń w 10 sekund przez AI Concierge",
];

// =============================================================================
//  LOGGERtimeoutMs: 60_000
// =============================================================================

const log = {
  _ts: () => new Date().toISOString().slice(11, 19),
  info: (msg) => console.log(`[${log._ts()}] ℹ️  ${msg}`),
  success: (msg) => console.log(`[${log._ts()}] ✅ ${msg}`),
  warn: (msg) => console.warn(`[${log._ts()}] ⚠️  ${msg}`),
  error: (msg) => console.error(`[${log._ts()}] ❌ ${msg}`),
  step: (msg) => console.log(`[${log._ts()}] → ${msg}`),
};

// =============================================================================
//  NARZĘDZIA POMOCNICZE
// =============================================================================

const POLISH_DIACRITICS = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n",
  ó: "o", ś: "s", ż: "z", ź: "z",
};

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[ąćęłńóśżź]/g, (ch) => POLISH_DIACRITICS[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CONFIG.slugMaxLength);
}

function escapeHtml(input) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(input ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}

function formatDatePL(date = new Date()) {
  const months = [
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, payload, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (err) {
    log.warn(`Błąd odczytu ${path.basename(filePath)}: ${err.message}. Używam fallback.`);
    return fallback;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// =============================================================================
//  ZARZĄDZANIE INDEKSEM WPISÓW
// =============================================================================

function readIndex() {
  const data = readJsonSafe(CONFIG.paths.index, []);
  return Array.isArray(data) ? data : [];
}

function writeIndex(list) {
  const trimmed = list.slice(0, CONFIG.maxIndexEntries);
  writeJsonAtomic(CONFIG.paths.index, trimmed);
}

// =============================================================================
//  ZARZĄDZANIE TEMATAMI
// =============================================================================

function readTopics() {
  const defaults = { unused: [...DEFAULT_TOPICS], used: [] };

  if (!fs.existsSync(CONFIG.paths.topics)) {
    log.info("Tworzę nowy plik topics.json z domyślną pulą tematów.");
    writeJsonAtomic(CONFIG.paths.topics, defaults);
    return defaults;
  }

  const parsed = readJsonSafe(CONFIG.paths.topics, defaults);
  return {
    unused: Array.isArray(parsed.unused) ? parsed.unused : defaults.unused,
    used: Array.isArray(parsed.used) ? parsed.used : [],
  };
}

function pickRandomTopic() {
  const topics = readTopics();
  if (topics.unused.length === 0) {
    throw new Error("Brak nieużytych tematów w topics.json! Dodaj nowe tematy do listy `unused`.");
  }
  const idx = Math.floor(Math.random() * topics.unused.length);
  return { topic: topics.unused[idx], index: idx };
}

function commitTopicAsUsed(topicText) {
  const topics = readTopics();
  const idx = topics.unused.indexOf(topicText);
  if (idx === -1) {
    log.warn(`Nie znalazłem tematu "${topicText}" w unused przy commit - pomijam.`);
    return;
  }
  topics.unused.splice(idx, 1);
  topics.used.push({ topic: topicText, usedAt: new Date().toISOString() });
  writeJsonAtomic(CONFIG.paths.topics, topics);
}

// =============================================================================
//  GENEROWANIE TREŚCI (GEMINI)
// =============================================================================

function buildPrompt(topic, existingTitles) {
  const avoidClause = existingTitles.length
    ? `Unikaj tytułów podobnych do: ${existingTitles.join("; ")}.`
    : "";

  return `Napisz esej blogowy w języku polskim o długości około 800 słów.

Temat: ${topic}

Styl: popularnonaukowy, wizjonerski, głęboki - ma wciągać czytelnika.
Format treści: czysty HTML z tagami <h2>, <p>, <blockquote>. Bez <html>, <body>, <head>.
${avoidClause}

WAŻNE zasady dotyczące faktów:
- Opieraj się na faktach z wyszukiwarki Google (masz do niej dostęp).
- Nie wymyślaj nazw konkretnych systemów, projektów ani organizacji.
- Nie podawaj konkretnych liczb ani dat jeśli nie jesteś pewien - używaj "około", "szacunkowo".
- Nie cytuj wypowiedzi konkretnych osób jeśli ich nie znasz.

Zwróć WYŁĄCZNIE poprawny JSON o następującej strukturze (bez żadnego tekstu przed ani po):
{
  "title": "Chwytliwy tytuł artykułu",
  "topic": "Krótka kategoria (1-3 słowa)",
  "excerpt": "Zajawka 1-2 zdania do wyświetlenia na liście wpisów",
  "html": "Pełna treść artykułu w HTML"
}`;
}

function validatePostPayload(payload) {
  const required = ["title", "topic", "excerpt", "html"];
  for (const field of required) {
    if (typeof payload?.[field] !== "string" || !payload[field].trim()) {
      throw new Error(`Gemini zwrócił niekompletny JSON - brak/puste pole: ${field}`);
    }
  }
}

/**
 * Wywołuje Gemini API z groundingiem Google Search.
 * Zwraca sparsowany obiekt wpisu + listę źródeł.
 */
async function generatePostWithGemini(topic, existingTitles = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Brak zmiennej środowiskowej GEMINI_API_KEY.");

  const prompt = buildPrompt(topic, existingTitles);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.gemini.model}:generateContent?key=${apiKey}`;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],

        // Grounding - Gemini przeszukuje Google przed odpowiedzią
        tools: [{ googleSearch: {} }],

        generationConfig: {
          temperature: CONFIG.gemini.temperature,
          maxOutputTokens: CONFIG.gemini.maxOutputTokens,
          // Nie używamy responseMimeType: "application/json" razem z groundingiem
          // bo Gemini nie obsługuje obu naraz - parsujemy JSON ręcznie
        },
      }),
    },
    CONFIG.gemini.timeoutMs
  );

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    log.error(`Gemini API ${response.status}: ${JSON.stringify(errBody)}`);
    throw new Error(`Gemini API zwróciło status ${response.status}`);
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) throw new Error("Gemini API zwrócił odpowiedź bez pola content.");

  // Gemini może owinąć JSON w ```json ... ``` - czyścimy to
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Nie udało się sparsować JSON z Gemini: ${err.message}\nTreść: ${cleaned.slice(0, 200)}`);
  }

  validatePostPayload(parsed);

  // Wyciągamy źródła z metadanych groundingu
  const sources = data?.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.map((c) => c.web?.uri)
    .filter(Boolean) ?? [];

  log.info(`Grounding: znaleziono ${sources.length} źródeł.`);

  return { ...parsed, sources };
}

// =============================================================================
//  GENEROWANIE OBRAZKA (CLIPDROP)
// =============================================================================

async function generateImageWithClipdrop({ title, topic, slug }) {
  const apiKey = process.env.CLIPDROP_API_KEY;
  if (!apiKey) throw new Error("Brak zmiennej środowiskowej CLIPDROP_API_KEY.");

  const prompt =
    `Futuristic digital art illustration for blog post about ${title}, ` +
    `category ${topic}. Minimalist, high tech, sharp focus, 8k.`;

  const form = new FormData();
  form.append("prompt", prompt);

  const response = await fetchWithTimeout(
    CONFIG.clipdrop.endpoint,
    {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
    },
    CONFIG.clipdrop.timeoutMs
  );

  if (!response.ok) throw new Error(`Clipdrop API zwróciło status ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${slug}.png`;
  const absolutePath = path.join(CONFIG.paths.images, filename);
  fs.writeFileSync(absolutePath, buffer);

  return {
    forArticle: `images/${filename}`,
    forIndex: `posts/images/${filename}`,
  };
}

// =============================================================================
//  SZABLON HTML ARTYKUŁU
// =============================================================================

function renderArticlePage({ title, topic, html, date, imageSrc, excerpt, sources }) {
  const heroImg = imageSrc
    ? `<img src="${escapeHtml(imageSrc)}" class="post-hero" alt="${escapeHtml(title)}">`
    : "";

  // Sekcja źródeł - tylko jeśli Gemini zwrócił jakieś
  const sourcesHtml = sources?.length
    ? `<h2>Źródła</h2><ul class="sources-list">
        ${sources.map((s) => `<li><a href="${escapeHtml(s)}" target="_blank" rel="noopener">${escapeHtml(s)}</a></li>`).join("\n")}
      </ul>`
    : "";

  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} • AI Blog</title>
  <meta name="description" content="${escapeHtml(excerpt)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(excerpt)}" />
  <meta property="og:type" content="article" />
  ${imageSrc ? `<meta property="og:image" content="${escapeHtml(imageSrc)}" />` : ""}
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
        <div class="meta">
          <span>${escapeHtml(topic)}</span> | <span>${escapeHtml(date)}</span>
        </div>
        <h1>${escapeHtml(title)}</h1>
        ${heroImg}
      </header>
      <section class="post-content">
        ${html}
        ${sourcesHtml}
      </section>
      <footer class="paper-footer">
        <p><strong>🤖 Artykuł wygenerowany automatycznie przez AI z wykorzystaniem Google Search.</strong></p>
        <p><em>⚠️ Mimo groundingu w źródłach, zawsze weryfikuj kluczowe fakty przed cytowaniem.</em></p>
        <a href="../index.html">← Powrót na stronę główną</a>
      </footer>
    </article>
  </main>
</body>
</html>`;
}

// =============================================================================
//  ORKIESTRACJA
// =============================================================================

function ensureDirectories() {
  for (const dir of [CONFIG.paths.posts, CONFIG.paths.images]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  log.info("🤖 Start autonomicznego generatora bloga AI (Gemini + Google Search)");

  // Krok 1: foldery
  ensureDirectories();

  // Krok 2: indeks i ostatnie tytuły
  const index = readIndex();
  const recentTitles = index
    .slice(0, CONFIG.recentTitlesLookback)
    .map((p) => p.title)
    .filter(Boolean);

  // Krok 3: losowanie tematu
  log.step("Losuję temat z puli...");
  const { topic: selectedTopic } = pickRandomTopic();
  log.info(`Wybrany temat: "${selectedTopic}"`);

  // Krok 4: generowanie treści przez Gemini z groundingiem
  log.step("Generuję treść artykułu przez Gemini (Google Search grounding)...");
  const post = await generatePostWithGemini(selectedTopic, recentTitles);
  log.success(`Artykuł wygenerowany - tytuł: "${post.title}"`);

  // Metadane
  const date = formatDatePL();
  const id = crypto.randomBytes(4).toString("hex");
  const slug = slugify(post.title) || `post-${id}`;

  // Krok 5: obrazek (opcjonalny)
  let image = { forArticle: "", forIndex: "" };
  try {
    log.step("Generuję ilustrację przez Clipdrop...");
    image = await generateImageWithClipdrop({ title: post.title, topic: post.topic, slug });
    log.success("Ilustracja zapisana.");
  } catch (err) {
    log.warn(`Ilustracja pominięta: ${err.message}`);
  }

  // Krok 6: zapis HTML
  log.step("Zapisuję plik HTML artykułu...");
  const pageHtml = renderArticlePage({
    title: post.title,
    topic: post.topic,
    excerpt: post.excerpt,
    html: post.html,
    date,
    imageSrc: image.forArticle,
    sources: post.sources,
  });
  const articlePath = path.join(CONFIG.paths.posts, `${slug}.html`);
  fs.writeFileSync(articlePath, pageHtml, "utf8");

  // Krok 7: aktualizacja indeksu
  log.step("Aktualizuję indeks wpisów...");
  index.unshift({
    id,
    title: post.title,
    topic: post.topic,
    excerpt: post.excerpt,
    date,
    url: `posts/${slug}.html`,
    imageUrl: image.forIndex || "",
  });
  writeIndex(index);

  // Krok 8: commit tematu
  commitTopicAsUsed(selectedTopic);

  log.success(`🎉 Opublikowano: "${post.title}" → ${articlePath}`);
}

// =============================================================================
//  ENTRY POINT
// =============================================================================

main().catch((err) => {
  log.error(`BŁĄD KRYTYCZNY: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
