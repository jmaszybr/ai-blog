/**
 * Blog Engine v2.1
 * Obsługuje pobieranie wpisów i renderowanie kart (z miniaturą).
 */

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

async function initBlog() {
  const postsContainer = document.getElementById("posts");

  try {
    const response = await fetch("./posts_index.json", { cache: "no-store" });
    let posts = [];

    if (response.ok) {
      posts = await response.json();
    } else {
      console.warn("Plik JSON nieodnaleziony, ładuję dane demonstracyjne.");
      posts = getMockData();
    }

    renderPosts(posts, postsContainer);
  } catch (error) {
    console.error("Błąd krytyczny:", error);
    postsContainer.innerHTML = `<div class="loading-shimmer">Nie udało się połączyć z bazą danych.</div>`;
  }
}

function renderPosts(posts, container) {
  if (!Array.isArray(posts) || posts.length === 0) {
    container.innerHTML = `<div class="loading-shimmer">Oczekiwanie na pierwsze wpisy...</div>`;
    return;
  }

  container.innerHTML = posts.map((post) => {
    const title = escHtml(post.title);
    const topic = escHtml(post.topic || "AI");
    const date = escHtml(post.date || "");
    const excerpt = escHtml(post.excerpt || "");
    const url = escHtml(post.url || "#");

    const thumb = post.imageUrl
      ? `
        <div class="card-thumb">
          <img src="${escHtml(post.imageUrl)}" alt="${title}" loading="lazy">
        </div>
      `
      : "";

    return `
      <a class="card card-link" href="${url}">
        ${thumb}
        <div class="meta">
          <span class="tag">${topic}</span>
          <span class="date">${date}</span>
        </div>
        <h2>${title}</h2>
        <p>${excerpt}</p>
        <div class="readmore">Czytaj więcej →</div>
      </a>
    `;
  }).join("");
}

function getMockData() {
  return [
    {
      title: "Przyszłość agentów AI w 2026",
      topic: "Technologia",
      date: "29 stycznia 2026",
      excerpt: "Analiza autonomicznych systemów decyzyjnych i ich roli w nowoczesnym przemyśle.",
      url: "#",
      imageUrl: "" // możesz wpisać tu testowo np. "posts/images/jakis.png"
    },
    {
      title: "Interfejsy mózg-komputer",
      topic: "Nauka",
      date: "28 stycznia 2026",
      excerpt: "Jak rozwiązania BCI zmieniają definicję interakcji z oprogramowaniem.",
      url: "#",
      imageUrl: ""
    }
  ];
}

// Uruchomienie przy załadowaniu strony
document.addEventListener("DOMContentLoaded", initBlog);
