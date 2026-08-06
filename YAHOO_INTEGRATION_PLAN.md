# Piano di integrazione Yahoo Finance server-side

Data dell'analisi: 6 agosto 2026
Stato: piano soltanto; nessuna integrazione o modifica visuale è stata eseguita.

## 1. Obiettivo e vincoli

L'obiettivo è sostituire progressivamente i dati finanziari mock con dati ottenuti lato server tramite `yahoo-finance2`, mantenendo invariati layout, colori, dimensioni, grafici, navigazione e comportamento visuale del frontend.

Vincoli non negoziabili:

- `yahoo-finance2` deve essere importato esclusivamente da moduli server-only.
- Nessun Client Component deve contattare Yahoo direttamente.
- Nessuna credenziale, cookie o risposta Yahoo grezza deve raggiungere il browser.
- Le pagine continuano a dipendere da `FinancialDataProvider`, non dalla libreria Yahoo.
- I componenti continuano a ricevere DTO normalizzati tramite props.
- Il mock provider resta disponibile come fallback controllato e come fixture per test e sviluppo.
- Le fonti e i timestamp devono essere tracciabili internamente, anche se inizialmente non vengono mostrati nell'interfaccia.
- La migrazione non deve implicare chiamate alle API del sito di riferimento originario.

### Nota legale e operativa

`yahoo-finance2` è un client comunitario non ufficiale. Yahoo non offre un'API ufficiale per sviluppatori e non garantisce stabilità o disponibilità del protocollo. Inoltre Yahoo dichiara limiti di licenza e redistribuzione sui dati. Prima di un uso pubblico o commerciale è necessaria una verifica legale/licensing; l'architettura deve quindi consentire la sostituzione futura della sorgente senza modificare il frontend.

Riferimenti verificati:

- [`yahoo-finance2` v4, repository e avvertenze](https://github.com/gadicc/yahoo-finance2)
- [`yahoo-finance2` v4.0.0 su npm](https://www.npmjs.com/package/yahoo-finance2)
- [Documentazione tipizzata dei moduli](https://jsr.io/%40gadicc/yahoo-finance2/doc/modules)
- [Copertura, ritardi e fonti dichiarate da Yahoo Finance](https://help.yahoo.com/kb/finance/SLN2310.html)
- [Dati storici, dividendi e split su Yahoo Finance](https://help.yahoo.com/kb/finance/certain-amounts-sln2311.html)
- [Cache Components e `cacheLife` in Next.js 16](https://nextjs.org/docs/app/api-reference/functions/cacheLife)

## 2. Architettura esistente

### 2.1 Confine dati già presente

Il progetto possiede già un confine unico tra UI e sorgente dati:

- `src/services/financial-data-provider.ts`: interfaccia `FinancialDataProvider` con 15 metodi.
- `src/services/financial-data-service.ts`: unico punto di selezione del provider attivo.
- `src/services/mock-financial-data-provider.ts`: implementazione corrente.
- `src/data/mock/dataset.ts`: dataset mock principale.
- `src/types/finance.ts`: DTO consumati dalle pagine e dai componenti.
- `src/lib/formatters.ts`: formattazione di valute, percentuali e quantità.
- `src/components/charts`: rendering dei grafici senza responsabilità di fetch.
- `src/components/financial`: viste finanziarie che ricevono dati tramite props.

Il flusso corrente è:

```text
Server Component
  -> financialDataService: FinancialDataProvider
    -> MockFinancialDataProvider
      -> mockFinancialDataset
  -> props serializzate
    -> Client Component / grafico
```

Questo confine è valido come facade stabile, ma l'interfaccia corrente non rappresenta soltanto dati finanziari: include anche brand, utente, watchlist, portfolio, testi editoriali e view-model già formattati. Un singolo `YahooFinanceProvider` non può quindi sostituire correttamente tutto il mock provider.

### 2.2 Valutazione dei 15 metodi

| Metodo esistente | Responsabilità attuale | Valutazione per la migrazione |
|---|---|---|
| `getBrand()` | Nome, suffisso e tagline | Dato applicativo, non Yahoo. Deve restare config/mock. |
| `getShellData()` | Brand, strumento primario, ricerca rapida, stato mercato | Composito: config + Yahoo `search`/`quote` + calcolo orari. |
| `getDashboardData()` | Pulse, watchlist, spotlight, portfolio, segnali, brief | Composito: Yahoo + dati utente + analytics + contenuto editoriale. |
| `getCalendarData()` | Giorni, segnali ed eventi | Composito: eventi Yahoo parziali + analytics + calendario macro/utente alternativo. |
| `getWatchlist()` | Simboli seguiti, quote, segnali | Membership applicativa + quote Yahoo + segnale calcolato. |
| `getPortfolioData()` | Posizioni, prezzi e rendimento | Posizioni applicative + quote Yahoo + calcoli. |
| `getSearchUniverse()` | Elenco strumenti ricercabili | Yahoo `search`; la firma attuale senza query/paginazione è insufficiente. |
| `getInstrument(ref)` | Profilo, quote, classificazioni, earnings | Quasi tutto Yahoo; tassonomie editoriali e appartenenza a indici richiedono altro. |
| `getOverview(ref)` | Storico, ritorni, drawdown, dividendi, insider | Yahoo `chart`/`quoteSummary` + calcoli. |
| `getSeasonality(ref)` | Serie stagionali e statistiche | Calcolo proprietario da storico Yahoo. |
| `getPatterns(ref)` | Pattern, probabilità, casi e correlazioni | Calcolo proprietario da OHLC Yahoo; specifica algoritmica oggi mancante. |
| `getMomentum(ref)` | DPO, oscillatore, Wyckoff, Speed e mood | Calcolo proprietario da OHLCV Yahoo; formule oggi mancanti. |
| `getFundamentals(ref)` | Bilanci, ratios, fair value, scores, segmenti, transcript | Yahoo parziale + calcoli + fonti alternative. |
| `getPoliticalActivity(ref)` | Transazioni politiche | Non disponibile su Yahoo; provider alternativo obbligatorio. |
| `getNews(ref)` | Headline e briefing narrativi | Yahoo supporta metadati news; non articoli completi né recap generati. |

### 2.3 Limiti del contratto corrente da gestire internamente

Per non cambiare le pagine durante la prima migrazione, `FinancialDataProvider` deve restare la facade pubblica. Dietro tale facade va introdotta una composizione di sorgenti:

```text
FinancialDataProvider (facade invariata per la UI)
  |- AppConfigSource             brand, ticker predefiniti, tassonomie
  |- UserDataSource              profilo, watchlist, portfolio, preferenze
  |- YahooFinanceMarketSource    quote, chart, search, profilo, fondamentali, news
  |- FinancialAnalyticsEngine    ritorni, drawdown, seasonality, indicatori, scores
  |- AlternativeContentSource    politica, transcript, macro, segmenti, recap
  `- MockFallbackSource          ultimo fallback per slice/field
```

La facade assemblerà gli stessi DTO attuali, così i componenti non cambieranno struttura. In una fase successiva sarà utile separare DTO finanziari numerici da view-model formattati, perché oggi diversi tipi contengono stringhe di presentazione (`MarketPulseItem.value`, `RatioMetric.value`, `SummaryMetric.value`, date label e confronti testuali).

## 3. Verifica server/client

Esito dell'audit:

- Tutte le chiamate a `financialDataService` sono in Server Components, con la sola eccezione del `Footer`, che è anch'esso un Server Component.
- Nessun file con direttiva `"use client"` importa `@/services`, `@/data/mock` o `yahoo-finance2`.
- I Client Components (`AppShell`, `InstrumentShell`, viste finanziarie, tabelle, grafici e controlli) ricevono dati tramite props e mantengono soltanto stato UI locale.

Regola da rendere verificabile in CI:

```text
src/components/** con "use client" -> vietato importare src/services/yahoo/**
src/app/**/route.ts e Server Components -> possono usare FinancialDataProvider
src/services/yahoo/** -> deve importare "server-only"
```

Se in futuro ricerca, range o filtri richiederanno richieste dal browser, il Client Component chiamerà esclusivamente un Route Handler interno (`/api/financial/...`) o una Server Action. Il Route Handler chiamerà il service layer server-side; il browser non conoscerà mai endpoint, cookie o dettagli Yahoo.

## 4. Moduli `yahoo-finance2` previsti

La futura implementazione dovrà usare `yahoo-finance2@4.0.0` o una versione 4.x fissata e validata, non `latest` non vincolato.

| Modulo | Uso previsto |
|---|---|
| `quote(symbol | symbols[])` | Quotazione corrente/ultima, variazione, open, high, low, previous close, volume, valuta, market cap, market state, exchange, timezone, earnings timestamp, dividend fields. Supporta batching. |
| `quoteCombine()` | Deduplicazione e batching di quote concorrenti; default documentato fino a 100 simboli, da limitare più prudentemente nel progetto. |
| `chart(symbol, options)` | OHLCV storico/intraday, adjusted close, metadata di mercato, trading periods, dividendi e split. È la sorgente primaria per tutti i grafici prezzo. |
| `historical(symbol, options)` | Alternativa per serie EOD/dividendi/split; non usarla in parallelo a `chart` per lo stesso caso senza motivo. |
| `search(query, options)` | Ricerca azioni, ETF, indici, valute, futures e criptovalute; può restituire news correlate. |
| `quoteSummary(symbol, { modules })` | Profilo, calendario earnings, statistiche, financial data, statement history, insider transactions, buyback activity, filings e stime. Richiedere soltanto i moduli necessari. |
| `fundamentalsTimeSeries(symbol, options)` | Serie annuali/trimestrali di conto economico, stato patrimoniale, cash flow e shares outstanding. |
| `insights(symbol)` | Dati analitici variabili; solo integrazione opzionale, mai dipendenza necessaria per fair value o briefing. |

Impostazioni comuni:

- `validateResult: true` in produzione.
- `fetchOptions.signal` con `AbortSignal.timeout(...)` per cancellare davvero le richieste scadute.
- `queue` configurata sull'istanza condivisa per limitare la pressione verso Yahoo.
- Una singola istanza `YahooFinance` per processo/serverless invocation, non una per componente.
- Import server-only e runtime Node.js; non Edge Runtime.

## 5. Legenda della copertura

- **D — Diretto Yahoo**: il campo è esposto da un modulo Yahoo, pur potendo essere nullo o non coperto per alcuni strumenti.
- **C — Calcolabile**: deriva deterministicamente da dati Yahoo e/o dati applicativi.
- **N — Non Yahoo / applicativo**: è configurazione, dato utente o contenuto proprietario; Yahoo non è la sorgente corretta.
- **A — Altra fonte**: richiede un provider esterno, dataset pubblico dedicato o contenuto editoriale/licenziato.

## 6. Matrice completa dei dati richiesti

### 6.1 Shell, dashboard, ricerca, watchlist e portfolio

| Area / campo | Classe | Metodo Yahoo | Trasformazione |
|---|---:|---|---|
| Brand, tagline, suffisso | N | Nessuno | Config applicativa. |
| Strumento primario | N | Nessuno | Registry di prodotto che punta a un `yahooSymbol` canonico. |
| Risultati ricerca: symbol, nome, tipo, exchange | D | `search` | Normalizzare `quoteType` nei tipi UI Stock/ETF/Index/Forex/Crypto; scartare risultati non Yahoo. |
| Prezzo nei risultati ricerca | D | `quote` batch sui risultati | Join per symbol; aggiungere valuta al DTO in futuro. |
| `href` della ricerca | C | Nessuno | Generare con resolver route, non fidarsi di URL esterni. |
| Stato mercato | D/C | `quote`, `chart.meta` | Mappare `marketState`; distinguere real-time/delayed mediante `quoteSourceName` e `exchangeDataDelayedBy`. |
| Tempo alla chiusura | C | `chart.meta.currentTradingPeriod` | Calcolo timezone-aware; gestire festività e sessioni pre/post. |
| Market pulse (S&P 500, Nasdaq, VIX, yield) | D | `quote` batch | Registry simboli (`^GSPC`, `^NDX`, `^VIX`, `^TNX`), formattazione per classe asset. |
| Greeting utente | N | Nessuno | Auth/profilo applicativo. |
| Watchlist membership | N | Nessuno | Database/app state; Yahoo non gestisce la watchlist del prodotto. |
| Watchlist price e daily change | D | `quote` batch | Join con membership; preservare ordine utente. |
| Watchlist BUY/HOLD/SELL | C | `chart` + analytics | Regola di segnale da specificare e versionare; non è un campo Yahoo. |
| Posizioni, quantità, prezzo medio | N | Nessuno | Database/ledger applicativo. |
| Current price del portfolio | D | `quote` batch | Conversione valuta se il portfolio è multi-currency. |
| Market value, allocation, total/day return | C | `quote` + ledger | Calcoli su quantità, cost basis, cash flow e FX. |
| Signal balance / constructive percent | C | `chart` + analytics | Aggregazione dei segnali proprietari. |
| Upcoming events | D/C/A | `quoteSummary.calendarEvents` | Earnings/dividendi diretti; unire eventi utente e calendario macro alternativo. |
| Brief title/body | N/A | Nessuno affidabile | Contenuto editoriale o pipeline di summarization separata e tracciabile. |

### 6.2 Strumento e quotazione

| Campo UI | Classe | Metodo Yahoo | Trasformazione |
|---|---:|---|---|
| Symbol, nome, exchange, currency, quote type | D | `quote`, `quoteSummary.price/quoteType` | Normalizzazione nomi exchange e categoria UI. |
| Country, sector, industry | D | `quoteSummary.assetProfile` | Fallback `summaryProfile`; valori opzionali per ETF/index/crypto. |
| Classificazioni “Technology”, “Large cap”, tema | D/C/A | `assetProfile`, `quote.marketCap` | Sector diretto; size bucket calcolato; temi/appartenenza indice da registry/provider alternativo. |
| Current/last price | D | `quote.regularMarketPrice` | Scegliere regolare o extended con policy esplicita; includere timestamp. |
| Daily change / percent | D | `quote.regularMarketChange*` | Nessun ricalcolo salvo fallback da price/previous close. |
| Day open | D | `quote.regularMarketOpen` | Correggere in seguito l'attuale `price - change`, che rappresenta il previous close e non l'open. |
| Day low/high | D | `quote.regularMarketDayLow/High` | Gestire null e sessione. |
| Volume | D | `quote.regularMarketVolume` | Formattazione compatta. |
| Market cap | D | `quote.marketCap` o `summaryDetail.marketCap` | Formattazione per valuta e scala. |
| Market status | D | `quote.marketState` | Mapping REGULAR/PRE/POST/CLOSED. |
| Next earnings date/range | D | `quote` e `quoteSummary.calendarEvents` | Se Yahoo fornisce un range, conservarlo; `daysUntil` è calcolato. |
| Consensus EPS | D | `calendarEvents.earningsAverage` / `earningsTrend` | Scegliere GAAP/non-GAAP e valuta coerenti. |

### 6.3 Storico, OHLC, grafici e overview

| Campo UI | Classe | Metodo Yahoo | Trasformazione |
|---|---:|---|---|
| Date, open, high, low, close, adjusted close, volume | D | `chart(..., { return: "array" })` | Rimuovere punti nulli, ordinare, convertire date in timezone exchange, selezionare intervallo. |
| `TimePoint.label/value/volume` | C | `chart` | `close` o `adjclose` -> `value`; date -> label; volume numerico invariato. |
| Serie “comparison” del grafico principale | D/C | `chart` o fundamentals | Se confronto con altro ticker: secondo `chart`; se Net Income: allineamento e scaling da fundamentals. La UI oggi non distingue i due casi. |
| Return 1M/6M/YTD/1Y/3Y/5Y/10Y/20Y | C | `chart` | `(last / firstComparable - 1) * 100`, usando adjusted close e regole sui giorni mancanti. |
| Drawdown | C | `chart` | `(price / runningPeak - 1) * 100` su adjusted close. |
| Performance annuale | C | `chart` | Primo/ultimo adjusted close per anno; gestire IPO incomplete. |
| Dividendi | D | `chart(events: "dividends")` o `historical` | Mappare data/importo; distinguere importo per azione e yield. |
| Split | D | `chart(events: "splits")` | Usare per coerenza serie e audit; non è ancora visualizzato. |
| Insider transactions | D parziale | `quoteSummary.insiderTransactions` | Mappare start date, insider, relation, transaction text, shares e value; copertura non uniforme. |
| Insider total activity | D/C | `netSharePurchaseActivity` o transazioni | Definire se indica numero, shares o valore; l'attuale numero mock è semanticamente ambiguo. |

### 6.4 Analytics derivati

| Funzione | Classe | Input Yahoo | Trasformazione richiesta |
|---|---:|---|---|
| Seasonality current/20-year average | C | Daily adjusted close via `chart` | Rendimenti normalizzati per trading-day/week-of-year; evitare bias da anni incompleti. |
| Analogue year | C | Daily adjusted close | Definire algoritmo di similarità, finestra e normalizzazione; oggi non esiste una specifica. |
| Best month, positive years %, average return, bias | C | Storico daily/monthly | Aggregazione per mese e anno con soglia minima di osservazioni. |
| Pattern cases | C | OHLC via `chart` | Definire finestra, distanza, soglia bullish/bearish, max adverse/favorable excursion. |
| Pattern probability, robustness, strength | C | Pattern cases | Statistica versionata con sample size e confidence; non è un dato Yahoo. |
| Correlated event | C/A | OHLC + eventuale event source | Correlazione prezzo calcolabile; il significato dell'evento richiede tassonomia esterna. |
| Advanced DPO | C | OHLCV | Formula e periodo da documentare; aggiungere test numerici. |
| Oscillator / Market Mood Meter | C | OHLCV | Formula, bande e mapping mood da specificare. |
| Wyckoff e Speed | C | OHLCV | Algoritmi proprietari; Yahoo fornisce soltanto gli input. |
| BUY/HOLD/SELL | C | OHLCV + fundamentals opzionali | Motore segnali interno, versione e timestamp. |

### 6.5 Fondamentali

| Campo UI | Classe | Metodo Yahoo | Trasformazione |
|---|---:|---|---|
| Ex-dividend, payment/dividend date, annual dividend, yield | D parziale | `quote`, `summaryDetail`, `calendarEvents` | Date e trailing rate/yield; payment date può mancare. |
| Market cap, EPS TTM, P/E TTM, last close | D | `quote`, `defaultKeyStatistics`, `summaryDetail` | Numeric-first, poi formattazione UI. |
| Revenue, cost of revenue, gross profit, operating income, net income | D | `fundamentalsTimeSeries` o statement history | Annual/quarterly/TTM; normalizzare currency, scale e fiscal period. |
| Operating cash flow, capex | D | `fundamentalsTimeSeries` | Input per FCF. |
| Free cash flow | D/C | `fundamentalsTimeSeries` o `OCF - CapEx` | Preferire campo diretto se coerente, altrimenti calcolo documentato. |
| Gross/profit/FCF margin | D/C | `financialData` + statements | Validare unità; calcolo su periodi coerenti. |
| ROE, debt/equity | D/C | `financialData` + balance sheet | Campo diretto o calcolo; evitare divisioni su equity non positivo. |
| Shares outstanding history | D | `fundamentalsTimeSeries` / statistics | Annual diluted average shares o end-of-period shares: scegliere una semantica. |
| Shareholders yield | C | Dividendi + buyback/issuance + market cap | Definire formula; dati buyback possono essere incompleti. |
| DCF fair value | C | FCF, cash, debt, shares | Richiede assunzioni WACC, crescita e terminal value configurabili. |
| Peter Lynch fair value | C | EPS + crescita + dividend yield | Formula versionata; non adatta a tutti i settori. |
| Economic Value Added | C | Statements + WACC | NOPAT meno capitale investito * WACC; WACC richiede assunzioni/market inputs. |
| EV/Sales fair value | C/A | Enterprise value/revenue + peer multiple | Il ratio corrente è Yahoo; una stima di fair value richiede peer benchmark affidabile. |
| Average fair value/upside | C | Modelli sopra + current price | Escludere modelli senza input, non sostituirli con zero. |
| Altman Z-Score | C | Statements + market cap | Formula per tipologia impresa; serie storica solo se tutti gli input sono disponibili. |
| Piotroski F-Score / Beneish M-Score | C | Statements storici | Le tab sono presenti ma non collegate a dati; servono formule e test. |
| Value signals | C | Shares, dividends, financial trends | Trend deterministici con periodo dichiarato. |
| Ratios | D/C | `financialData`, `defaultKeyStatistics`, statements | P/E ed EV/Revenue diretti; gli altri diretti o calcolati. |
| Sector comparisons | D parziale/A | `sectorTrend`, `industryTrend`, screener | Copertura e metodologia non garantite; per benchmark stabile usare provider alternativo. |
| Revenue per prodotto/segmento | A | Non disponibile in forma uniforme | SEC XBRL/filings parser per USA o provider fundamentals segmentato; mapping top 4 + Other per non cambiare il grafico. |
| Earnings transcripts completi | A | Non supportati | Provider transcript con licenza o ingestione da Investor Relations, nel rispetto dei diritti. |

### 6.6 Calendario, politica e news

| Campo UI | Classe | Metodo Yahoo | Trasformazione |
|---|---:|---|---|
| Earnings/dividend/split events | D | `calendarEvents`, `chart.events` | Normalizzare a ISO date e timezone. |
| IPO e corporate events | D parziale | `quote`, `search`, `insights` | Non assumere copertura completa. |
| Eventi macroeconomici | A | Nessuno | Provider calendario macro dedicato. |
| Eventi personali/portfolio | N | Nessuno | Database applicativo. |
| Segnale giornaliero del calendario | C | Analytics interno | Aggregare segnali per strumenti seguiti. |
| Titolo/descrizione evento | C/A/N | Dati evento + template/editorial | Template deterministico o content provider. |
| Political trades e relativo chart | A | Nessuno | Dataset ufficiali di disclosure o provider politico-finanziario dedicato. |
| News: id, titolo, publisher, link, data, related tickers, thumbnail | D | `search(symbol, { newsCount })` | `uuid` -> id, `providerPublishTime` -> data, conservare link e validarne protocollo. |
| Testo integrale articoli | A | Non supportato | Provider/licenza editoriale; non fare scraping. |
| Recap/briefing narrativo | N/A | Non supportato direttamente | Summarization server-side su contenuti licenziati oppure redazione; citazioni e provenienza obbligatorie. |

## 7. Matrice per pagina e componente

### Profili di cache usati nella matrice

- **CFG**: config/brand, memoria + build/config; revalidate 24 h o on-demand.
- **Q15**: quote e market state; 15 s a mercato aperto, 60 s a mercato chiuso, expire 5 min.
- **I30**: OHLC intraday; 30 s, expire 5 min.
- **H6**: storico daily; revalidate 6 h per periodo corrente, 7 giorni per segmenti storici chiusi.
- **F12**: profilo/fondamentali; revalidate 12 h, expire 7 giorni.
- **E1**: eventi/earnings; revalidate 1 h, expire 24 h.
- **S10**: ricerca; 10 min per query normalizzata, negative-cache 30 s.
- **N5**: news metadata; revalidate 5 min, expire 1 h.
- **A6**: analytics derivate; stessa versione dello storico, revalidate 6 h.
- **USR**: dati utente; nessuna cache condivisa tra utenti, invalidazione dopo mutazione.

### Fallback usati nella matrice

- **LK/M**: last-known-good valido; se assente, slice equivalente del mock provider.
- **M**: mock/config applicativa; non tentare Yahoo.
- **EMPTY/M**: risultato vuoto se la UI lo gestisce, altrimenti mock della sola slice.
- **ALT/M**: provider alternativo; se non configurato, mock della slice.
- **404**: strumento non valido dopo conferma del resolver; usare pagina not-found, non dati di un altro ticker.

| Pagina / componente | Dato richiesto | Metodo Yahoo | Trasformazione | Aggiornamento / cache | Fallback |
|---|---|---|---|---|---|
| `TerminalLayout` -> `AppShell` | brand, primary instrument, quick results, market state/close countdown | `search`, `quote`, `chart.meta` | Compose config + risultati normalizzati + calcolo timezone | Q15 + S10 + CFG | LK/M |
| `LoginPage`, `RegisterPage` -> `AuthForm` | brand | Nessuno | Config applicativa | CFG | M |
| `Footer` | brand e testo legale | Nessuno | Config applicativa | CFG | M |
| `DashboardPage` market pulse | prezzi/variazioni indici, VIX, yield | `quote` batch | Registry simboli e formatter per unità | Q15 | LK/M |
| `DashboardPage` metric cards | portfolio, segnali, eventi | `quote`, `calendarEvents` + app/analytics | Join posizioni, calcoli, aggregazioni | Q15 + E1 + USR | LK/M |
| `DashboardPage` -> `MainPriceChart` | spotlight history | `chart` | OHLC -> `TimePoint[]` | H6 | LK/M |
| `DashboardPage` watchlist | membership, quote, change | `quote` batch | Join preservando ordine | Q15 + USR | LK/M |
| `DashboardPage` briefing | title/body | Nessuno diretto | Editorial/summarization separata | 30–60 min, cache contenuto | ALT/M |
| `SearchPage` -> `SearchView` | azioni, ETF, indici, forex, crypto e prezzo | `search`, poi `quote` batch | Tipo, venue, currency, route; query server-side futura | S10 + Q15 | EMPTY/M |
| `WatchlistsPage` -> `WatchlistView` | righe watchlist | `quote` batch | Membership app + quote + segnale analytics | Q15 + USR + A6 | LK/M |
| `PortfolioPage` -> `AllocationChart` | posizioni e current price | `quote` batch | Value/allocation/return e FX | Q15 + USR | LK/M |
| `CalendarPage` -> `CalendarView` | date, eventi, segnali | `calendarEvents`, `chart.events` | ISO date -> griglia; unione macro/user; signal engine | E1 + A6 + USR | ALT/M |
| `InstrumentLayout` -> `InstrumentShell` | profile, quote, range, volume, market status, earnings | `quote`, `quoteSummary` | Resolver symbol, mapper profile e calcolo daysUntil | Q15 + F12 + E1 | LK/M oppure 404 |
| `InstrumentChartPage` -> `MainPriceChart` | OHLCV e reference price | `chart`, `quote` | Range/interval -> `TimePoint`; open diretto | I30/H6 + Q15 | LK/M |
| `OverviewPage` -> `MainPriceChart` | price + selected financial comparison | `chart`, `fundamentalsTimeSeries` | Allineamento temporale/scaling | H6/F12 | LK/M |
| `OverviewPage` return cards | ritorni multi-periodo | `chart` | Adjusted-close returns | A6 | LK/M |
| `DrawdownChart` | drawdown series | `chart` | Running peak formula | A6 | LK/M |
| `AnnualPerformanceChart` | annual returns | `chart` | Group by exchange year | A6 | LK/M |
| `DividendChart` | dividend history | `chart.events`/`historical` | Date/amount per share | H6 | LK/M |
| `InsiderTable` | insider transactions | `quoteSummary.insiderTransactions` | Map e deduplica; partial coverage | F12 | EMPTY/M |
| `SeasonalityPage` -> `SeasonalityChart` | current, average, analogue e KPI | `chart` | Analytics stagionale | A6 | LK/M |
| `PatternPage` -> `PatternChart`, `PatternCasesTable` | pattern series/cases/probability | `chart` | Pattern engine versionato | A6 | LK/M |
| `ObosPage` -> `MarketGauge`, `AdvancedDpoChart`, `OscillatorChart` | mood, DPO, oscillator, volume | `chart` | Indicator engine versionato | I30 per breve; A6 per storico | LK/M |
| `FundamentalsAnalysisPage` -> `SummaryPanel` | dividend dates/rate, earnings, cap, EPS, PE, close | `quote`, `quoteSummary` | Numeric-first -> stringhe correnti | Q15 + E1 + F12 | LK/M |
| `FinancialHighlightsCharts` | revenue, income, FCF, ROE, debt, margin | `fundamentalsTimeSeries`, `financialData` | Period normalization e ratios | F12 | LK/M |
| `FairValueSection` | 4 fair values, media, upside | Yahoo solo per input | Valuation engine con assunzioni | F12/A6 | M se modello non validato |
| `SoliditySection` -> `ScoreChart` | Altman series/score | Yahoo solo per input | Score engine per settore/tipo | F12/A6 | M |
| `ValueGenerationSection` -> `SharesChart` | shares e value signals | `fundamentalsTimeSeries`, `netSharePurchaseActivity` | Trend shares/buyback/dividendi | F12/A6 | LK/M |
| `RevenueSection` -> `RevenueMixCharts` | revenue per prodotto/anno | Nessuno uniforme | Provider segmenti; top 4 + Other | 24 h/quarterly | ALT/M |
| `StatementsPage` | statement periods/rows e quality cards | `fundamentalsTimeSeries` | Annual/quarterly/TTM, currency e scale; quality derivata | F12 | LK/M |
| `RatiosPage` -> `RatioChart` | ratios e confronti settore | `financialData`, statistics | Direct/calc; peer comparison separata | F12 | LK/M o ALT/M per peers |
| `TranscriptsPage` -> `TranscriptsView` | transcript completo | Nessuno | Provider/licenza transcript | Dopo earnings; cache lunga | ALT/M |
| `PoliticalPage` -> `PoliticalView`, `PoliticalChart`, `PoliticalTable` | trade politici | Nessuno | Provider dedicato + join su OHLC Yahoo | 6–24 h | ALT/M |
| `NewsPage` -> `NewsView` articles | headline, publisher, date, link | `search(...newsCount)` | Map UUID, date e URL; deduplica | N5 | EMPTY/M |
| `NewsPage` -> `NewsView` recaps | briefing narrativo | Nessuno diretto | Editorial/summarization su fonti lecite | 30–60 min | ALT/M |
| `RangeControls` | selezione range | Nessuna chiamata diretta | In futuro query URL/internal route; mai Yahoo dal client | Dipende dal dataset | Mantiene dati correnti |
| `PeriodToggle` | annual/quarterly | Nessuna chiamata diretta | In futuro query URL/internal route | F12 | Periodo annuale |
| `DateStepper` | data pattern | Nessuna chiamata diretta | Rimuovere data base hardcoded nel mapper/futura query | A6 | Ultima data disponibile |
| `SettingsPage` | profilo/preferenze | Nessuno | Database/app state | USR | Stato locale/mock |

I grafici in `src/components/charts/market-charts.tsx` restano puri: ricevono array tramite props, non conoscono Yahoo e non devono essere modificati per il fetch. Gli eventuali mapper devono produrre esattamente le chiavi già consumate da Recharts.

## 8. Mock e valori hardcoded fuori dal dataset centrale

Oltre a `src/data/mock/dataset.ts`, l'audit ha individuato dati o semantiche mock direttamente nell'UI. Dovranno essere spostati nel service/analytics layer durante la migrazione, senza cambiare il layout:

- `InstrumentChartPage`: “Open” calcolato come `price - change`; va sostituito con `regularMarketOpen`.
- `StatementsPage`: card `Balance Sheet: Strong`, `Cash Flow: $96.8B`, `Earnings Quality: High` hardcoded.
- `WatchlistView`: aggiunta demo `CRST` hardcoded e stato soltanto locale.
- `AppShell`: data “Thursday · 06 August” hardcoded.
- `DateStepper`: data base agosto 2026 hardcoded.
- `InstrumentShell`: label `LIVE MOCK` e alert statici.
- `SearchView`: label “Mock price” e testo universe statico.
- `Footer`: testo “No live financial data”.
- `TranscriptsView`: label “Full mock transcript”.
- `CalendarView`, `SeasonalityPage`, `PortfolioPage`, `not-found` e auth: copy che descrive esplicitamente dati mock/statici.
- `RevenueYear`: categorie `compute/data/networking/gaming` rigide e specifiche dell'azienda demo.
- `PoliticalTrade.party`: union fittizia `Civic | Union`, incompatibile con dati reali.
- Formatter di Search/Watchlist/Portfolio: assumono spesso USD perché i DTO riga non portano la valuta.
- `StatementsPage`: intestazione hardcoded `USD billions`, non adatta a ticker internazionali.

Queste correzioni sono semantiche e di mapping; non richiedono cambiamenti di griglia, colore, altezza o composizione visuale. I testi “mock” non devono però essere presentati come veri una volta che una slice è live: la rimozione/sostituzione delle label sarà una fase esplicita e controllata, mantenendo lo stesso ingombro visuale.

## 9. Gestione ticker internazionali

`InstrumentRef { market, symbol }` non è sufficiente a derivare in modo sicuro un ticker Yahoo. Va introdotto internamente un `SymbolResolver` con un registry esplicito:

```ts
type ResolvedInstrument = {
  routeMarket: string;
  routeSymbol: string;
  yahooSymbol: string;
  exchange?: string;
  currency?: string;
  locale?: string;
};
```

Esempi di simboli Yahoo da supportare e verificare tramite `search`, non da concatenare alla cieca:

- USA: `AAPL`, `NVDA`.
- Borsa Italiana: `ENI.MI`.
- Londra: `SHEL.L`.
- Germania/Xetra: suffissi come `.DE` quando restituiti da Search.
- Canada: `.TO`; Giappone: `.T`; Hong Kong: `.HK`.
- Indici: `^GSPC`, `^NDX`, `^VIX`.
- Criptovalute: `BTC-USD`.
- Forex: `EURUSD=X`.
- Futures: `GC=F`, `CL=F`.

Regole:

1. La route mantiene slug leggibili e stabili; `yahooSymbol` resta un dettaglio del resolver.
2. `search` è la fonte per exchange/symbol canonico.
3. ADR, dual listing e share class devono avere record distinti.
4. Non rimuovere caratteri speciali dal ticker prima della risoluzione.
5. Cache del resolver: 24 ore; invalidazione manuale per corporate action o rename.
6. Se il mapping è ambiguo, non usare i dati di un ticker “simile”: fallback mock controllato o 404.
7. L'identità demo `HLIO / Helio Systems` non deve essere collegata implicitamente ai dati di un emittente reale. Serve una mappatura prodotto esplicita e una decisione editoriale sul nome mostrato.

## 10. Strategia di caching

### 10.1 Livelli

1. **Deduplicazione intra-request**: memoizzare Promise identiche per `{method, symbol, options}`; più componenti della stessa renderizzazione non devono generare fetch duplicati.
2. **Batch quote**: un'unica `quote([...symbols])` per pulse, watchlist e portfolio; `quoteCombine` per richieste concorrenti.
3. **Next.js Data Cache**: funzioni cache server-side con chiavi versionate e tag (`quote:NVDA`, `history:NVDA:1d`, `fundamentals:NVDA`). In Next.js 16 preferire Cache Components/`use cache` + `cacheLife`; se l'adozione viene rimandata, isolare temporaneamente `unstable_cache` dietro un adapter perché è deprecato in favore di `use cache`.
4. **Cache distribuita opzionale**: Redis/KV per rate limiter globale, last-known-good e coalescing cross-instance. Necessaria quando il traffico supera una singola istanza serverless.
5. **Cache analytics**: chiave composta da versione algoritmo + hash/versione dell'input storico; invalidare quando cambia uno dei due.

### 10.2 Freshness e stale-if-error

| Dato | Freshness normale | Stale massimo in errore |
|---|---:|---:|
| Quote/market state | 15 s open, 60 s closed | 5 min; oltre, passare al mock e registrare la degradazione. |
| Intraday OHLC | 30 s | 10 min. |
| Storico daily | 6 h | 7 giorni. |
| Profilo azienda | 24 h | 30 giorni. |
| Fondamentali | 12 h | 30 giorni, purché fiscal period/timestamp siano conservati. |
| Earnings/calendar | 1 h | 24 h. |
| Search | 10 min | 24 h per simboli già risolti. |
| News metadata | 5 min | 1 h. |
| Analytics | TTL dell'input | Ultimo risultato corrispondente alla stessa versione algoritmo. |

Non memorizzare `undefined`, payload invalidi o errori 5xx come dati buoni. Usare negative-cache breve (30–60 s) soltanto per query/simboli non trovati, così si evita una raffica di richieste ripetute.

## 11. Timeout, rate limiting e resilienza

Yahoo non pubblica una quota API per questo accesso non ufficiale. I limiti seguenti sono quindi conservativi e configurabili, non una dichiarazione di quota Yahoo:

### Timeout

- `quote` e `search`: 3 secondi.
- `chart` intraday/daily: 6 secondi.
- `quoteSummary` e `fundamentalsTimeSeries`: 8 secondi.
- Aggregatore pagina: budget massimo 10 secondi; dopo il budget, servire last-known-good/mock per le slice incomplete.
- Implementare timeout con `AbortSignal.timeout()` passato in `fetchOptions`, non soltanto con `Promise.race`.

### Rate limiting

- Coda per processo: massimo 3 richieste Yahoo concorrenti.
- Limite iniziale distribuito: 30 richieste/minuto per deployment, burst massimo 5; rendere i valori configurabili e tararli con metriche reali.
- Search per utente/IP sul Route Handler interno: 10 richieste/minuto, debounce client 300 ms, minimo 2 caratteri.
- Batch quote: massimo 50 simboli per chiamata nel progetto, anche se la libreria supporta batch più grandi.
- Coalescing: tutte le richieste identiche in corso condividono la stessa Promise.
- Circuit breaker: aprire dopo 5 fallimenti upstream consecutivi in 60 s; servire cache/mock per 2 min prima di un probe.

### Retry

- Massimo 2 retry soltanto per timeout di rete, 429 e 5xx.
- Backoff esponenziale con jitter, indicativamente 250–500 ms e 750–1.500 ms.
- Rispettare `Retry-After` se presente.
- Nessun retry per symbol not found, opzioni invalide o schema response non valido.

## 12. Error handling e fallback mock

Introdurre errori tipizzati nel service layer:

```ts
type FinancialProviderErrorCode =
  | "SYMBOL_NOT_FOUND"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "PARTIAL_DATA"
  | "UNSUPPORTED_ASSET";
```

Policy:

1. Validare sempre il risultato di `yahoo-finance2` e poi validare nuovamente il DTO di dominio nei mapper critici.
2. Usare `Promise.allSettled` negli aggregatori di dashboard/fundamentals: una news fallita non deve eliminare una quote valida.
3. Applicare fallback per singola slice o campo, non sostituire l'intera pagina se fallisce un dato secondario.
4. Ordine fallback: fresh cache -> upstream -> last-known-good -> provider alternativo -> mock della stessa slice.
5. Non mescolare silenziosamente ticker differenti o valute differenti.
6. Allegare internamente a ogni snapshot `source`, `asOf`, `isStale`, `fallbackReason` e `providerSymbol`; la UI può ignorare questi metadata nella prima fase.
7. Log strutturati senza cookie, token, query sensibili o payload completi; metriche per hit/miss, latency, retry, fallback e coverage null.
8. Se manca il ticker primario e non esiste un mock esplicito corrispondente, usare 404 invece di mostrare dati ingannevoli.

## 13. Evoluzione dei tipi senza modificare la grafica

Durante l'implementazione sarà necessario estendere internamente i dati, mantenendo compatibili le props correnti:

- Aggiungere `currency` a righe search, watchlist e portfolio.
- Aggiungere `regularMarketOpen`, quote timestamp e `isDelayed` allo snapshot.
- Conservare date ISO e formattarle soltanto nel mapper/view layer.
- Aggiungere currency e scale agli statements invece di hardcodare `USD billions`.
- Rendere generici i segmenti revenue, poi mapparli nei quattro slot visuali esistenti + Other.
- Aggiungere URL alle news; il bottone esistente può diventare link senza cambiare aspetto.
- Aggiungere un input/query object opzionale per range, interval, annual/quarterly, date e paging.
- Tenere metadata di provenienza opzionali e non renderizzati.

La compatibilità può essere preservata introducendo mapper `Yahoo -> normalized domain -> existing page DTO`; i componenti continuano a ricevere la stessa forma finché non sarà necessario attivare controlli realmente dinamici.

## 14. Sequenza di implementazione proposta

1. Installare e fissare `yahoo-finance2@4.0.0`; creare istanza server-only con queue, validation e timeout.
2. Aggiungere errori, telemetry, cache adapter e mock fallback senza cambiare il provider attivo.
3. Implementare `SymbolResolver` e testare azioni USA/internazionali, ETF, indici, crypto, forex e futures.
4. Implementare e testare mapper `quote`, `search` e `chart` con fixture registrate, non con rete nei test ordinari.
5. Attivare progressivamente quote/stato mercato per InstrumentShell, Dashboard, Watchlist e Portfolio.
6. Attivare search tramite Route Handler interno; nessuna chiamata Yahoo dal client.
7. Attivare storico/OHLC e alimentare i grafici esistenti.
8. Aggiungere analytics pure: returns, drawdown, annual performance e seasonality.
9. Integrare profilo, earnings, dividendi, insider e fondamentali disponibili.
10. Implementare indicatori/pattern/fair value soltanto dopo una specifica matematica e test su dataset noti.
11. Collegare news metadata Yahoo; non fingere supporto per body/recap.
12. Integrare provider alternativi per transcript, politica, macro e segmenti oppure mantenere fallback mock esplicito.
13. Eseguire contract test `MockFinancialDataProvider` vs facade composita, lint, typecheck, build ed E2E visual regression.

## 15. Criteri di verifica

- Nessun import `yahoo-finance2` in file `"use client"`.
- Nessuna richiesta browser verso domini Yahoo nel pannello Network.
- Una sola richiesta quote batch per blocco dashboard, non una per riga.
- Grafici con stessi contenitori, assi, colori e proporzioni di oggi.
- Valuta, timezone e ticker corretti per almeno: azione USA, azione italiana, ETF, indice e crypto.
- Cache hit verificabile; timeout e 429 producono fallback senza pagina bianca.
- Dati null/strumenti delistati non rompono rendering o build.
- Ogni valore calcolato ha formula, versione, input e test.
- Ogni snapshot possiede un timestamp e una provenienza interna.
- Build di produzione eseguita senza rete nei test statici grazie a fixture/mock.

## 16. Funzionalità non alimentabili direttamente da Yahoo Finance

Le seguenti funzionalità dell'interfaccia **non possono essere alimentate direttamente** da Yahoo Finance:

1. Brand Kairo, testi prodotto, utente, preferenze e autenticazione.
2. Membership delle watchlist, azioni add/remove e persistenza.
3. Posizioni del portfolio, quantità, prezzo medio, cash flow e cost basis.
4. Segnali BUY/HOLD/SELL, signal balance e constructive percent.
5. Seasonality, analogue year e relative statistiche: sono calcoli interni.
6. Pattern probability, robustness, strength, historical cases e correlated event: sono analytics proprietarie.
7. Advanced DPO, Wyckoff, Speed, oscillatore e Market Mood Meter: Yahoo fornisce solo OHLCV di input.
8. Fair value DCF/Peter Lynch/EVA/EV-Sales e relativi giudizi: richiedono modelli e assunzioni interne; alcuni benchmark richiedono altre fonti.
9. Altman/Piotroski/Beneish e “Earnings Quality”: sono calcoli, non campi Yahoo pronti.
10. Revenue per prodotto/segmento in forma uniforme: richiede filing/XBRL o provider specializzato.
11. Transcript completi delle earnings call: richiedono provider/licenza dedicata.
12. Political trades: richiedono disclosure pubbliche o provider dedicato.
13. Calendario macroeconomico completo ed eventi personali del portfolio.
14. Corpo integrale degli articoli e briefing/recap narrativi. Yahoo Search supporta realmente soltanto metadata news come titolo, publisher, link, data, related ticker e thumbnail.
15. Tassonomie editoriali come “AI infrastructure” e appartenenza affidabile a indici/temi.
16. Comparazioni settoriali robuste e metodologicamente stabili, se i moduli Yahoo non forniscono copertura sufficiente.

Queste sezioni devono restare mock durante la migrazione oppure essere alimentate da motori di calcolo/provider alternativi dietro la stessa facade. Nessuna di esse giustifica una chiamata Yahoo diretta dal frontend.
