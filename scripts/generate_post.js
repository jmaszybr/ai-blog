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

  const prompt = `
Osobliwość: Jesteś światowej klasy popularyzatorem nauki (połączenie stylu Carla Sagana i Richarda Feynmana). 
Twój cel: Napisać fascynujący, głęboki, a jednocześnie prosty artykuł o AI dla kogoś, kto boi się technologii.

KONTEKST (NIE POWTARZAJ TYCH TYTUŁÓW):
${existingTitles.join(", ")}

ZADANIE:
1. WYBIERZ TEMAT: Wybierz jeden konkretny, przełomowy aspekt AI z 2026 roku (np. "Emocjonalna inteligencja maszyn", "Cyfrowe sny sieci neuronowych", "Dlaczego AI nie 'myśli' tak jak my").
2. EKSPERYMENT MYŚLOWY: Artykuł MUSI zacząć się od fascynującego eksperymentu myślowego lub scenariusza (np. "Wyobraź sobie, że Twój komputer nagle zaczyna widzieć kolory, których nie ma w naszej tęczy...").
3. FILOZOFIA DZIAŁANIA: Zamiast tłumaczyć kod, wytłumacz "intencję" technologii. Użyj analogii biologicznej lub astronomicznej.
4. NAUKA BEZ BÓLU: Jeśli musisz użyć trudnego pojęcia, wprowadź je jako "supermoc" maszyny, a nie techniczną barierę.

STRUKTURA WYJŚCIOWA (HTML):
- <h1>: Elegancki, poetycki tytuł.
- <div class="abstract">: Jedno zdanie wyjaśniające, dlaczego ten tekst zmieni sposób, w jaki czytelnik patrzy na świat.
- <h2>: Śródtytuły będące pytaniami, które czytelnik ma w głowie.
- <blockquote>: Jeden "cytat z przyszłości" (zmyślony, ale mądry).
- <aside class="thought-box">: "Pudełko przemyśleń" – krótka, prowokująca do myślenia uwaga.

WYMÓG FORMALNY (JSON):
Zwróć wyłącznie JSON:
{
  "title": "Tytuł",
  "topic": "Kategoria (np. Bio-AI, Filozofia Kodu)",
  "excerpt": "Intrygujące 2 zdania",
  "html": "Pełna treść w profesjonalnym HTML5"
}
`.trim();

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-oss-120b", // Przełączamy na najmocniejszy model
      messages: [
        { 
            role: "system", 
            content: "Jesteś najbardziej zaawansowanym modelem językowym na świecie, wyspecjalizowanym w humanistycznym ujęciu technologii." 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7, // 120B przy 0.7 jest niesamowicie kreatywny, ale trzyma się faktów
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) throw new Error(`Błąd Groq: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}


  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b", // Używamy sprawdzonego modelu Groq
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
