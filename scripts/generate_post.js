import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OUT_DIR = "posts";
const INDEX_FILE = "posts_index.json";

// --- UTILS ---

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

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

function writeIndex(list) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), "utf8");
}

// --- CORE GENERATION ---

async function generateWithGroq(existingTitles = []) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Brak GROQ_API_KEY w secrets");

  // Jeśli gpt-oss-120b zwraca błąd 404, użyj llama-3.3-70b-versatile (to pewniak na Groq)
  const MODEL_ID = "llama-3.3-70b-versatile"; 

  const prompt = `
Jesteś światowej klasy popularyzatorem nauki. Napisz fascynujący artykuł o AI dla osób nietechnicznych.
KONTEKST (NIE POWTARZAJ): ${existingTitles.join(", ")}

WYMAGANIA:
1. TEMAT: Wybierz nowatorski aspekt AI z 2026 roku.
2. EKSPERYMENT MYŚLOWY: Zacznij od scenariusza "Wyobraź sobie, że...".
3. STYL: Prosty, metaforyczny, głęboki.
4. STRUKTURA HTML: Użyj <h1>, <h2>, <div class="abstract">, <blockquote>, <aside class="thought-box">.

ZWRÓĆ WYŁĄCZNIE CZYSTY JSON:
{
  "title": "Tytuł",
  "topic": "Kategoria",
  "excerpt": "Zajawka",
  "html": "Treść HTML"
}
`.trim();

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [
        { role: "system", content: "Jesteś ekspertem humanistyki cyfrowej. Odpowiadasz tylko w formacie JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API Error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  let content = data.choices[0].message.content;

  // Czyścimy ewentualne śmieci z Markdownu (np. ```json ... ```)
  content = content.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Błąd parsowania treści od AI. Surowa treść:", content);
    throw new Error("AI nie zwróciło poprawnego formatu JSON.");
  }
}

// --- RENDERING ---

function renderPostPage({ title, topic, html, date }) {
  // Upewnij się, że link do CSS prowadzi do poprawnego miejsca (jeden poziom wyżej)
  return `<!doctype html>
<html lang="pl" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} • Archiwum Nauki</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body class="sci-article">
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="../index.html">AI<span>.</span>Insights</a>
    </div>
  </header>
  <main class="container">
    <article class="scientific-paper">
      <header class="post-header">
        <div class="meta">
          <span class="tag">${esc(topic ?? "Nauka")}</span>
          <time>${esc(date)}</time>
        </div>
        <h1>${esc(title)}</h1>
      </header>
      <section class="post-content">
        ${html}
      </section>
    </article>
  </main>
  <footer style="text-align:center; padding: 40px; color: #64748b; border-top: 1px solid #e2e8f0;">
    <a href="../index.html" style="color: inherit; text-decoration: none;">← Powrót do strony głównej</a>
  </footer>
</body>
</html>`;
}

// --- MAIN ---

async function main() {
  console.log("🚀 Start generowania...");
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = readIndex();
  const recentTitles = index.slice(0, 10).map(p => p.title);

  const post = await generateWithGroq(recentTitles);
  
  const date = todayPL();
  const id = crypto.randomBytes(4).toString("hex");
  const slug = slugify(post.title || `post-${id}`);
  const filename = `${slug}.html`;
  
  // URL musi być relatywny dla strony głównej
  const url = `posts/${filename}`;

  const pageHtml = renderPostPage({ 
    title: post.title, 
    topic: post.topic, 
    html: post.html, 
    date 
  });
  
  fs.writeFileSync(path.join(OUT_DIR, filename), pageHtml, "utf8");

  index.unshift({
    id, 
    title: post.title, 
    topic: post.topic, 
    excerpt: post.excerpt, 
    date, 
    url
  });

  writeIndex(index.slice(0, 100));
  console.log(`✅ Sukces: ${post.title}`);
}

main().catch(err => {
  console.error("❌ Fatal Error:", err.message);
  process.exit(1);
});
