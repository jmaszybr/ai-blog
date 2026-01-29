# 🤖 AUTONOMICZNY BLOG AI

**AI Insights** to eksperymentalny projekt autonomicznego bloga, w którym sztuczna inteligencja samodzielnie generuje, ilustruje i publikuje artykuły na temat rozwoju AI.

Cały proces — od wyboru tematu, przez napisanie tekstu, wygenerowanie grafiki, aż po publikację — odbywa się **BEZ ingerencji człowieka**.

> ⚠️ **UWAGA**: Projekt ma charakter badawczo-eksperymentalny. Treści nie są weryfikowane przez ekspertów i mogą zawierać nieścisłości.

---

## ✨ Funkcjonalności

- Losowanie tematów z przygotowanej puli
- Generowanie artykułów (800–1200 słów) przez model językowy
- Automatyczne generowanie ilustracji (Text-to-Image)
- Tworzenie statycznych stron HTML
- Aktualizacja indeksu wpisów (`posts_index.json`)
- Automatyczne uruchamianie raz dziennie (scheduler)
- Publikacja jako statyczny blog

---

## 🏗️ Architektura Systemu
```
GitHub Actions (cron / manual)
            ↓
    Node.js (generate_post.js)
            ↓
    AI (tekst) + AI (grafika)
            ↓
  Statyczne pliki HTML / JSON
            ↓
   Publikacja (GitHub Pages)
```

### System **nie używa**:
- Bazy danych
- Backendu
- Serwera aplikacyjnego

---

## 📁 Struktura Projektu
```
/
├── index.html              # Strona główna
├── style.css               # Style globalne
├── script.js               # Renderowanie kafelków wpisów
├── posts_index.json        # Indeks postów
├── topics.json             # Pula tematów
│
├── scripts/
│   └── generate_post.js    # Główny silnik AI
│
└── posts/
    ├── images/             # Obrazy generowane przez AI
    └── *.html              # Wygenerowane wpisy
```

---

## 🔒 Bezpieczeństwo

- Klucze API **NIE** są przechowywane w repozytorium
- Używane są zmienne środowiskowe / secrets
- Frontend jest w pełni statyczny
- Brak backendu = niska powierzchnia ataku

> Projekt jest traktowany jako sandbox / eksperyment, a nie system produkcyjny.

---

## ⚙️ Automatyzacja

- Codzienne uruchamianie przez scheduler
- Możliwość ręcznego uruchomienia
- Automatyczny commit wygenerowanych plików
- Pełna historia zmian

---

## 🧪 Status Projektu

**STATUS: EKSPERYMENT / PROOF OF CONCEPT**

### Celem projektu jest:
- Testowanie autonomicznych pipeline'ów AI
- Analiza jakości generowanego contentu
- Eksploracja idei samopublikujących się systemów AI

### Projekt **nie jest**:
- Produktem komercyjnym
- Systemem krytycznym
- Narzędziem doradczym

---

## 📄 Licencja

MIT

---

## 👤 Autor

Projekt eksperymentalny rozwijany jako badanie nad autonomicznymi systemami generatywnymi i publikacyjnymi opartymi o sztuczną inteligencję.
