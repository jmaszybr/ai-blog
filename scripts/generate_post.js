import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OUT_DIR = "posts";
const INDEX_FILE = "posts_index.json";

// --- NARZĘDZIA POMOCNICZE ---

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
  return d.toLocaleDateString("pl-PL", { year:"numeric", month:"long", day:"2-digit" });
}

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch (e) { return []; }
}

function writeIndex(list) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), "utf8");
}

// --- GENEROWANIE TREŚCI ---

async function generateWithGroq(existingTitles = []) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Brak GROQ_API_KEY w secrets");

  // Wybieramy model: gpt-oss-120b (jeśli dostępny) lub llama-3.3-70b-versatile
  const MODEL_ID = "llama-3.3-70b-versatile"; 

  const prompt = `
Jesteś wybitnym popularyzatorem nauki. Twoim zadaniem jest napisać głęboki, ale przystępny artykuł popularnonaukowy o AI dla osób nietechnicznych.

KONTEKST (NIE POWTARZAJ): ${existingTitles.join(", ")}

ZASADY:
1. STYL: Opowieść wizualna, dużo metafor, zero nudy. Unikaj żargonu.
2. EKSPERYMENT MYŚLOWY: Zacznij od scenariusza "Wyobraź sobie, że...".
3. ANALOGIA: Wyjaśnij mechanizm AI porównując go do czegoś codziennego (np. pieczenia chleba, pracy bibliotekarza).
4. STRUKTURA HTML:
   - <div class="abstract">: Jedno zdanie wyjaśniające wagę tematu.
   - <h2>: Śródtytuły będące intrygującymi tezami.
   - <blockquote>: Jeden mądry cytat fikcyjnego badacza.
   - <aside class="thought-box">: Ramka z pytaniem do czytelnika.
5. DŁUGOŚĆ: Napisz co najmniej 800 słów. Nie ucinaj wpisu!

ZWRÓĆ WYŁĄCZNIE CZYSTY JSON:
{
  "title": "Tytuł artykułu",
  "topic": "Dziedzina",
  "excerpt": "Zajawka budująca napięcie",
  "html": "Pełna treść artykułu w HTML"
}
`.trim();

  const res = await fetch("https://api.api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [
        { role: "system", content: "Jesteś ekspertem. Zawsze odpowiadasz kompletnym, poprawnym strukturalnie plikiem JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.75,
      max_tokens: 4000, // <--- KLUCZ DO BRAKU UCINANIA
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API Error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  let content = data.choices[0].message.content;

  // Czyszczenie JSONa z ewentualnych znaczników Markdown
  content = content.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("JSON Error. Raw content:", content);
    throw new Error("AI przerwało generowanie JSONa lub zwróciło błąd składni.");
  }
}

// --- SZABLON STRONY ---

function renderPostPage({ title, topic, html, date }) {
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} • Science Archive</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body class="sci-article">
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="../index.html">Science<span>Archive</span></a>
    </div>
  </header>
  <main class="container">
    <article class="scientific-paper">
      <header class="post-header">
        <div class="meta">
          <span class="tag">${esc(topic)}</span>
          <time>${esc(date)}</time>
        </div>
        <h1>${esc(title)}</h1>
      </header>
      <section class="post-content">
        ${html}
      </section>
      <footer class="paper-footer">
        <p><em>Artykuł wygenerowany przez system autonomiczny GPT-OSS 120B w ramach eksperymentu popularyzacji wiedzy.</em></p>
        <a href="../index.html" class="readmore">← Powrót do archiwum</a>
      </footer>
    </article>
  </main>
</body>
</html>`;
}

// --- GŁÓWNA LOGIKA ---

async function main() {
  console.log("🚀 Inicjalizacja generatora...");
  
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = readIndex();
  const recentTitles = index.slice(0, 15).map(p => p.title);

  console.log("🤖 Model myśli nad tematem...");
  const post = await generateWithGroq(recentTitles);
  
  const date = todayPL();
  const id = crypto.randomBytes(4).toString("hex");
  const slug = slugify(post.title || `post-${id}`);
  const filename = `${slug}.html`;
  const url = `posts/${filename}`;

  const pageHtml = renderPostPage({ 
    title: post.title, 
    topic: post.topic, 
    html: post.html, 
    date 
  });
  
  fs.writeFileSync(path.join(OUT_DIR, filename), pageHtml, "utf8");

  index.unshift({
    id, title: post.title, topic: post.topic, excerpt: post.excerpt, date, url
  });

  writeIndex(index.slice(0, 200));
  console.log(`✅ Artykuł gotowy: ${post.title}`);
}

main().catch(err => {
  console.error("❌ Błąd:", err.message);
  process.exit(1);
});
