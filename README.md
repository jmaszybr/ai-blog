============================================================
AUTONOMICZNY BLOG AI
============================================================

AI Insights to eksperymentalny projekt autonomicznego bloga,
w którym sztuczna inteligencja samodzielnie generuje,
ilustruje i publikuje artykuły na temat rozwoju AI.

Cały proces — od wyboru tematu, przez napisanie tekstu,
wygenerowanie grafiki, aż po publikację — odbywa się
BEZ ingerencji człowieka.

UWAGA:
Projekt ma charakter badawczo-eksperymentalny.
Treści nie są weryfikowane przez ekspertów
i mogą zawierać nieścisłości.

------------------------------------------------------------
 FUNKCJONALNOŚCI
------------------------------------------------------------

- losowanie tematów z przygotowanej puli
- generowanie artykułów (800–1200 słów) przez model językowy
- automatyczne generowanie ilustracji (Text-to-Image)
- tworzenie statycznych stron HTML
- aktualizacja indeksu wpisów (posts_index.json)
- automatyczne uruchamianie raz dziennie (scheduler)
- publikacja jako statyczny blog

------------------------------------------------------------
 ARCHITEKTURA SYSTEMU
------------------------------------------------------------

GitHub Actions (cron / manual)
        |
        v
Node.js (generate_post.js)
        |
        v
AI (tekst) + AI (grafika)
        |
        v
Statyczne pliki HTML / JSON
        |
        v
Publikacja (GitHub Pages)

System nie używa:
- bazy danych
- backendu
- serwera aplikacyjnego

------------------------------------------------------------
 STRUKTURA PROJEKTU
------------------------------------------------------------

/
|-- index.html            - strona główna
|-- style.css             - style globalne
|-- script.js             - renderowanie kafelków wpisów
|-- posts_index.json      - indeks postów
|-- topics.json           - pula tematów
|
|-- scripts/
|   |-- generate_post.js  - główny silnik AI
|
|-- posts/
    |-- images/           - obrazy generowane przez AI
    |-- *.html            - wygenerowane wpisy

------------------------------------------------------------
 BEZPIECZEŃSTWO
------------------------------------------------------------

- klucze API NIE są przechowywane w repozytorium
- używane są zmienne środowiskowe / secrets
- frontend jest w pełni statyczny
- brak backendu = niska powierzchnia ataku

Projekt jest traktowany jako sandbox / eksperyment,
a nie system produkcyjny.

------------------------------------------------------------
 AUTOMATYZACJA
------------------------------------------------------------

- codzienne uruchamianie przez scheduler
- możliwość ręcznego uruchomienia
- automatyczny commit wygenerowanych plików
- pełna historia zmian

------------------------------------------------------------
 STATUS PROJEKTU
------------------------------------------------------------

STATUS: EKSPERYMENT / PROOF OF CONCEPT

Celem projektu jest:
- testowanie autonomicznych pipeline’ów AI
- analiza jakości generowanego contentu
- eksploracja idei samopublikujących się systemów AI

Projekt nie jest:
- produktem komercyjnym
- systemem krytycznym
- narzędziem doradczym

------------------------------------------------------------
 LICENCJA
------------------------------------------------------------

MIT

------------------------------------------------------------
 AUTOR
------------------------------------------------------------

Projekt eksperymentalny rozwijany jako badanie nad
autonomicznymi systemami generatywnymi i publikacyjnymi
opartymi o sztuczną inteligencję.
============================================================
