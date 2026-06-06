/**
 * Blog Engine v3.0
 * Strona główna: featured post, wyszukiwarka live, filtry kategorii, statystyki.
 */

let allPosts = [];
let activeFilter = 'Wszystkie';
let searchQuery = '';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// ===== INIT =====
async function initBlog() {
  const postsContainer   = document.getElementById('posts');
  const filtersContainer = document.getElementById('topic-filters');
  const searchInput      = document.getElementById('search-input');

  try {
    const response = await fetch('./posts_index.json', { cache: 'no-store' });
    allPosts = response.ok ? await response.json() : getMockData();

    renderStats(allPosts);
    renderFeatured(allPosts);
    renderFilters(allPosts, filtersContainer);
    renderPosts(getFilteredPosts(), postsContainer);

    // Live search
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        activeFilter = 'Wszystkie';
        document.querySelectorAll('.filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.topic === 'Wszystkie');
        });
        renderPosts(getFilteredPosts(), postsContainer);
      });
    }

  } catch (error) {
    console.error('Błąd krytyczny:', error);
    postsContainer.innerHTML = '<div class="loading-shimmer">Nie udało się połączyć z bazą danych.</div>';
  }
}

// ===== STATS =====
function renderStats(posts) {
  const statCount  = document.getElementById('stat-count');
  const statTopics = document.getElementById('stat-topics');
  const statDate   = document.getElementById('stat-date');

  if (statCount)  statCount.textContent  = posts.length;

  if (statTopics) {
    const topics = new Set();
    posts.forEach(p => {
      if (p.topic) p.topic.split(',').forEach(t => { const s = t.trim(); if (s) topics.add(s); });
    });
    statTopics.textContent = topics.size;
  }

  if (statDate && posts.length > 0) {
    // Use the date of the most recent (first) post
    const raw = posts[0].date || '';
    // Show short version: day month
    const parts = raw.split(' ');
    statDate.textContent = parts.slice(0, 2).join(' ') || raw;
  }
}

// ===== FEATURED POST =====
function renderFeatured(posts) {
  const container = document.getElementById('featured-post');
  if (!container || posts.length === 0) return;

  const p = posts[0];
  const thumb = p.imageUrl
    ? `<div class="featured-thumb"><img src="${escHtml(p.imageUrl)}" alt="${escHtml(p.title)}" loading="lazy"></div>`
    : `<div class="featured-thumb" style="background:var(--panel);display:flex;align-items:center;justify-content:center;"><span style="font-size:4rem;opacity:.3;">🧠</span></div>`;

  container.innerHTML = `
    <a class="featured-card" href="${escHtml(p.url || '#')}">
      ${thumb}
      <div class="featured-body">
        <div class="featured-eyebrow">
          <span class="dot"></span>
          ${escHtml((p.topic || 'AI').split(',')[0].trim())}
          &nbsp;·&nbsp; ${escHtml(p.date || '')}
        </div>
        <h2>${escHtml(p.title)}</h2>
        <p>${escHtml(p.excerpt || '')}</p>
        <div class="featured-meta">
          <span class="readmore" style="font-size:0.9rem;">Czytaj artykuł →</span>
        </div>
      </div>
    </a>
  `;
}

// ===== FILTERS =====
function renderFilters(posts, filtersContainer) {
  if (!filtersContainer) return;

  const topics = new Set(['Wszystkie']);
  posts.forEach(p => {
    if (p.topic) p.topic.split(',').forEach(t => { const s = t.trim(); if (s) topics.add(s); });
  });

  filtersContainer.innerHTML = [...topics].map((topic) => {
    const isActive = topic === activeFilter;
    return `<button class="filter-btn${isActive ? ' active' : ''}" data-topic="${escHtml(topic)}">${escHtml(topic)}</button>`;
  }).join('');

  filtersContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    activeFilter = btn.dataset.topic;
    // Clear search when switching filter
    const si = document.getElementById('search-input');
    if (si) { si.value = ''; searchQuery = ''; }

    renderPosts(getFilteredPosts(), document.getElementById('posts'));
  });
}

// ===== FILTERING LOGIC =====
function getFilteredPosts() {
  // Exclude the first post (shown as featured)
  const rest = allPosts.slice(1);

  return rest.filter(post => {
    // Topic filter
    const topicMatch = activeFilter === 'Wszystkie' || (
      post.topic &&
      post.topic.split(',').map(t => t.trim().toLowerCase()).includes(activeFilter.toLowerCase())
    );

    // Search filter
    const q = searchQuery;
    const searchMatch = !q || (
      (post.title   && post.title.toLowerCase().includes(q)) ||
      (post.excerpt && post.excerpt.toLowerCase().includes(q)) ||
      (post.topic   && post.topic.toLowerCase().includes(q))
    );

    return topicMatch && searchMatch;
  });
}

// ===== RENDER POSTS =====
function renderPosts(posts, container) {
  if (!container) return;

  if (!Array.isArray(posts) || posts.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        <h3>Brak wyników</h3>
        <p>Spróbuj zmienić filtr lub frazę wyszukiwania.</p>
      </div>`;
    return;
  }

  container.innerHTML = posts.map(post => {
    const thumb = post.imageUrl
      ? `<div class="card-thumb"><img src="${escHtml(post.imageUrl)}" alt="${escHtml(post.title)}" loading="lazy"></div>`
      : '';

    return `
      <a class="card" href="${escHtml(post.url || '#')}">
        ${thumb}
        <div class="card-body">
          <div class="meta">
            <span class="tag">${escHtml((post.topic || 'AI').split(',')[0].trim())}</span>
            <span class="date">${escHtml(post.date || '')}</span>
          </div>
          <h2>${escHtml(post.title)}</h2>
          <p>${escHtml(post.excerpt || '')}</p>
          <div class="readmore">Czytaj więcej →</div>
        </div>
      </a>`;
  }).join('');
}

// ===== MOCK DATA =====
function getMockData() {
  return [
    {
      title: 'Przyszłość agentów AI w 2026',
      topic: 'Technologia',
      date: '29 stycznia 2026',
      excerpt: 'Analiza autonomicznych systemów decyzyjnych i ich roli w nowoczesnym przemyśle.',
      url: '#',
      imageUrl: ''
    },
    {
      title: 'Interfejsy mózg-komputer',
      topic: 'Nauka',
      date: '28 stycznia 2026',
      excerpt: 'Jak rozwiązania BCI zmieniają definicję interakcji z oprogramowaniem.',
      url: '#',
      imageUrl: ''
    }
  ];
}

document.addEventListener('DOMContentLoaded', initBlog);
