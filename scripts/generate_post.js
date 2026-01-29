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

  // Losujemy "kąt" patrzenia, żeby każdy wpis był inny
  const angles = [
    "techniczne głębokie nurkowanie (deep dive)",
    "perspektywa etyczna i filozoficzna",
    "praktyczny poradnik dla biznesu",
    "analiza trendów na rok 2026",
    "studium przypadku (case study)",
    "kontrowersyjna opinia podważająca status quo"
  ];
  const selectedAngle = angles[Math.floor(Math.random() * angles.length)];

const prompt = `
Jesteś redaktorem naczelnym czołowego portalu tech. Piszesz dla czytelnika, który zna podstawy AI i szuka mięsa, a nie definicji.

TEMATY DO UNIKANIA (JUŻ BYŁY):
${existingTitles.join(", ")}

DZISIEJSZA MISJA:
Napisz artykuł na temat: [NOWATORSKIE AI 2026]
Perspektywa: ${selectedAngle}

ZASADY REDAKCYJNE:
1. ZAKAZ: "W dzisiejszym świecie", "Dynamiczny rozwój", "Warto zauważyć", "Podsumowując".
2. STYL: Agresywny, konkretny, pełen branżowego żargonu (ale wyjaśnionego kontekstem). 
3. STRUKTURA:
   - Mocny lead (zaczepka).
   - Śródtytuły, które są tezami, a nie pytaniami (np. zamiast "Co to jest?", napisz "Koniec ery prostych LLM").
   - Przynajmniej jedna sekcja <blockquote> (ważny cytat fikcyjnego eksperta).
   - Przynajmniej jedna tabela porównawcza lub lista <ul> z technicznymi parametrami.
   - Sekcja "Key Takeaways" na końcu w formie ramki (użyj <aside> lub <strong>).

WYMAGANIA TECHNICZNE (JSON):
Zwróć ZAWSZE czysty JSON:
{
  "title": "Tytuł, który wymusza kliknięcie, ale nie jest clickbaitem",
  "topic": "Kategoria",
  "excerpt": "Zajawka budująca napięcie",
  "html": "Pełna treść artykułu. Używaj: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <blockquote>. Jeśli to pasuje, dodaj <pre><code> dla przykładów technicznych."
}
`.trim();

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", // Używamy sprawdzonego modelu Groq
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8, // Wyższa temperatura = większa kreatywność
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(content);
}

// --- RENDERING ---

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
    <article>
      <header class="post-header">
        <div class="meta">
          <span class="tag">${esc(topic ?? "AI")}</span>
          <time>${esc(date)}</time>
        </div>
        <h1>${esc(title)}</h1>
      </header>
      <section class="post-content">
        ${html}
      </section>
    </article>
  </main>
</body>
</html>`;
}

// --- MAIN ---

async function main() {
  console.log("🚀 Rozpoczynam generowanie wpisu...");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Pobierz listę tytułów, żeby AI się nie powtarzało
  const index = readIndex();
  const recentTitles = index.slice(0, 15).map(p => p.title);

  // 2. Generuj treść
  const post = await generateWithGroq(recentTitles);
  
  const date = todayPL();
  const id = crypto.randomBytes(4).toString("hex");
  const slug = slugify(post.title || `post-${id}`);
  const filename = `${slug}.html`;
  const url = `./posts/${filename}`;

  // 3. Zapisz plik HTML
  const pageHtml = renderPostPage({ 
    title: post.title, 
    topic: post.topic, 
    html: post.html, 
    date 
  });
  
  fs.writeFileSync(path.join(OUT_DIR, filename), pageHtml, "utf8");

  // 4. Aktualizuj indeks
  index.unshift({
    id, 
    title: post.title, 
    topic: post.topic, 
    excerpt: post.excerpt, 
    date, 
    url
  });

  writeIndex(index.slice(0, 200));

  console.log(`✅ Gotowe! Wygenerowano: ${post.title}`);
  console.log(`🔗 Ścieżka: ${url}`);
}

main().catch(err => {
  console.error("❌ Błąd krytyczny:", err);
  process.exit(1);
});
