/**
 * Blog Engine v2.0
 * Obsługuje pobieranie wpisów i renderowanie kart.
 */

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
    if (posts.length === 0) {
        container.innerHTML = `<div class="loading-shimmer">Oczekiwanie na pierwsze wpisy...</div>`;
        return;
    }

    container.innerHTML = posts.map(post => `
        <article class="card" onclick="window.location.href='${post.url}'">
            <div class="meta">
                <span class="tag">${post.topic || 'AI'}</span>
                <span class="date">${post.date}</span>
            </div>
            <h2>${post.title}</h2>
            <p>${post.excerpt}</p>
            <div class="readmore">Czytaj więcej →</div>
        </article>
    `).join("");
}

function getMockData() {
    return [
        {
            title: "Przyszłość agentów AI w 2026",
            topic: "Technologia",
            date: "2026-01-29",
            excerpt: "Analiza autonomicznych systemów decyzyjnych i ich roli w nowoczesnym przemyśle.",
            url: "#"
        },
        {
            title: "Interfejsy mózg-komputer",
            topic: "Nauka",
            date: "2026-01-28",
            excerpt: "Jak Neuralink i konkurencyjne rozwiązania zmieniają definicję interakcji z oprogramowaniem.",
            url: "#"
        }
    ];
}

// Uruchomienie przy załadowaniu strony
document.addEventListener('DOMContentLoaded', initBlog);
