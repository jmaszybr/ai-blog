/**
 * =============================================================================
 *  AUTONOMICZNY GENERATOR BLOGA AI
 * =============================================================================
 *  Skrypt generuje jeden wpis blogowy przy pomocy:
 *    - Groq API (treść artykułu, model LLM)
 *    - Clipdrop API (ilustracja do wpisu)
 *
 *  Wymagane zmienne środowiskowe:
 *    - GROQ_API_KEY       - klucz do Groq
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

/**
 * Centralna konfiguracja skryptu. Wszystkie "magiczne liczby" i ścieżki
 * w jednym miejscu - łatwo modyfikować bez grzebania w logice.
 */
const CONFIG = {
  // Ścieżki - zawsze względem katalogu, z którego uruchomiono skrypt
  paths: {
    root: process.cwd(),
    posts: path.join(process.cwd(), "posts"),
    images: path.join(process.cwd(), "posts", "images"),
    index: path.join(process.cwd(), "posts_index.json"),
    topics: path.join(process.cwd(), "topics.json"),
  },

  // Parametry Groq (LLM)
  groq: {
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-120b",
    temperature: 0.8,
    maxCompletionTokens: 4500, // ~1500 słów PL ≈ 2500-3000 tokenów + narzut HTML/JSON
    timeoutMs: 60_000,
  },

  // Parametry Clipdrop (generowanie obrazka)
  clipdrop: {
    endpoint: "https://clipdrop-api.co/text-to-image/v1",
    timeoutMs: 45_000,
  },

  // Limity
  maxIndexEntries: 100,       // ile wpisów trzymamy w indeksie
  recentTitlesLookback: 10,   // ile ostatnich tytułów podajemy modelowi jako "nie powtarzaj"
  slugMaxLength: 80,
};

// Domyślna pula tematów (używana tylko przy pierwszym uruchomieniu,
// gdy topics.json jeszcze nie istnieje).
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
//  LOGGER - prosty, z prefiksem i timestampem
// =============================================================================

/**
 * Minimalistyczny logger. W produkcji można zamienić na pino/winston,
 * ale dla skryptu CI/CD w zupełności wystarczy.
 */
const log = {
  _ts: () => new Date().toISOString().slice(11, 19), // HH:MM:SS
  info: (msg) => console.log(`[${log._ts()}] ℹ️  ${msg}`),
  success: (msg) => console.log(`[${log._ts()}] ✅ ${msg}`),
  warn: (msg) => console.warn(`[${log._ts()}] ⚠️  ${msg}`),
  error: (msg) => console.error(`[${log._ts()}] ❌ ${msg}`),
  step: (msg) => console.log(`[${log._ts()}] → ${msg}`),
};

// =============================================================================
//  NARZĘDZIA POMOCNICZE
// =============================================================================

/**
 * Mapa polskich znaków diakrytycznych - używana przez slugify().
 * Pełne pokrycie liter (również wielkich - choć slugify najpierw robi toLowerCase,
 * to i tak zostawiamy pełną mapę dla bezpieczeństwa).
 */
const POLISH_DIACRITICS = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n",
  ó: "o", ś: "s", ż: "z", ź: "z",
};

/**
 * Konwertuje string na "slug" (bezpieczna nazwa pliku / URL).
 * Przykład: "AI w sądownictwie!" -> "ai-w-sadownictwie"
 *
 * @param {string} input - dowolny tekst wejściowy
 * @returns {string} slug ograniczony do [a-z0-9-]
 */
function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[ąćęłńóśżź]/g, (ch) => POLISH_DIACRITICS[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "-")  // wszystko nie-alfanumeryczne -> "-"
    .replace(/^-+|-+$/g, "")       // wytnij myślniki z początku/końca
    .slice(0, CONFIG.slugMaxLength);
}

/**
 * Escapuje znaki specjalne HTML. Używane WYŁĄCZNIE do danych, które chcemy
 * potraktować jako tekst (tytuł, kategoria, data).
 *
 * UWAGA: Treść artykułu (post.html) celowo NIE jest escapowana, bo ma zawierać
 * tagi HTML wygenerowane przez model. To świadomy kompromis - akceptujemy ryzyko
 * w zamian za możliwość formatowania.
 */
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

/**
 * Zwraca dzisiejszą datę w formacie "5 listopada 2025" (polski).
 */
function formatDatePL(date = new Date()) {
  const months = [
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Atomowy zapis JSON do pliku.
 *
 * Problem: fs.writeFileSync zapisuje "w trakcie" - jeśli proces zginie
 * w połowie zapisu, plik jest uszkodzony.
 *
 * Rozwiązanie: zapisujemy do pliku tymczasowego, potem robimy rename().
 * rename() jest atomowe na poziomie systemu plików - albo działa, albo nie,
 * plik docelowy zawsze pozostaje w spójnym stanie.
 */
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, payload, "utf8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Bezpieczne czytanie pliku JSON. Zwraca fallback przy błędach.
 */
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

/**
 * Wrapper na fetch z timeoutem. Node 18+ ma natywny AbortController.
 */
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

/**
 * Wczytuje posts_index.json. Zwraca pustą tablicę jeśli plik nie istnieje
 * lub jest uszkodzony (z ostrzeżeniem).
 */
function readIndex() {
  const data = readJsonSafe(CONFIG.paths.index, []);
  return Array.isArray(data) ? data : [];
}

/**
 * Zapisuje indeks (atomowo) i przycina do maksymalnego rozmiaru.
 */
function writeIndex(list) {
  const trimmed = list.slice(0, CONFIG.maxIndexEntries);
  writeJsonAtomic(CONFIG.paths.index, trimmed);
}

// =============================================================================
//  ZARZĄDZANIE TEMATAMI
// =============================================================================

/**
 * Struktura topics.json:
 * {
 *   "unused": ["temat 1", "temat 2", ...],
 *   "used":   [{ "topic": "...", "usedAt": "2025-..." }, ...]
 * }
 */

/**
 * Wczytuje topics.json lub tworzy nowy z domyślną pulą.
 * Waliduje strukturę - `unused` i `used` muszą być tablicami.
 */
function readTopics() {
  const defaults = {
    unused: [...DEFAULT_TOPICS],
    used: [],
  };

  // Plik nie istnieje - utwórz z domyślnych
  if (!fs.existsSync(CONFIG.paths.topics)) {
    log.info("Tworzę nowy plik topics.json z domyślną pulą tematów.");
    writeJsonAtomic(CONFIG.paths.topics, defaults);
    return defaults;
  }

  const parsed = readJsonSafe(CONFIG.paths.topics, defaults);

  // Defensywna walidacja - jeśli ktoś ręcznie popsuł strukturę
  return {
    unused: Array.isArray(parsed.unused) ? parsed.unused : defaults.unused,
    used: Array.isArray(parsed.used) ? parsed.used : [],
  };
}

/**
 * Losuje temat z puli `unused` BEZ jego usuwania.
 *
 * WAŻNA ZMIANA vs. stara wersja: oddzieliliśmy "wylosowanie" od "oznaczenia
 * jako użyty". Dzięki temu jeśli Groq/Clipdrop padnie, temat nie marnuje się.
 * Oznaczenie jako użyty następuje dopiero w commitTopicAsUsed().
 */
function pickRandomTopic() {
  const topics = readTopics();

  if (topics.unused.length === 0) {
    throw new Error(
      "Brak nieużytych tematów w topics.json! Dodaj nowe tematy do listy `unused`."
    );
  }

  const idx = Math.floor(Math.random() * topics.unused.length);
  return {
    topic: topics.unused[idx],
    index: idx,
  };
}

/**
 * Przenosi temat z `unused` do `used` i zapisuje plik atomowo.
 * Wywoływane DOPIERO po pomyślnym wygenerowaniu i zapisaniu artykułu.
 */
function commitTopicAsUsed(topicText) {
  const topics = readTopics();
  const idx = topics.unused.indexOf(topicText);

  if (idx === -1) {
    // Ktoś mógł zmodyfikować plik w międzyczasie - nie wywalamy skryptu,
    // tylko logujemy ostrzeżenie. Artykuł i tak już jest zapisany.
    log.warn(`Nie znalazłem tematu "${topicText}" w unused przy commit - pomijam.`);
    return;
  }

  topics.unused.splice(idx, 1);
  topics.used.push({
    topic: topicText,
    usedAt: new Date().toISOString(),
  });

  writeJsonAtomic(CONFIG.paths.topics, topics);
}

// =============================================================================
//  GENEROWANIE TREŚCI (GROQ)
// =============================================================================

/**
 * Buduje prompt dla modelu. Wydzielone do osobnej funkcji, żeby łatwo
 * eksperymentować z treścią bez grzebania w logice HTTP.
 */
function buildPrompt(topic, existingTitles) {
  const avoidClause = existingTitles.length
    ? `Unikaj tytułów podobnych do: ${existingTitles.join("; ")}.`
    : "";

  return `Napisz esej blogowy w języku polskim o długości około 1500 słów.

Temat: ${topic}

Styl: popularnonaukowy, wizjonerski, głęboki - ma wciągać czytelnika.
Format treści: czysty HTML z tagami <h2>, <p>, <blockquote>. Bez <html>, <body>, <head>.
${avoidClause}

Zwróć WYŁĄCZNIE poprawny JSON o następującej strukturze:
{
  "title": "Chwytliwy tytuł artykułu",
  "topic": "Krótka kategoria (1-3 słowa)",
  "excerpt": "Zajawka 1-2 zdania do wyświetlenia na liście wpisów",
  "html": "Pełna treść artykułu w HTML"
}`;
}

/**
 * Waliduje strukturę odpowiedzi z Groq. Rzuca błędem przy braku
 * wymaganych pól - to lepsze niż cichy zapis pustego artykułu.
 */
function validatePostPayload(payload) {
  const required = ["title", "topic", "excerpt", "html"];
  for (const field of required) {
    if (typeof payload?.[field] !== "string" || !payload[field].trim()) {
      throw new Error(`Groq zwrócił niekompletny JSON - brak/puste pole: ${field}`);
    }
  }
}

/**
 * Wywołuje Groq API i zwraca sparsowany, zwalidowany obiekt wpisu.
 */
async function generatePostWithGroq(topic, existingTitles = []) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Brak zmiennej środowiskowej GROQ_API_KEY.");
  }

  const prompt = buildPrompt(topic, existingTitles);

  const response = await fetchWithTimeout(
    CONFIG.groq.endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CONFIG.groq.model,
        messages: [{ role: "user", content: prompt }],
        temperature: CONFIG.groq.temperature,
        max_completion_tokens: CONFIG.groq.maxCompletionTokens,
        response_format: { type: "json_object" },
      }),
    },
    CONFIG.groq.timeoutMs
  );

  if (!response.ok) {
    // Próbujemy wyciągnąć szczegóły błędu - pomocne przy debugowaniu
    // (limity TPM, nieprawidłowy model, błędny klucz itd.)
    const errBody = await response.json().catch(() => ({}));
    log.error(`Groq API ${response.status}: ${JSON.stringify(errBody)}`);
    throw new Error(`Groq API zwróciło status ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq API zwrócił odpowiedź bez pola content.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`Nie udało się sparsować JSON z Groq: ${err.message}`);
  }

  validatePostPayload(parsed);
  return parsed;
}

// =============================================================================
//  GENEROWANIE OBRAZKA (CLIPDROP)
// =============================================================================

/**
 * Generuje PNG przez Clipdrop i zapisuje do posts/images/<slug>.png.
 *
 * Zwraca dwie ścieżki bo:
 *   - artykuł leży w posts/ i referuje obrazek jako "images/xyz.png"
 *   - indeks (listing) leży w root i referuje obrazek jako "posts/images/xyz.png"
 */
async function generateImageWithClipdrop({ title, topic, slug }) {
  const apiKey = process.env.CLIPDROP_API_KEY;
  if (!apiKey) {
    throw new Error("Brak zmiennej środowiskowej CLIPDROP_API_KEY.");
  }

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

  if (!response.ok) {
    throw new Error(`Clipdrop API zwróciło status ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${slug}.png`;
  const absolutePath = path.join(CONFIG.paths.images, filename);

  fs.writeFileSync(absolutePath, buffer);

  return {
    // Ścieżka relatywna z punktu widzenia pliku artykułu (posts/<slug>.html)
    forArticle: `images/${filename}`,
    // Ścieżka relatywna z punktu widzenia indeksu (root)
    forIndex: `posts/images/${filename}`,
  };
}

// =============================================================================
//  SZABLON HTML ARTYKUŁU
// =============================================================================

/**
 * Renderuje finalny plik HTML artykułu.
 * Uwaga: `html` (treść) wstawiane jest BEZ escapowania - to świadome.
 * Pozostałe pola (title, topic, date, imageSrc) są escapowane.
 */
function renderArticlePage({ title, topic, html, date, imageSrc, excerpt }) {
  const heroImg = imageSrc
    ? `<img src="${escapeHtml(imageSrc)}" class="post-hero" alt="${escapeHtml(title)}">`
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
      <section class="post-content">${html}</section>
      <footer class="paper-footer">
        <p><strong>🤖 Artykuł wygenerowany automatycznie przez AI.</strong></p>
        <a href="../index.html">← Powrót na stronę główną</a>
      </footer>
    </article>
  </main>
</body>
</html>`;
}

// =============================================================================
//  ORKIESTRACJA - główna funkcja
// =============================================================================

/**
 * Zapewnia, że wszystkie potrzebne katalogi istnieją.
 */
function ensureDirectories() {
  for (const dir of [CONFIG.paths.posts, CONFIG.paths.images]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Główna funkcja - orkiestruje cały proces generowania wpisu.
 *
 * Kolejność kroków ma znaczenie:
 *   1. Przygotowanie folderów
 *   2. Wczytanie indeksu (do "anty-powtórek" tytułów)
 *   3. Wylosowanie tematu (bez commita!)
 *   4. Wygenerowanie treści (Groq)
 *   5. Wygenerowanie obrazka (Clipdrop - błąd tolerowany)
 *   6. Zapis artykułu HTML
 *   7. Aktualizacja indeksu
 *   8. Commit tematu jako "użytego"
 *
 * Gdybyśmy commitowali temat od razu po wylosowaniu (jak w starej wersji),
 * błąd w kroku 4 marnowałby temat bezpowrotnie.
 */
async function main() {
  log.info("🤖 Start autonomicznego generatora bloga AI");

  // Krok 1: foldery
  ensureDirectories();

  // Krok 2: indeks i ostatnie tytuły
  const index = readIndex();
  const recentTitles = index
    .slice(0, CONFIG.recentTitlesLookback)
    .map((p) => p.title)
    .filter(Boolean);

  // Krok 3: losowanie tematu (bez modyfikacji pliku!)
  log.step("Losuję temat z puli...");
  const { topic: selectedTopic } = pickRandomTopic();
  log.info(`Wybrany temat: "${selectedTopic}"`);

  // Krok 4: generowanie treści
  log.step("Generuję treść artykułu przez Groq...");
  const post = await generatePostWithGroq(selectedTopic, recentTitles);
  log.success(`Artykuł wygenerowany - tytuł: "${post.title}"`);

  // Przygotowanie metadanych
  const date = formatDatePL();
  const id = crypto.randomBytes(4).toString("hex");
  const slug = slugify(post.title) || `post-${id}`;

  // Krok 5: obrazek (opcjonalny - błąd nie zabija całego procesu)
  let image = { forArticle: "", forIndex: "" };
  try {
    log.step("Generuję ilustrację przez Clipdrop...");
    image = await generateImageWithClipdrop({
      title: post.title,
      topic: post.topic,
      slug,
    });
    log.success("Ilustracja zapisana.");
  } catch (err) {
    log.warn(`Ilustracja pominięta: ${err.message}`);
  }

  // Krok 6: zapis HTML artykułu
  log.step("Zapisuję plik HTML artykułu...");
  const pageHtml = renderArticlePage({
    title: post.title,
    topic: post.topic,
    excerpt: post.excerpt,
    html: post.html,
    date,
    imageSrc: image.forArticle,
  });
  const articlePath = path.join(CONFIG.paths.posts, `${slug}.html`);
  fs.writeFileSync(articlePath, pageHtml, "utf8");

  // Krok 7: aktualizacja indeksu (atomowa)
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

  // Krok 8: dopiero teraz "zużywamy" temat
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
