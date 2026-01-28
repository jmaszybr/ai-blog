import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OUT_DIR = "posts";
const INDEX_FILE = "posts_index.json";

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e").replace(/ł/g,"l")
    .replace(/ń/g,"n").replace(/ó/g,"o").replace(/ś/g,"s").replace(/ż/g,"z").replace(/ź/g,"z")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function todayPL() {
  const d = new Date();
  return d.toLocaleDateString("pl-PL", { year:"numeric", month:"short", day:"2-digit" });
}

async function generateWithGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Brak GROQ_API_KEY w secrets");

  // Minimalny request — dopasuj model/prompt pod siebie:
  const prompt = `Napisz wpis na bloga (PL) o AI: tytuł + 2-4 sekcje + podsumowanie. Dodaj krótki lead i excerpt. Zwróć JSON: {title, topic, excerpt, html}.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Groq error: ${res.status} ${t}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return JSON.parse(content);
}

function renderPostPage({ title, topic, html, date }) {
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} • AI Blog</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="../index.html">AI Blog</a>
    </div>
  </header>
  <main class="container">
    <article class="hero">
      <div class="meta">
        <span class="tag">${esc(topic ?? "AI")}</span>
        <time>${esc(date)}</time>
      </div>
      <h1>${esc(title)}</h1>
    </article>
    <section class="card">
      ${html ?? "<p>Brak treści</p>"}
    </section>
  </main>
</body>
</html>`;
}

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
}

function writeIndex(list) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), "utf8");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const post = await generateWithGroq();
  const date = todayPL();
  const id = crypto.randomBytes(6).toString("hex");
  const slug = slugify(post.title || `post-${id}`);
  const filename = `${slug}.html`;
  const url = `./posts/${filename}`;

  const page = renderPostPage({ title: post.title, topic: post.topic, html: post.html, date });
  fs.writeFileSync(path.join(OUT_DIR, filename), page, "utf8");

  const index = readIndex();
  index.unshift({
    id, title: post.title, topic: post.topic, excerpt: post.excerpt, date, url
  });

  // opcjonalnie: limit np. 200 postów
  writeIndex(index.slice(0, 200));

  console.log("Generated:", url);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
