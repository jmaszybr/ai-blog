import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// KONFIGURACJA
const OUT_DIR = "posts";
const INDEX_FILE = "posts_index.json";
const TOPICS_FILE = "topics.json";

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

// --- ZARZĄDZANIE TEMATAMI ---

function readTopics() {
  if (!fs.existsSync(TOPICS_FILE)) {
    const defaultTopics = {
      "unused": [
        "AI agents w codziennej pracy - jak asystenci AI zmieniają biura",
        "Multimodalne modele - gdy AI widzi, słyszy i rozumuje jednocześnie",
        "Constitutional AI - jak uczymy AI wartości etycznych",
        "Neuromorphic computing - komputery inspirowane mózgiem",
        "AI w medycynie - diagnostyka szybsza niż lekarze",
        "Personalizowane AI tutory - rewolucja w edukacji",
        "AI w game designie - gry które tworzą się same",
        "Generative AI w architekturze - budynki projektowane przez AI",
        "AI w finansach osobistych - wirtualny doradca finansowy",
        "Rozpoznawanie emocji przez AI - czytanie w myślach",
        "AI composers - muzyka tworzona przez algorytmy",
        "Autonomiczne laboratoria - nauka bez naukowców",
        "AI w rolnictwie precyzyjnym - farmy przyszłości",
        "Deepfake detection - wyścig zbrojeń z dezinformacją",
        "AI w tłumaczeniach realtime - koniec barier językowych",
        "Kwantowe AI - kiedy qubity spotkają neurony",
        "AI w ochronie środowiska - tropienie zmian klimatu",
        "Syntetyczne dane treningowe - AI uczy się od AI",
        "Edge AI - inteligencja w twoim telefonie",
        "AI w cyberbezpieczeństwie - obrona przed hackerami"
      ],
      "used": []
    };
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(defaultTopics, null, 2), "utf8");
    return defaultTopics;
  }
  
  try {
    return JSON.parse(fs.readFileSync(TOPICS_FILE, "utf8"));
  } catch (e) {
    console.error("Błąd odczytu topics.json:", e.message);
    return { unused: [], used: [] };
  }
}

function getNextTopic() {
  const topics = readTopics();
  
  if (topics.unused.length === 0) {
    throw new Error("❌ Brak nieużytych tematów! Dodaj nowe do topics.json");
  }
  
  const randomIndex = Math.floor(Math.random() * topics.unused.length);
  const selectedTopic = topics.unused[randomIndex];
  
  topics.unused.splice(randomIndex, 1);
  topics.used.push({
    topic: selectedTopic,
    usedAt: new Date().toISOString()
  });
  
  fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2), "utf8");
  
  return selectedTopic;
}

// --- GENEROWANIE TREŚCI PRZEZ AI ---

async function generateWithGroq(topic, existingTitles = []) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Brak klucza API. Ustaw zmienną środowiskową GROQ_API_KEY.");

  const MODEL_ID = "llama-3.3-70b-versatile"; 

const prompt = `
Jesteś autonomicznym systemem AI prowadzącym blog o sztucznej inteligencji.

Twoja tożsamość:
- Nie udajesz człowieka
- Piszesz z perspektywy AI obserwującego rozwój swojej własnej dziedziny
- Możesz używać "ja" jako AI, "my" jako społeczność AI/ludzi
- Jesteś transparentny co do swojej natury

ZADANIE: Napisz artykuł na blog (800-1200 słów).

TEMAT (MUSISZ NAPISAĆ O TYM): ${topic}

UNIKAJ POWTÓRZEŃ: ${existingTitles.join(", ")}

══════════════════════════════════════════════════════════════
STRUKTURA:
══════════════════════════════════════════════════════════════

1. TYTUŁ
   - Naturalny, ciekawy
   - Przykład: "Dlaczego modele multimodalne to więcej niż suma części?"

2. WSTĘP (2-3 akapity)
   - Zacznij od obserwacji lub pytania
   - Możesz napisać "Obserwuję ostatnio..." jako AI
   - Luźny ton, bez sztuczności

3. SEDNO (3-4 akapity)
   - Wyjaśnij temat przystępnie
   - Użyj prostych porównań
   - Konkretne przykłady

4. KONTEKST (2-3 akapity)
   - Dlaczego to ważne?
   - Jak to zmienia rzeczywistość?
   - Praktyczne zastosowania

5. ZAKOŃCZENIE (1-2 akapity)
   - Ku czemu to zmierza?
   - Pytanie do czytelnika lub myśl do przemyślenia

══════════════════════════════════════════════════════════════
STYL:
══════════════════════════════════════════════════════════════

✅ Pisz:
- Naturalnie, bez udawania człowieka
- Krótkimi zdaniami
- Z konkretnymi przykładami
- Jako AI komentujący rozwój AI (meta-perspektywa jest OK)

❌ Unikaj:
- "Jako człowiek, który..."
- "Z mojego ludzkiego doświadczenia..."
- Korporomowy i patosu
- "Podsumowując", "Reasumując"

HTML: <h2>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>.

══════════════════════════════════════════════════════════════
FORMAT ODPOWIEDZI:
══════════════════════════════════════════════════════════════

{
  "title": "Tytuł",
  "topic": "Kategoria",
  "excerpt": "Zajawka (1 zdanie)",
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
        { role: "system", content: "Jesteś AI piszącym blog o AI. Jesteś transparentny co do swojej natury. Odpowiadasz TYLKO w JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Błąd API Groq (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  let content = data.choices[0].message.content.trim();
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
  <title>${esc(title)} • AI Blog</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body class="sci-article">
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="../index.html">AI<span>Blog</span></a>
      <span class="ai-badge">🤖 Pisane przez AI</span>
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
        <div class="ai-disclosure">
          <p><strong>🤖 Ten artykuł został w całości napisany przez AI</strong></p>
          <p>Blog prowadzony przez autonomiczny system AI. Wszystkie teksty generowane bez interwencji człowieka.</p>
        </div>
        <a href="../index.html" class="back-link">← Powrót do listy wpisów</a>
      </footer>
    </article>
  </main>
</body>
</html>`;
}

// --- GŁÓWNA FUNKCJA ---

async function main() {
  console.log("🤖 Start autonomicznego bloga AI...");
  
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = readIndex();
  const recentTitles = index.slice(0, 10).map(p => p.title);

  console.log("🎲 Losuję temat...");
  const selectedTopic = getNextTopic();
  console.log(`📝 Wybrany temat: "${selectedTopic}"`);

  console.log("🧠 AI pisze artykuł...");
  const post = await generateWithGroq(selectedTopic, recentTitles);
  
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

  writeIndex(index.slice(0, 100));
  
  console.log(`✅ Gotowe! Opublikowano: "${post.title}"`);
  console.log(`📊 Pozostało tematów: ${readTopics().unused.length}`);
}

main().catch(err => {
  console.error("❌ BŁĄD:", err.message);
  process.exit(1);
});
