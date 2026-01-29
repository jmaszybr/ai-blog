import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// KONFIGURACJA
const OUT_DIR = "posts";
const INDEX_FILE = "posts_index.json";

// --- NARZĘDZIA POMOCNICZE ---

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e").replace(/ł/g,"l")
    .replace(/ń/g,"n").replace(/ó/g,"o").replace(/ś/g,"s").replace(/ż/g,"z").replace(/ź/g,"z")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0, 80);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function todayPL() {
  const d = new Date();
  const months = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
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

// --- GENEROWANIE TREŚCI PRZEZ AI ---

async function generateWithGroq(existingTitles = []) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Brak klucza API. Ustaw zmienną środowiskową GROQ_API_KEY.");

  // Używamy sprawdzonego modelu Llama 3.3 (lub gpt-oss-120b jeśli masz dostęp)
  const MODEL_ID = "llama-3.3-70b-versatile"; 

const prompt = `
Jesteś redaktorem naczelnym magazynu typu "Wired" lub "Scientific American". 
Twoim zadaniem jest napisać ROZBUDOWANY artykuł popularnonaukowy (celuj w 1500 słów).

TEMAT: [Wybierz ambitny temat z dziedziny AI na rok 2026]
KONTEKST (NIE POWTARZAJ): ${existingTitles.join(", ")}

STRUKTURA ARTYKUŁU (MUSISZ WYPEŁNIĆ KAŻDY PUNKT SZCZEGÓŁOWO):
1. TYTUŁ: Intrygujący i mądry.
2. LEAD: Mocny wstęp (minimum 150 słów).
3. ABSTRACT: Krótkie, techniczne streszczenie w ramce.
4. ROZDZIAŁ 1 - GENEZA: Historia i tło problemu (minimum 250 słów).
5. ROZDZIAŁ 2 - MECHANIZM: Jak to dokładnie działa? Użyj przynajmniej dwóch rozbudowanych metafor (minimum 350 słów).
6. ROZDZIAŁ 3 - WPŁYW SPOŁECZNY: Jak to zmieni życie zwykłego człowieka? (minimum 250 słów).
7. ROZDZIAŁ 4 - ETYKA I RYZYKA: Czego naukowcy się obawiają? (minimum 200 słów).
8. SIDEPAR: <aside> z technicznymi detalami dla ciekawskich.
9. BIBLIOGRAFIA: Wymyśl 3 realistyczne źródła naukowe.

ZASADY:
- Zakaz używania zwrotów: "Podsumowując", "W dzisiejszym świecie", "Warto zauważyć".
- Styl: Gęsty od faktów, barwny, ekspercki.
- HTML: Używaj <h1>, <h2>, <h3>, <ul>, <li>, <blockquote>, <strong>, <aside>, <table>.

ZWRÓĆ WYŁĄCZNIE JSON:
{
  "title": "Tytuł",
  "topic": "Dziedzina",
  "excerpt": "Zajawka",
  "html": "Pełna, bardzo długa treść HTML (minimum 8000 znaków kodu)"
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
        { role: "system", content: "Jesteś ekspertem. Odpowiadasz TYLKO w formacie JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4000, // Zwiększony limit, by nie ucinało posta
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Błąd API Groq (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  let content = data.choices[0].message.content.trim();

  // Czyszczenie JSONa (na wypadek gdyby model dodał ```json ... ```)
  content = content.replace(/^```json/, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Błąd parsowania JSONa. Surowy tekst:", content);
    throw new Error("AI zwróciło nieprawidłowy format danych.");
  }
}

// --- SZABLON STRONY ARTYKUŁU ---

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
          <span class="date">${esc(date)}</span>
        </div>
        <h1>${esc(title)}</h1>
      </header>
      <section class="post-content">
        ${html}
      </section>
      <footer class="paper-footer">
        <p>Artykuł wygenerowany przez system autonomiczny.</p>
        <a href="../index.html" class="back-link">← Powrót do archiwum</a>
      </footer>
    </article>
  </main>
</body>
</html>`;
}

// --- GŁÓWNA FUNKCJA ---

async function main() {
  console.log("🚀 Start generatora...");
  
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = readIndex();
  const recentTitles = index.slice(0, 10).map(p => p.title);

  console.log("🧠 Generowanie treści przez AI...");
  const post = await generateWithGroq(recentTitles);
  
  const date = todayPL();
  const id = crypto.randomBytes(4).toString("hex");
  const slug = slugify(post.title || `post-${id}`);
  const filename = `${slug}.html`;
  
  // Ważne: URL do zapisu w index.json
  const url = `posts/${filename}`;

  const pageHtml = renderPostPage({ 
    title: post.title, 
    topic: post.topic, 
    html: post.html, 
    date 
  });
  
  fs.writeFileSync(path.join(OUT_DIR, filename), pageHtml, "utf8");

  // Dodajemy na początek listy
  index.unshift({
    id, title: post.title, topic: post.topic, excerpt: post.excerpt, date, url
  });

  // Zapisujemy maks 100 wpisów
  writeIndex(index.slice(0, 100));
  
  console.log(`✅ Gotowe! Wygenerowano: "${post.title}"`);
}

main().catch(err => {
  console.error("❌ WYSTĄPIŁ BŁĄD:", err.message);
  process.exit(1);
});
