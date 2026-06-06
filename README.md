# 🤖 Autonomiczny Blog AI

Eksperymentalny projekt bloga, w którym sztuczna inteligencja samodzielnie generuje i publikuje artykuły popularnonaukowe na temat AI i nowych technologii.

Cały proces — od wyboru tematu, przez napisanie tekstu, wygenerowanie grafiki, aż po publikację — odbywa się **bez ingerencji człowieka**.

> ⚠️ **Uwaga**: Projekt ma charakter eksperymentalny. Treści generowane są automatycznie i nie są weryfikowane przez ekspertów.

---

## ✨ Funkcjonalności

- Losowanie tematów z przygotowanej puli
- Generowanie artykułów przez model Gemini (Google AI)
- Generowanie ilustracji artykułów
- Panel administracyjny do przeglądania i publikowania szkiców
- Statyczna architektura — brak backendu i bazy danych
- Automatyczne uruchamianie przez harmonogram (GitHub Actions)

---

## 🏗️ Architektura

```
GitHub Actions (cron / manual)
            ↓
    Node.js — generator treści (Gemini API)
            ↓
    Szkic trafia do panelu admina
            ↓
    Po zatwierdzeniu → publikacja jako JSON
            ↓
    Statyczny frontend renderuje artykuły
            ↓
    GitHub Pages (hosting)
```

### System **nie używa**:
- Bazy danych
- Serwera aplikacyjnego
- Frameworka frontendowego

---

## 📁 Struktura projektu

```
/
├── index.html              # Strona główna (lista artykułów)
├── post.html               # Szablon podstrony artykułu
├── style.css               # Style globalne
├── script.js               # Logika renderowania strony głównej
├── posts_index.json        # Indeks wszystkich opublikowanych wpisów
├── topics.json             # Pula tematów do generowania
│
├── admin/                  # Panel administracyjny
│
├── scripts/
│   ├── generate_post.js    # Główny silnik generowania treści (AI)
│   └── config.json         # Konfiguracja bloga
│
└── posts/
    ├── data/               # Opublikowane artykuły (JSON)
    ├── drafts/             # Szkice oczekujące na zatwierdzenie
    └── images/             # Ilustracje artykułów
```

---

## ⚙️ Wymagania

- Node.js 18+
- Klucz API: `GEMINI_API_KEY`

---

## 🚀 Uruchomienie generatora

```bash
npm install
node scripts/generate_post.js --draft
```

Szkic artykułu pojawi się w panelu admina (`/admin/`), skąd można go przejrzeć i opublikować.

---

## 🔒 Bezpieczeństwo

- Klucze API przechowywane wyłącznie jako zmienne środowiskowe / GitHub Secrets
- Frontend w pełni statyczny
- Brak backendu = minimalna powierzchnia ataku

---

## 🧪 Status projektu

**Eksperyment / Proof of Concept**

Celem projektu jest testowanie autonomicznych pipeline'ów generatywnych AI oraz analiza jakości automatycznie tworzonego contentu.

---

## 📄 Licencja

MIT

---

## 👤 Autor

[joamas.pl](https://joamas.pl)
