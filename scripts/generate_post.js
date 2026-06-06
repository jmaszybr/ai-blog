/**
 * =============================================================================
 *  AI BLOG STUDIO — GENERATOR SZKICÓW
 * =============================================================================
 *  Ten skrypt NIE publikuje wpisów automatycznie.
 *
 *  Tryb podstawowy:
 *    node scripts/generate_post.js --draft
 *
 *  Efekt:
 *    - posts/drafts/<slug>.html      szkic artykułu z placeholderem obrazu
 *    - prompts/<slug>.txt            prompt do ręcznego wygenerowania obrazu
 *    - data/pending_posts.json       kolejka szkiców widoczna w /admin/
 *    - data/topics.json              pula tematów
 *
 *  Wymagana zmienna środowiskowa:
 *    - GEMINI_API_KEY
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";

const CONFIG = {
  paths: {
    root: process.cwd(),
    posts: path.join(process.cwd(), "posts"),
    drafts: path.join(process.cwd(), "posts", "drafts"),
    images: path.join(process.cwd(), "posts", "images"),
    prompts: path.join(process.cwd(), "prompts"),
    data: path.join(process.cwd(), "data"),
    pending: path.join(process.cwd(), "data", "pending_posts.json"),
    topics: path.join(process.cwd(), "topics.json"),
  },

  gemini: {
    model: "gemini-2.5-flash",
    temperature: 0.8,
    maxOutputTokens: 8192,
    timeoutMs: 90_000,
    maxRetries: 3,
    retryDelayMs: 5_000,
  },

  image: {
    width: 1200,
    height: 630,
  },

  allowedHtmlTags: ["h2", "h3", "p", "blockquote", "strong", "em", "ul", "ol", "li", "br"],
  recentTitlesLookback: 10,
  slugMaxLength: 80,
};

// Wczytywanie konfiguracji i szablonu HTML
const configPath = path.join(process.cwd(), "scripts", "config.json");
const templatePath = path.join(process.cwd(), "scripts", "template.html");

if (!fs.existsSync(configPath)) {
  throw new Error(`Brak pliku konfiguracji: ${configPath}`);
}
if (!fs.existsSync(templatePath)) {
  throw new Error(`Brak szablonu HTML: ${templatePath}`);
}

const userConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const articleTemplate = fs.readFileSync(templatePath, "utf8");

// Walidacja modelu z konfiguracji
let geminiModel = "gemini-2.5-flash";
if (typeof userConfig.modelId === "string" && userConfig.modelId.trim() !== "") {
  if (userConfig.modelId.toLowerCase().includes("gemini")) {
    geminiModel = userConfig.modelId.trim();
  } else {
    console.warn(`[Ostrzeżenie] Model '${userConfig.modelId}' z config.json nie jest kompatybilny z Gemini API. Używam bezpiecznego fallbacku: '${geminiModel}'.`);
  }
}
CONFIG.gemini.model = geminiModel;

const log = {
  _ts: () => new Date().toISOString().slice(11, 19),
  info:    (msg) => console.log(`[${log._ts()}] ℹ️  ${msg}`),
  success: (msg) => console.log(`[${log._ts()}] ✅ ${msg}`),
  warn:    (msg) => console.warn(`[${log._ts()}] ⚠️  ${msg}`),
  error:   (msg) => console.error(`[${log._ts()}] ❌ ${msg}`),
  step:    (msg) => console.log(`[${log._ts()}] → ${msg}`),
};

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
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(input ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}

function sanitizePostHtml(rawHtml) {
  return sanitizeHtml(rawHtml, {
    allowedTags: CONFIG.allowedHtmlTags,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
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
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
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

async function withRetry(fn, maxRetries = CONFIG.gemini.maxRetries, delayMs = CONFIG.gemini.retryDelayMs) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable = err.name === "AbortError" || /5\d\d/.test(String(err.message));
      if (!isRetryable || attempt === maxRetries) throw err;
      log.warn(`Próba ${attempt}/${maxRetries} nieudana: ${err.message}. Retry za ${delayMs}ms...`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw lastError;
}

function ensureDirectories() {
  for (const dir of [CONFIG.paths.posts, CONFIG.paths.drafts, CONFIG.paths.images, CONFIG.paths.prompts, CONFIG.paths.data]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function readPending() {
  const data = readJsonSafe(CONFIG.paths.pending, []);
  return Array.isArray(data) ? data : [];
}

function writePending(list) {
  writeJsonAtomic(CONFIG.paths.pending, list);
}

function readTopics() {
  if (!fs.existsSync(CONFIG.paths.topics)) {
    throw new Error(`Brak pliku tematów pod ścieżką: ${CONFIG.paths.topics}. Dodaj plik i uzupełnij sekcję 'unused'.`);
  }
  const parsed = readJsonSafe(CONFIG.paths.topics, null);
  if (!parsed) {
    throw new Error("Nie udało się odczytać tematów z data/topics.json lub plik jest pusty.");
  }
  return {
    unused: Array.isArray(parsed.unused) ? parsed.unused : [],
    used:   Array.isArray(parsed.used)   ? parsed.used   : [],
  };
}

function pickAndReserveTopic() {
  const topics = readTopics();
  if (topics.unused.length === 0) {
    throw new Error("Brak nieużytych tematów w data/topics.json. Dodaj nowe tematy do listy `unused`.");
  }

  const idx = Math.floor(Math.random() * topics.unused.length);
  const selected = topics.unused[idx];

  topics.unused.splice(idx, 1);
  topics.used.push({ topic: selected, usedAt: new Date().toISOString() });
  writeJsonAtomic(CONFIG.paths.topics, topics);

  return selected;
}

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
  "html": "Pełna treść artykułu w HTML",
  "sourceTitles": ["Tytuł źródła 1", "Tytuł źródła 2"]
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

async function generatePostWithGemini(topic, existingTitles = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Brak zmiennej środowiskowej GEMINI_API_KEY.");

  const prompt = buildPrompt(topic, existingTitles);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.gemini.model}:generateContent?key=${apiKey}`;

  return withRetry(async () => {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: userConfig.prompts?.system ? {
            parts: [{ text: userConfig.prompts.system }]
          } : undefined,
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: CONFIG.gemini.temperature,
            maxOutputTokens: CONFIG.gemini.maxOutputTokens,
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
    const candidate = data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const content = candidate?.content?.parts?.[0]?.text;

    if (!content) {
      const err = new Error(`Gemini zwrócił pustą treść (finishReason: ${finishReason})`);
      err.name = "AbortError";
      throw err;
    }

    const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(`Nie udało się sparsować JSON z Gemini: ${err.message}\nTreść: ${cleaned.slice(0, 200)}`);
    }

    validatePostPayload(parsed);

    const sources = data?.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((c) => c.web?.uri)
      .filter(Boolean) ?? [];

    const sourceTitles = Array.isArray(parsed.sourceTitles) ? parsed.sourceTitles : [];

    log.info(`Grounding: znaleziono ${sources.length} źródeł, ${sourceTitles.length} tytułów.`);
    return { ...parsed, sources, sourceTitles };
  });
}

function buildImagePrompt({ title, topic, excerpt }) {
  return `Editorial illustration for a Polish popular-science blog article.

Title: ${title}
Category: ${topic}
Excerpt: ${excerpt}

Create a horizontal hero image, 1200 × 630 px.
Style: futuristic, intelligent, atmospheric, premium editorial illustration, high detail, modern composition.
Important: no text, no letters, no logos, no watermark, no UI screenshots.
The image should work as a clean article header and Open Graph preview.`;
}

function renderArticlePage({ title, topic, html, date, excerpt, sourceTitles }) {
  const sourcesHtml = sourceTitles?.length
    ? `<h2>Źródła</h2><ol class="sources-list">
        ${sourceTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("\n")}
      </ol>`
    : "";

  const placeholder = `<!--BLOG_IMAGE_PLACEHOLDER_START-->
        <div class="post-image-placeholder" style="aspect-ratio: 1200 / 630; display: grid; place-items: center; border: 2px dashed #94a3b8; border-radius: 24px; color: #64748b; margin: 2rem 0; padding: 2rem; text-align: center;">
          <div>
            <strong>Miejsce na ilustrację</strong><br>
            Wymagany rozmiar: ${CONFIG.image.width} × ${CONFIG.image.height} px
          </div>
        </div>
        <!--BLOG_IMAGE_PLACEHOLDER_END-->`;

  const contentHtml = html + "\n" + sourcesHtml;

  return articleTemplate
    .replaceAll("{{title}}", escapeHtml(title))
    .replaceAll("{{blogName}}", escapeHtml(userConfig.blogName ?? "AI Blog"))
    .replaceAll("{{authorBadge}}", escapeHtml(userConfig.authorBadge ?? "🤖 Pisane przez AI"))
    .replaceAll("{{topic}}", escapeHtml(topic))
    .replaceAll("{{date}}", escapeHtml(date))
    .replaceAll("{{excerpt}}", escapeHtml(excerpt))
    .replaceAll("{{imageHtml}}", placeholder)
    .replaceAll("{{contentHtml}}", contentHtml)
    .replaceAll("{{disclosureTitle}}", escapeHtml(userConfig.disclosureTitle ?? ""))
    .replaceAll("{{disclosureDesc}}", escapeHtml(userConfig.disclosureDesc ?? ""));
}

async function createDraft() {
  log.info("🤖 Start AI Blog Studio — generowanie szkicu");
  ensureDirectories();

  const pending = readPending();
  const recentTitles = pending
    .slice(0, CONFIG.recentTitlesLookback)
    .map((p) => p.title)
    .filter(Boolean);

  log.step("Losuję i rezerwuję temat z puli...");
  const selectedTopic = pickAndReserveTopic();
  log.info(`Wybrany temat: "${selectedTopic}"`);

  log.step("Generuję treść artykułu przez Gemini...");
  const post = await generatePostWithGemini(selectedTopic, recentTitles);
  log.success(`Szkic wygenerowany - tytuł: "${post.title}"`);

  const now = new Date();
  const date = formatDatePL(now);
  const id = crypto.randomBytes(4).toString("hex");
  let slug = slugify(post.title) || `post-${id}`;

  if (
    fs.existsSync(path.join(CONFIG.paths.drafts, `${slug}.html`)) ||
    fs.existsSync(path.join(CONFIG.paths.posts, `${slug}.html`)) ||
    pending.some((item) => item.slug === slug)
  ) {
    slug = `${slug}-${id}`;
  }

  log.step("Sanityzuję HTML artykułu...");
  const safeHtml = sanitizePostHtml(post.html);

  const imagePrompt = buildImagePrompt({
    title: post.title,
    topic: post.topic,
    excerpt: post.excerpt,
  });

  const draftPath = path.join(CONFIG.paths.drafts, `${slug}.json`);
  const promptPath = path.join(CONFIG.paths.prompts, `${slug}.txt`);

  log.step("Zapisuję szkic i prompt do grafiki...");
  fs.writeFileSync(promptPath, imagePrompt, "utf8");

  const draftData = {
    title: post.title,
    topic: post.topic,
    excerpt: post.excerpt,
    html: safeHtml,
    date,
    sourceTitles: post.sourceTitles || []
  };

  fs.writeFileSync(draftPath, JSON.stringify(draftData, null, 2), "utf8");

  pending.unshift({
    id,
    slug,
    title: post.title,
    topic: post.topic,
    excerpt: post.excerpt,
    date,
    status: "pending_image",
    draftPath: `posts/drafts/${slug}.json`,
    promptPath: `prompts/${slug}.txt`,
    imagePath: "",
    createdAt: now.toISOString(),
  });

  writePending(pending);
  log.success(`Szkic gotowy: posts/drafts/${slug}.json`);
  log.success(`Prompt gotowy: prompts/${slug}.txt`);
  log.info("Publikacja odbędzie się dopiero z panelu /admin/ po dodaniu obrazu.");
}

function printHelp() {
  console.log(`
AI Blog Studio

Użycie:
  node scripts/generate_post.js --draft

Ten skrypt tworzy tylko szkic. Publikacja odbywa się z panelu /admin/.
`);
}

const args = process.argv.slice(2);
if (args.includes("--draft") || args.length === 0) {
  createDraft().catch((err) => {
    log.error(`BŁĄD KRYTYCZNY: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
} else {
  printHelp();
}
