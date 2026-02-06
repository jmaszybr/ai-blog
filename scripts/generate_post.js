import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// --- ŁADOWANIE ZEWNĘTRZNEJ KONFIGURACJI ---
const CONFIG = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const POST_TEMPLATE = fs.readFileSync("./template.html", "utf8");

const OUT_DIR = "posts";
const IMAGES_DIR = path.join(OUT_DIR, "images");
const INDEX_FILE = "posts_index.json";
const TOPICS_FILE = "topics.json";

// --- NARZĘDZIA POMOCNICZE ---

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l")
    .replace(/ń/g, "n").replace(/ó/g, "o").replace(/ś/g, "s").replace(/ż/g, "z").replace(/ź/g, "z")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function todayPL() {
  const d = new Date();
  const months = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// --- LOGIKA PLIKÓW ---

function readIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")); } catch { return []; }
}

function readTopics() {
  if (!fs.existsSync(TOPICS_FILE)) {
    const defaultTopics = { unused: ["AI w codziennej pracy", "Przyszłość robotyki"], used: [] };
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(defaultTopics, null, 2));
    return defaultTopics;
  }
  return JSON.parse(fs.readFileSync(TOPICS_FILE, "utf8"));
}

function getNextTopic() {
  const topics = readTopics();
  if (!topics.unused.length) throw new Error("Brak tematów!");
  const randomIndex = Math.floor(Math.random() * topics.unused.length);
  const selected = topics.unused.splice(randomIndex, 1)[0];
  topics.used.push({ topic: selected, usedAt: new Date().toISOString() });
  fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2));
  return selected;
}

// --- INTEGRACJE API ---

async function generateWithGroq(topic, existingTitles = []) {
  const apiKey = process.env.GROQ_API_KEY;
  const prompt = `ZADANIE: Napisz artykuł na blog (800-1200 słów). TEMAT: ${topic}. UNIKAJ POWTÓRZEŃ: ${existingTitles.join(", ")}. FORMAT ODPOWIEDZI (JSON): {"title": "Tytuł", "topic": "Kategoria", "excerpt": "Zajawka", "html": "Treść"}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONFIG.modelId,
      messages: [
        { role: "system", content: CONFIG.prompts.system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function generateImageWithClipdrop({ title, topic, excerpt, slug }) {
  const apiKey = process.env.CLIPDROP_API_KEY;
  const prompt = `Ilustracja: ${title}. ${topic}. ${excerpt}. ${CONFIG.prompts.imageStyle}`;
  const form = new FormData();
  form.append("prompt", prompt);

  const res = await fetch("https://clipdrop-api.co/text-to-image/v1", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });

  const buffer = Buffer.from(await res.arrayBuffer());
  const imageFilename = `${slug}.png`;
  fs.writeFileSync(path.join(IMAGES_DIR, imageFilename), buffer);

  return { postImageSrc: `images/${imageFilename}`, indexImageSrc: `posts/images/${imageFilename}` };
}

// --- RENDEROWANIE ---

function renderPostPage({ title, topic, html, date, imageSrc }) {
  let template = POST_TEMPLATE;
  const imageHtml = imageSrc ? `<figure class="post-hero"><img src="${esc(imageSrc)}" alt="${esc(title)}"></figure>` : "";

  const map = {
    "{{title}}": esc(title),
    "{{topic}}": esc(topic),
    "{{date}}": esc(date),
    "{{contentHtml}}": html,
    "{{imageHtml}}": imageHtml,
    "{{blogName}}": CONFIG.blogName,
    "{{authorBadge}}": CONFIG.authorBadge,
    "{{disclosureTitle}}": CONFIG.disclosureTitle,
    "{{disclosureDesc}}": CONFIG.disclosureDesc
  };

  Object.entries(map).forEach(([key, val]) => template = template.replaceAll(key, val));
  return template;
}

// --- MAIN ---

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  
  const index = readIndex();
  const topic = getNextTopic();
  const post = await generateWithGroq(topic, index.slice(0, 10).map(p => p.title));
  
  const date = todayPL();
  const slug = slugify(post.title);
  
  let image = { postImageSrc: "", indexImageSrc: "" };
  try {
    image = await generateImageWithClipdrop({ ...post, slug });
  } catch (e) { console.warn("Obrazek pominnięty"); }

  const pageHtml = renderPostPage({ ...post, date, imageSrc: image.postImageSrc });
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), pageHtml);

  index.unshift({ title: post.title, topic: post.topic, date, url: `posts/${slug}.html`, imageUrl: image.indexImageSrc });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index.slice(0, 100), null, 2));
  
  console.log(`✅ Opublikowano: ${post.title}`);
}

main().catch(console.error);
