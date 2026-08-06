# Piano di implementazione — frontend statico della piattaforma finanziaria

> Stato: **fase di analisi e pianificazione completata; implementazione non ancora avviata**.
>
> Questo documento deriva dall'analisi completa dei 23 screenshot desktop e dei due file presenti in `reference:/notes:`. Le barre del browser visibili nelle immagini non fanno parte dell'interfaccia da ricostruire.

## 1. Obiettivo e vincoli

Ricostruire da zero un frontend statico multipagina che riproduca con la massima precisione possibile la struttura, le proporzioni, la gerarchia visiva, i componenti e gli stati osservabili nei riferimenti, usando:

- Next.js con App Router;
- TypeScript in modalità strict;
- Tailwind CSS;
- componenti modulari e riutilizzabili;
- layout responsive desktop, tablet e mobile;
- dati mock realistici e centralizzati;
- Recharts come libreria principale per grafici area, linee, barre, compositi e torta;
- Lucide React per le icone di interfaccia, con wrapper condiviso per dimensioni e tratti coerenti;
- asset locali e sostituibili per marchio, strumento, avatar e immagini;
- nessuna chiamata alle API del sito originale, nessun backend e nessun dato live;
- nessun codice copiato da bundle o sorgenti originali;
- nessuna credenziale, chiave o password nel repository.

L'interfaccia sarà realmente costruita con HTML/CSS/React: gli screenshot non saranno usati come sfondi o come scorciatoia visiva.

## 2. Materiale analizzato

### Note lette integralmente

`reference:notes:functions.md` descrive:

- menu laterale espandibile/riducibile, con icone sempre visibili;
- ricerca che apre un pannello sovrapposto con titoli, ETF, criptovalute e indici;
- pagina strumento con ticker, prezzo, variazione, mercato e intervalli `1D`, `5D`, `1M`, `6M`, `YTD`, `1Y`, `5Y`, `MAX`;
- calendario con stato giornaliero `BUY`, `HOLD` o `SELL`;
- stagionalità separata per `1`, `5`, `10`, `15` e `20` anni.

`reference:notes:pages.md` richiede:

1. Login
2. Registrazione
3. Dashboard
4. Ricerca strumenti
5. Pagina titolo
6. Grafico del titolo
7. Stagionalità
8. Dati finanziari
9. Calendario operativo
10. Watchlist
11. Portafoglio
12. Impostazioni
13. Errore 404
14. Versione mobile

### Copertura degli screenshot

Tutti gli screenshot hanno dimensione fisica `2904 × 1622 px` e appaiono acquisiti a densità Retina 2×. La viewport CSS di riferimento è quindi circa `1452 × 773 px`, esclusa la barra del browser. Questa misura sarà il riferimento primario per la verifica desktop.

| Screenshot | Pagina/stato corrispondente | Contenuto rilevante |
|---|---|---|
| 15.31.59 | Strumento / Overview, inizio pagina | header globale, due banner, intestazione strumento, chip, tab, avviso utili, controlli e prima parte del grafico principale |
| 15.32.09 | Strumento / Overview, sezione intermedia | fine grafico storico, card performance, drawdown |
| 15.32.13 | Strumento / Overview, sezione inferiore | performance annuale, dividendi, introduzione transazioni insider |
| 15.32.17 | Strumento / Overview, tabella insider | intestazione e righe 1–16 della tabella |
| 15.32.21 | Strumento / Overview, fine pagina | righe finali insider e footer |
| 15.32.26 | Overview + ricerca aperta | pannello risultati ancorato alla search bar, categorie/badge |
| 15.32.30 | Overview + launcher aperto | pannello strumenti a griglia 3 colonne |
| 15.32.39 | Strumento / Seasonality | tab attivo, controlli, CTA didattiche, grafico a tre serie |
| 15.32.46 | Strumento / Pattern | controlli pattern, proiezione, probabilità, robustezza, forza e caso correlato |
| 15.32.53 | Strumento / Overbought–Oversold, inizio | gauge, tre indicatori, Market Mood Meter |
| 15.32.55 | Overbought–Oversold, sezione Advanced DPO | controlli range/visualizzazione, grafico prezzo colorato e volumi |
| 15.32.58 | Overbought–Oversold, sezione inferiore | tab indicatori, oscillatore, soglie e footer |
| 15.33.05 | Strumento / Pattern, tabella casi | gruppi Bullish/Bearish, riga selezionata, performance/max drop/max rise |
| 15.33.13 | Strumento / Fundamentals / Analysis, inizio | riepilogo dati, sotto-tab, Financial Highlights e due grafici a barre |
| 15.33.17 | Fundamentals / Analysis, sezione media | Fair Value, Solidity, tooltip grafico e score card |
| 15.33.20 | Fundamentals / Analysis, Value Generation | azioni in circolazione, metriche per azione e card di giudizio |
| 15.33.22 | Fundamentals / Analysis, fine pagina | ricavi per prodotto a barre e torta, footer |
| 15.33.31 | Strumento / Political, inizio | grafico prezzo + volumi buy/sell, filtri |
| 15.33.36 | Political, tabella inizio | header e prime dieci transazioni politiche |
| 15.33.45 | Political, tabella intermedia | righe 7–18, badge partito, importo e tipo |
| 15.33.49 | Political, tabella intermedia | righe 17–27 |
| 15.33.53 | Political, tabella inferiore | righe 28–38 |
| 15.34.09 | Strumento / News | recap AI, carousel e griglia di card notizie |

## 3. Inventario completo delle pagine

### 3.1 Pagine con riferimento visivo diretto o evidenza nella navigazione

1. **Dettaglio strumento / Overview** — `/instrument/[market]/[symbol]/overview`
   - shell completa dello strumento;
   - grafico prezzo/metriche;
   - performance per periodo;
   - drawdown;
   - performance annuale;
   - dividendi;
   - transazioni insider.
2. **Stagionalità** — `/instrument/[market]/[symbol]/seasonality`
   - confronto anno corrente, media storica/periodo e anno analogo;
   - varianti `1`, `5`, `10`, `15`, `20` anni previste dalle note;
   - controlli grafico/calendario/download e navigazione periodo.
3. **Pattern** — `/instrument/[market]/[symbol]/pattern`
   - finestra temporale, data di riferimento e toggle eventi singoli;
   - grafico storico + proiezioni;
   - probabilità, robustezza, forza e caso maggiormente correlato;
   - tabella casi bullish e bearish.
4. **Ipercomprato–Ipervenduto** — `/instrument/[market]/[symbol]/overbought-oversold`
   - gauge sintetico;
   - Advanced DPO, Wyckoff e Speed;
   - Market Mood Meter;
   - grafici indicatori con range e controlli.
5. **Dati finanziari / Analisi** — `/instrument/[market]/[symbol]/fundamentals/analysis`
   - dati sintetici dividendo/earnings/market cap;
   - Financial Highlights;
   - Fair Value Calculations;
   - Solidity;
   - Value Generation;
   - Revenue by Products.
6. **Dati finanziari / Financial Statements** — `/instrument/[market]/[symbol]/fundamentals/statements`
   - stato richiesto dalla sotto-navigazione osservata, da comporre con tabelle finanziarie mock.
7. **Dati finanziari / Ratios** — `/instrument/[market]/[symbol]/fundamentals/ratios`
   - stato richiesto dalla sotto-navigazione osservata, con griglia e serie storiche mock.
8. **Dati finanziari / Transcripts** — `/instrument/[market]/[symbol]/fundamentals/transcripts`
   - stato richiesto dalla sotto-navigazione osservata, con elenco trimestri e trascrizione mock.
9. **Attività politica** — `/instrument/[market]/[symbol]/political`
   - grafico combinato prezzo + acquisti/vendite;
   - filtri;
   - tabella transazioni con avatar, partito, date e fascia importo.
10. **Notizie** — `/instrument/[market]/[symbol]/news`
    - recap sintetico mock;
    - carousel;
    - griglia articoli.
11. **Stato ricerca globale aperta** — stato sovrapposto disponibile da tutte le pagine app.
12. **Stato launcher strumenti aperto** — stato sovrapposto disponibile da tutte le pagine app.

### 3.2 Pagine richieste dalle note ma senza screenshot dedicato

Queste pagine useranno il design system ricavato dalle schermate osservate, senza introdurre un linguaggio visivo alternativo.

13. **Login** — `/login`
14. **Registrazione** — `/register`
15. **Dashboard** — `/dashboard`
16. **Ricerca strumenti completa** — `/search`
17. **Pagina titolo sintetica** — `/instrument/[market]/[symbol]`, redirect o ingresso all'overview
18. **Grafico titolo dedicato** — `/instrument/[market]/[symbol]/chart`
19. **Calendario operativo** — `/calendar`
20. **Watchlist** — `/watchlists`
21. **Portafoglio** — `/portfolio`
22. **Impostazioni** — `/settings`
23. **Errore 404** — `app/not-found.tsx`
24. **Varianti mobile** — gli stessi route e contenuti, adattati per viewport stretta; non una codebase separata.

### 3.3 Navigazione prevista

- L'header globale resta condiviso tra tutte le pagine autenticate.
- Il rail/menu laterale richiesto dalle note sarà usato nelle pagine generali (dashboard, ricerca, calendario, watchlist, portafoglio, impostazioni), con larghezza prevista `240 px` aperto e `72 px` chiuso.
- Le pagine strumento conserveranno il layout header-first osservato negli screenshot. Il rail non verrà aggiunto a queste viste finché non esiste un riferimento che lo dimostri, per non alterare la fedeltà.
- La barra tab dello strumento è route-driven: Overview, Seasonality, Pattern, Overbought–Oversold, Fundamentals, Political, News.
- La sotto-navigazione Fundamentals è route-driven: Analysis, Financial Statements, Ratios, Transcripts.

## 4. Inventario dei componenti

### 4.1 Fondamenta e shell

- `BrandConfigProvider`: nome, marchio, tagline, colori e asset sostituibili.
- `AppShell`: header, eventuale navigation rail, area contenuti e footer.
- `AuthShell`: layout centrato per login e registrazione.
- `GlobalHeader`:
  - `BrandLockup`;
  - `DateEventCard`;
  - `GlobalSearchTrigger`;
  - `AppLauncherTrigger`;
  - `UserAvatarMenu`.
- `NavigationRail` e `NavigationRailItem`, con stato expanded/collapsed.
- `TrialBanner` e `PromoBanner`, dismissibili solo localmente.
- `AppFooter` a quattro colonne + fascia copyright.
- `FloatingChatButton` puramente dimostrativo.
- `PageContainer` con larghezza massima condivisa.
- `ResponsiveOverflow` per tab, tabelle e controlli densi.

### 4.2 Navigazione e overlay

- `SearchOverlay` ancorato alla barra desktop e full-screen su mobile.
- `SearchResultRow` con nome, ticker, asset class e badge funzionalità.
- `ToolLauncherPopover` con griglia 3 colonne desktop.
- `ToolLauncherItem` con icona, etichetta e stato attivo/hover.
- `InstrumentTabs` e `FundamentalsTabs`.
- `SegmentedControl` generico.
- `RangeSelector`.
- `CarouselControls`.
- `IconActionButton` circolare.
- `Tooltip`, `InfoButton`, `ExternalLinkButton`.

### 4.3 Shell strumento

- `InstrumentHeader`:
  - logo strumento locale/sostituibile;
  - nome società;
  - ticker e mercato;
  - prezzo, variazione e stato mercato quando previsti dalle note;
  - menu selezione strumento.
- `InstrumentClassificationChips` per indici, settore e industria.
- `FavoriteButton`.
- `AgentCTA` rinominabile e senza funzione backend.
- `EarningsAlert`.
- `SectionTitlePill`.
- `MetricChip` e `StatusBadge`.

### 4.4 Componenti Overview

- `OverviewMetricToolbar`.
- `PriceFundamentalChart`.
- `PerformancePeriodCards`.
- `DrawdownChart`.
- `AnnualPerformanceChart`.
- `DividendTrendHeader` e `DividendChart`.
- `InsiderTransactionsSummary`.
- `InsiderTransactionsTable`.
- `TablePaginationControls`.

### 4.5 Componenti Seasonality

- `SeasonalityToolbar`.
- `SeasonalityRangeControl` con `1Y`, `5Y`, `10Y`, `15Y`, `20Y`.
- `SeasonalityChart` multi-serie.
- `SeasonalityLegend`.
- `SeasonalityStatsPanel` predisposto per una selezione di range.
- `EducationCTA`.

### 4.6 Componenti Pattern

- `PatternControlBar`.
- `ReferenceDateStepper`.
- `SingleEventsToggle`.
- `PatternProjectionChart`.
- `ProbabilitySplitCard`.
- `RobustnessRating`.
- `PatternStrengthCard`.
- `CorrelatedEventCard`.
- `PatternCasesTable` con gruppi collassabili e selezione riga.

### 4.7 Componenti Overbought–Oversold

- `MarketGauge` semicircolare.
- `IndicatorMetricCard`.
- `GradientScale`.
- `MarketMoodCard`.
- `AdvancedDPOChart` con volume.
- `IndicatorToolbar`.
- `IndicatorTabs`.
- `OscillatorChart` con soglie e aree evento.

### 4.8 Componenti Fundamentals

- `FundamentalsSummaryPanel`.
- `FinancialHighlightsSection`.
- `GroupedFinancialBarChart`.
- `RatioBarChart`.
- `PeriodToggle` annuale/trimestrale.
- `FairValueMetricCard`.
- `FairValueSummaryCard`.
- `SolidityTabs`.
- `FinancialScoreChart`.
- `ScoreSummaryCard`.
- `SharesOutstandingChart`.
- `WeightedFinancialsChart`.
- `TrendAssessmentCard`.
- `CompanyRobustnessCard`.
- `RevenueByProductsChart`.
- `RevenueMixPieChart`.
- `FinancialStatementTable`.
- `RatioHistoryGrid`.
- `TranscriptList` e `TranscriptViewer`.

### 4.9 Componenti Political e News

- `PoliticalTradesChart`.
- `PoliticalFilterBar`.
- `PoliticalTradesTable`.
- `PersonIdentityCell`.
- `PartyBadge`.
- `TradeTypeBadge`.
- `AmountScale`.
- `NewsRecapCard`.
- `NewsRecapCarousel`.
- `NewsArticleCard`.
- `NewsGrid`.

### 4.10 Pagine generali richieste dalle note

- `LoginForm`, `RegisterForm`, `PasswordField`, `FormMessage`.
- `DashboardSummaryCard`, `DashboardWatchlistPreview`, `DashboardCalendarPreview`, `DashboardPortfolioPreview`.
- `InstrumentSearchFilters`, `InstrumentResultsTable`.
- `TradingCalendar`, `CalendarDayCell`, `SignalBadge` (`BUY`, `HOLD`, `SELL`).
- `WatchlistSelector`, `WatchlistTable`, `AddInstrumentDialog`.
- `PortfolioSummary`, `PositionTable`, `AllocationChart`, `TransactionList`.
- `SettingsNav`, `ProfileSettingsForm`, `AppearanceSettings`, `NotificationSettings`.
- `NotFoundState`.

## 5. Inventario delle tabelle

| Tabella | Colonne/struttura | Stati |
|---|---|---|
| Insider transactions | indice, data, insider/ruolo, tipo azione, transazione, valore, azioni | header scuro, righe zebra leggere, riga selezionata azzurro, paginazione |
| Pattern cases | start date, end date, performance, max drop, max rise | gruppi Bullish/Bearish collassabili, riga selezionata, valori verdi/rossi |
| Political trades | politico/ruolo/partito/area, tipo, publication date, transaction date, amount | avatar, BUY/SELL, scala sacchetti, paginazione/scroll |
| Financial statements | voce, anni/trimestri, variazione | annuale/trimestrale, gruppi espandibili |
| Ratios | metrica, valore corrente, storico, giudizio | filtri per categoria e periodo |
| Search results | nome, ticker, tipo, mercato, badge/azioni | query vuota, risultati, nessun risultato |
| Watchlist | simbolo, prezzo mock, variazione, segnale, azioni | popolata, vuota, rimozione locale |
| Portfolio positions | simbolo, quantità, prezzo medio, valore, P/L | popolata, vuota, filtri |
| Calendar event list | data, strumento, segnale, nota | giorno selezionato, nessun evento |

Le tabelle desktop dense useranno semantica HTML reale. Su mobile, quelle finanziarie principali avranno contenitore a scorrimento orizzontale; le tabelle operative con molte informazioni personali potranno trasformarsi in card impilate mantenendo tutte le informazioni.

## 6. Inventario dei grafici

1. Grafico composito Overview: area prezzo, linea fondamentale, milestone verticali e selettore metrica.
2. Drawdown: area/linea rossa con asse percentuale negativo.
3. Performance annuale: barre positive verdi e negative rosse.
4. Dividendi: barre/colonne con trend crescente.
5. Stagionalità: tre linee normalizzate sui mesi, con linea verticale “oggi”.
6. Pattern: area storico + tre proiezioni (evento correlato, media long, media short).
7. Gauge Overbought–Oversold: semicerchio a tre zone e ago.
8. Advanced DPO: linea prezzo multicolore per segnale + volumi.
9. Oscillatore: linea nera, soglie ±50/±100 e bande eventi.
10. Financial Highlights: due grafici a barre raggruppate.
11. Fair Value/Solidity: barre storiche con tooltip.
12. Shares Outstanding: linea/area.
13. Weighted Financials: barre raggruppate per azione.
14. Revenue by Products: barre raggruppate per categoria.
15. Revenue Mix: torta con legenda e tooltip.
16. Political trades: area prezzo + barre BUY/SELL.
17. Grafico titolo dedicato: prezzo e volume con intervalli `1D`, `5D`, `1M`, `6M`, `YTD`, `1Y`, `5Y`, `MAX`.
18. Allocation portfolio: donut per peso posizione/settore.

Recharts copre tutte le visualizzazioni principali. Il gauge userà `RadialBarChart` o un piccolo wrapper SVG accessibile; non sarà un'immagine statica. I dati avranno punti deterministici e ancore manuali, così la geometria dei grafici resta stabile tra build e screenshot.

## 7. Stati e comportamenti dell'interfaccia

### Stati osservati direttamente

- ricerca chiusa/aperta;
- launcher chiuso/aperto;
- tab strumento attivo per ognuna delle sette sezioni;
- sotto-tab Fundamentals attivo;
- banner visibili e dismissibili;
- strumento preferito/non preferito;
- metrica Overview selezionata;
- card periodo performance selezionata;
- range stagionalità selezionato;
- modalità grafico/calendario stagionalità;
- durata Pattern selezionata;
- navigazione data Pattern precedente/successiva;
- toggle Single Events;
- gruppo tabella Pattern espanso/collassato;
- riga tabella Pattern selezionata;
- indicatore OBOS selezionato;
- range grafico selezionato;
- tooltip grafico visibile;
- modalità annuale/trimestrale;
- filtro Political per tipo e trade;
- carousel News con indice attivo.

### Stati richiesti dalle note

- menu laterale expanded/collapsed, con icone persistenti e label nascoste;
- calendario con `BUY`, `HOLD`, `SELL` per ogni giorno;
- ricerca per categorie titoli, ETF, crypto e indici;
- intervalli del grafico titolo;
- versioni responsive desktop/tablet/mobile.

### Comportamenti da implementare senza backend

- overlay chiudibili con `Escape`, click esterno e pulsante esplicito;
- navigazione da tastiera nei risultati ricerca;
- cambio tab tramite route, preservando il simbolo dello strumento;
- grafici aggiornati da controlli usando serie mock locali;
- selezione righe e gruppi tabelle in stato React locale;
- form auth validati lato client senza invio reale;
- operazioni Watchlist/Portfolio simulate solo in memoria o, se utile, con `localStorage` chiaramente isolato;
- link esterni mock non navigano verso il sito originale;
- nessun polling, fetch o connessione WebSocket.

## 8. Design system identificato

I valori seguenti sono token iniziali ricavati visivamente dagli screenshot. Verranno rifiniti con confronti a sovrapposizione durante l'implementazione.

### 8.1 Palette

| Token | Valore iniziale | Uso |
|---|---:|---|
| `ink-900` | `#18294A` | testo principale, icone scure |
| `navy-800` | `#294869` | tab attivi, header tabelle, section pill |
| `navy-700` | `#365B7D` | linee/ago e superfici secondarie |
| `blue-500` | `#5DA6EE` | bordi, icone, link e azioni |
| `blue-300` | `#91BDE9` | tab inattivi e superfici azzurre |
| `blue-100` | `#DDECFB` | pill e selezioni leggere |
| `surface-info` | `#EEF5FC` | card di riepilogo e righe alternate |
| `border` | `#D8DDE3` | bordi neutri e separatori |
| `muted` | `#AEB7C3` | ticker secondario e testo disabilitato |
| `positive` | `#00B347` | performance positive e BUY |
| `positive-soft` | `#D9F8E5` | badge BUY/card positive |
| `teal` | `#38B6A0` | serie finanziarie e barre buy |
| `negative` | `#F33F3D` | performance negative e SELL |
| `negative-soft` | `#FFDADA` | badge SELL/card warning |
| `warning` | `#FF6B00` | earnings alert |
| `chart-blue` | `#579BE3` | prezzo/area principale |
| `chart-orange` | `#F4A000` | free cash flow/prodotti |
| `promo-purple` | `#7B2CFF` | banner trial |
| `promo-pink` | `#F45BB4` | banner video |
| `news-blue` | `#078ACD` | recap notizie |
| `black` | `#000000` | CTA agent |
| `white` | `#FFFFFF` | sfondo principale/testo inverso |

I colori di grafico saranno definiti come serie nominate (`sales`, `netIncome`, `freeCashFlow`, `roe`, `debtEquity`, `buy`, `sell`) e non scritti inline nei componenti.

### 8.2 Tipografia

- Famiglia più vicina osservata: **Roboto Condensed**; sarà usata tramite pacchetto font locale (`@fontsource-variable/roboto-condensed`) per evitare richieste runtime.
- Fallback: `Arial Narrow`, `Arial`, `sans-serif`.
- Pesi: 300 per ticker secondario, 400 corpo, 500 controlli, 700 titoli e numeri chiave.
- Scala iniziale desktop:
  - display strumento: `36 px / 1.05`, peso 700;
  - ticker display: `36 px / 1.05`, peso 300;
  - titolo sezione grande: `20–24 px`;
  - body: `16 px / 1.4`;
  - label/controlli: `14–16 px`;
  - note/caption: `12–13 px`;
  - numeri KPI: `28–36 px`, peso 700.
- Il font sarà verificato confrontando larghezza di stringhe chiave (“NVIDIA Corporation”, “Overbought - Oversold”, intestazioni tabella) con le immagini.

### 8.3 Layout e spaziatura

- Container contenuti osservato: circa `1120 px`, centrato.
- Header globale desktop: circa `79 px` di altezza.
- Banner trial e promo: circa `40 px` ciascuno.
- Spaziatura base: multipli di `4 px`; ritmo principale `8 / 12 / 16 / 24 / 32 / 48 / 64`.
- Padding card: `16–24 px`; grandi pannelli `24–32 px`.
- Gap principali: `16 px` nei controlli, `24–32 px` tra card, `40–56 px` tra sezioni analitiche.
- Grafici desktop: altezza tipica `320–520 px`, in base alla densità osservata.

### 8.4 Bordi, raggi e ombre

- Bordo standard: `1 px`.
- Raggio controlli/card: `10–14 px`.
- Pill e tab terminali: `9999 px` oppure metà altezza.
- Section title pill: altezza circa `48 px`, padding orizzontale `24 px`.
- Button circolari: `44–48 px` desktop.
- Ombra overlay: `0 8px 24px rgba(24, 41, 74, 0.16)`.
- Le card normali sono quasi piatte; la separazione è ottenuta soprattutto con bordo, tinta di fondo e spazio bianco.

### 8.5 Iconografia e asset

- Tratto icone: `1.75–2 px`, angoli arrotondati, colore `ink-900` o `blue-500`.
- Logo app e logo strumento saranno componenti/asset distinti e configurabili.
- Avatar politici e loghi non saranno caricati da URL originali: usare asset locali mock, iniziali o illustrazioni sostituibili.
- Il nome provvisorio del prodotto, il simbolo e i testi del marchio vivranno in un singolo file di configurazione, così potranno essere sostituiti senza toccare il layout.

## 9. Breakpoint e comportamento responsive

Breakpoint Tailwind previsti:

- `sm`: 640 px;
- `md`: 768 px;
- `lg`: 1024 px;
- `xl`: 1280 px;
- `2xl`: 1536 px.

### Desktop (`>= 1280 px`)

- Replica primaria della viewport di riferimento `1452 × 773 CSS px`.
- Container `1120 px` centrato.
- Header a singola riga, ricerca larga, tab complete.
- Griglie analitiche 2 colonne e tabelle complete.
- Overlay ricerca largo circa `560 px`; launcher 3 colonne.

### Tablet (`768–1279 px`)

- Header su due zone: brand/azioni e search più compatta.
- Chip e tab con scorrimento orizzontale.
- Griglie 2 colonne solo quando leggibili; altrimenti una colonna.
- Tabelle in overflow orizzontale con prima colonna sticky dove utile.
- Launcher 2–3 colonne a seconda della larghezza.
- Rail laterale chiuso per default.

### Mobile (`< 768 px`)

- Brand compatto, search come icona che apre pannello full-screen.
- Navigation rail trasformato in drawer.
- Intestazione strumento impilata; ticker e mercato sotto il nome.
- Tab strumento in barra orizzontale scrollabile.
- Banner ridotti a una riga con CTA compatta.
- Tutte le griglie diventano una colonna.
- Controlli grafici avvolgibili o scrollabili, target touch minimo `44 px`.
- Grafici con `min-width` controllata quando la leggibilità richiede scroll orizzontale.
- Tabelle operative trasformate in card; tabelle finanziarie dense in scroll.
- Footer a fisarmonica o una colonna.

Poiché `reference:/mobile:` è vuota, la versione mobile sarà un adattamento coerente del sistema desktop e sarà documentata come inferenza, non come replica pixel-perfect di un riferimento inesistente.

## 10. Architettura tecnica proposta

```text
app/
  (auth)/
    login/page.tsx
    register/page.tsx
  (terminal)/
    layout.tsx
    dashboard/page.tsx
    search/page.tsx
    calendar/page.tsx
    watchlists/page.tsx
    portfolio/page.tsx
    settings/page.tsx
    instrument/[market]/[symbol]/
      page.tsx
      overview/page.tsx
      chart/page.tsx
      seasonality/page.tsx
      pattern/page.tsx
      overbought-oversold/page.tsx
      fundamentals/
        analysis/page.tsx
        statements/page.tsx
        ratios/page.tsx
        transcripts/page.tsx
      political/page.tsx
      news/page.tsx
  layout.tsx
  not-found.tsx
  globals.css
components/
  shell/
  navigation/
  instrument/
  charts/
  tables/
  fundamentals/
  political/
  news/
  calendar/
  portfolio/
  ui/
data/
  mock/
  adapters/
  indexes.ts
lib/
  chart-formatters.ts
  date-formatters.ts
  number-formatters.ts
  routes.ts
types/
  finance.ts
  ui.ts
config/
  brand.ts
  navigation.ts
public/
  brand/
  instruments/
  avatars/
```

### Regole architetturali

- Server Components per shell e contenuti statici; Client Components solo per grafici e interazioni.
- Ogni pagina assembla sezioni modulari; niente mega-componente unico.
- Nessun valore mock definito dentro JSX di pagina.
- Formattatori condivisi per valuta, percentuale, miliardi/milioni e date.
- Route, tab e label centralizzati.
- Componenti base accessibili: focus visibile, label, `aria-expanded`, `aria-selected`, tabelle semantiche.
- `prefers-reduced-motion` rispettato per transizioni e carousel.

## 11. Dati mock centralizzati e futura sostituzione con Yahoo Finance

### Modello dati

Definire tipi indipendenti dal provider:

- `Instrument`, `QuoteSnapshot`, `MarketSession`;
- `TimeSeriesPoint`, `OHLCVPoint`, `FundamentalSeriesPoint`;
- `PerformancePeriod`, `DrawdownPoint`, `DividendPoint`;
- `SeasonalitySeries`, `PatternProjection`, `PatternCase`;
- `IndicatorSnapshot`, `IndicatorSeriesPoint`;
- `FinancialSummary`, `FinancialStatement`, `FinancialRatio`, `FairValueModel`;
- `InsiderTransaction`, `PoliticalTrade`;
- `NewsArticle`, `NewsRecap`;
- `CalendarSignal`, `Watchlist`, `Portfolio`, `Position`;
- `UserPreferences`.

### Organizzazione mock

- `data/mock/instruments.ts`: anagrafiche, classificazioni e quote.
- `data/mock/series.ts`: prezzo/volume e intervalli.
- `data/mock/overview.ts`: performance, drawdown, dividendi, insider.
- `data/mock/seasonality.ts`.
- `data/mock/patterns.ts`.
- `data/mock/indicators.ts`.
- `data/mock/fundamentals.ts`.
- `data/mock/political.ts`.
- `data/mock/news.ts`.
- `data/mock/calendar.ts`.
- `data/mock/watchlists.ts`.
- `data/mock/portfolio.ts`.
- `data/mock/user.ts`.

Le serie saranno deterministiche. Per ottenere curve visivamente simili ai riferimenti si useranno ancore manuali e interpolazione controllata, non numeri casuali calcolati a ogni render.

### Seam per Yahoo Finance futuro

Creare un'interfaccia `MarketDataProvider` con metodi come `getInstrument`, `getQuote`, `getPriceSeries`, `getFundamentals` e `searchInstruments`. In questa fase verrà implementato solo `MockMarketDataProvider`. Un futuro `YahooFinanceProvider` potrà mappare le risposte esterne nei tipi interni senza cambiare pagine o componenti.

Nessun adapter Yahoo sarà collegato o chiamato durante questa fase statica.

## 12. Ordine di implementazione

1. **Bootstrap e qualità base**
   - inizializzare Next.js App Router + TypeScript + Tailwind;
   - aggiungere Recharts, Lucide e font locale;
   - configurare lint/typecheck e token CSS.
2. **Design system**
   - colori, tipografia, container, spacing, card, pill, button, tab, badge, tooltip e tabelle base.
3. **Mock domain layer**
   - tipi finanziari, provider mock, formattatori e configurazione brand.
4. **Shell globale**
   - header, banner, footer, floating action, navigation rail e responsive shell.
5. **Overlay osservati**
   - ricerca globale e launcher strumenti, inclusi focus/keyboard/chiusura.
6. **Shell strumento**
   - instrument header, chip classificazione, tab route-driven, earnings alert.
7. **Overview completa**
   - grafico principale, performance, drawdown, annual returns, dividendi e insider table.
8. **Seasonality e Chart dedicato**
   - grafico multi-serie, range storici e pagina prezzo/volume con intervalli richiesti.
9. **Pattern**
   - controlli, proiezioni, card statistiche e casi bullish/bearish.
10. **Overbought–Oversold**
    - gauge, mood meter, Advanced DPO e oscillatore.
11. **Fundamentals**
    - Analysis completa; poi Financial Statements, Ratios e Transcripts.
12. **Political e News**
    - grafico, filtri, tabella; recap e griglia notizie.
13. **Pagine generali**
    - login, registrazione, dashboard, ricerca completa, calendario, watchlist, portafoglio, impostazioni e 404.
14. **Responsive pass**
    - tablet e mobile su tutti i route, con particolare attenzione a grafici, tab e tabelle.
15. **Visual QA e hardening**
    - confronto screenshot, accessibilità, build production, audit di rete e rimozione di ogni placeholder tecnico.

## 13. Criteri di verifica della somiglianza visiva

### Confronto primario

- Acquisire screenshot locali alla viewport CSS `1452 × 773 px`.
- Escludere la barra del browser originale dal confronto.
- Confrontare ogni route/stato con tutti i 23 riferimenti, inclusi gli anchor di scroll.
- Usare overlay al 50% e diff pixel per identificare scostamenti.

### Tolleranze iniziali

- container e griglie principali: errore massimo `±4 px`;
- altezze header/banner/tab: `±2 px`;
- allineamento testi e controlli: `±3 px`;
- raggi e spessori bordi: `±1–2 px`;
- colore: correggere differenze chiaramente percepibili, con priorità a navy, azzurri, verde/rosso e banner;
- tipografia: stessa gerarchia, peso e larghezza visiva; nessun wrapping diverso nelle stringhe chiave alla viewport di riferimento;
- grafici: stessi rapporti tra plot, legenda, assi e controlli; curve coerenti nei landmark principali, senza pretendere identità dei dati reali.

### Checklist funzionale

- ogni screenshot ha un route o stato riproducibile;
- search overlay e launcher corrispondono per posizione, dimensione e densità;
- tutti i tab portano a contenuti distinti;
- i range grafico cambiano serie mock;
- calendario mostra BUY/HOLD/SELL;
- rail collassa mantenendo le icone;
- tabelle e grafici restano usabili a 1024, 768, 390 e 360 px;
- nessun overflow orizzontale globale non intenzionale;
- focus, tastiera e contrasto risultano usabili;
- `next build`, typecheck e lint passano;
- audit delle richieste di rete: zero chiamate dati esterne e zero dipendenze dal backend originale;
- scansione repository: nessuna credenziale o segreto.

## 14. Informazioni mancanti e assunzioni controllate

1. **Nessuno screenshot di login, registrazione, dashboard, ricerca completa, calendario, watchlist, portafoglio, impostazioni o 404.** Queste pagine saranno progettate usando esclusivamente il design system osservato e componenti già presenti nelle schermate strumento.
2. **La cartella mobile è vuota.** Breakpoint, drawer, stacking e trasformazione delle tabelle sono quindi inferiti.
3. **Il menu laterale è descritto ma non visibile.** Mancano posizione esatta, larghezza, voci e stile dell'icona; i valori `240/72 px` sono una proposta da verificare.
4. **La pagina “Grafico del titolo” non è mostrata come route autonoma.** Verrà derivata dal grafico Overview e dagli intervalli indicati nelle note.
5. **Gli stati Financial Statements, Ratios e Transcripts sono visibili solo come tab, non nel loro contenuto.** Saranno costruiti con mock coerenti, senza fingere una replica non documentata.
6. **Non sono mostrati menu profilo, errori form, empty state, loading state o conferme.** Verranno mantenuti essenziali e coerenti, senza aggiungere funzionalità speculative.
7. **Font e colori non sono forniti come token.** `Roboto Condensed` e la palette sopra sono identificazioni visive provvisorie da rifinire con il diff.
8. **Non sono forniti asset sostitutivi.** Saranno usati marchio configurabile e asset locali neutrali, con proporzioni simili ai riferimenti.
9. **Non è definita la lingua finale.** Le schermate sono prevalentemente in inglese; il mock iniziale manterrà l'inglese per fedeltà, con testi centralizzati per una futura localizzazione.
10. **Non sono specificati dati o date canoniche.** I valori saranno realistici, internamente coerenti e chiaramente mock.

## 15. Riepilogo richiesto

### Pagine individuate

- 7 viste strumento documentate negli screenshot: Overview, Seasonality, Pattern, Overbought–Oversold, Fundamentals Analysis, Political e News;
- 3 sotto-viste Fundamentals indicate dalla navigazione ma prive di contenuto fotografato: Financial Statements, Ratios e Transcripts;
- 2 overlay globali osservati: ricerca e launcher;
- 11 pagine richieste dalle note senza screenshot dedicato: login, registrazione, dashboard, ricerca completa, titolo, grafico titolo, calendario, watchlist, portafoglio, impostazioni, 404;
- varianti responsive degli stessi route per desktop, tablet e mobile.

### Componenti da costruire

- shell globale, header, rail, banner, footer e overlay;
- shell strumento, chip, tab, alert e azioni;
- sistema UI condiviso di card, pill, badge, button, tooltip, tab e tabelle;
- 18 famiglie di grafici/visualizzazioni;
- tabelle insider, pattern, political, financial, search, watchlist, portfolio e calendario;
- form auth e impostazioni;
- componenti specifici per calendar, watchlist, portfolio, news e fundamentals.

### Informazioni mancanti

- riferimenti visivi per 11 pagine richieste;
- screenshot mobile/tablet;
- specifiche del menu laterale;
- contenuto di tre tab Fundamentals;
- design token, font e asset originali/sostitutivi;
- lingua, testi definitivi e regole dei dati.

### Ordine di implementazione

Bootstrap → design system → mock provider → shell globale → overlay → shell strumento → Overview → Seasonality/Chart → Pattern → OBOS → Fundamentals → Political/News → pagine generali → responsive → visual QA.

### Criteri di somiglianza visiva

- confronto alla viewport di riferimento con overlay/diff;
- precisione di container, griglie, altezze, spacing e wrapping;
- corrispondenza di palette, tipografia, bordi e raggi;
- proporzioni coerenti di grafici, tabelle e pannelli;
- riproducibilità di ogni route, stato e posizione di scroll mostrati;
- verifica separata a desktop, tablet e mobile;
- assenza completa di chiamate dati esterne, backend e credenziali.
