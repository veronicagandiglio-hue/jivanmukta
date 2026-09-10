# /import/gemini — Ponte editoriale Gemini → Jivanmukta

Questa cartella implementa il flusso:

```
GEMINI → CONTENUTO EDITORIALE → APPROVAZIONE UMANA → IMPORTAZIONE → /content → BUILD → SITO
```

Non è un CMS, non ha interfaccia grafica, non tocca il design del
sito né l'architettura di `/content`. È un ponte a riga di comando tra
un file JSON prodotto da Gemini e il modello dati già in uso.

## Struttura

```
import/gemini/
  FORMATO-PACCHETTO.md     ← specifica del formato (da dare a Gemini)
  README.md                ← questo file (uso operativo)
  _scratch/                ← dove incollare le risposte grezze di Gemini (.txt)
  incoming/                ← dove depositare il pacchetto JSON estratto e approvato
  processed/               ← archivio dei pacchetti importati con successo
  rejected/                ← archivio dei pacchetti che hanno generato conflitti
  _tooling/
    estrai-json-gemini.js  ← estrae il blocco JSON dalla risposta grezza di Gemini
    validate-package.js    ← validazione formale, non scrive nulla
    import-gemini.js       ← importazione vera, scrive in /content
```

`incoming/`, `processed/`, `rejected/` sono separate da `/content`:
nessun file qui dentro viene letto dal sito o dal build.

## Flusso operativo passo per passo

1. **Fornisci a Gemini** il file `FORMATO-PACCHETTO.md` (o il suo
   contenuto) come istruzione. Gemini non deve mai vedere `/content`,
   `/content/_index`, o `build-index.js`: lavora solo con la struttura
   descritta lì.

2. **Gemini produce** un pacchetto per una singola opera, come unico
   file JSON. La risposta completa di Gemini (report + blocco JSON)
   va incollata in un file `.txt` dentro `_scratch/`, ad esempio:
   ```
   _scratch/<slug-opera>.txt
   ```

3. **Estrai il JSON** dalla risposta grezza:
   ```bash
   node import/gemini/_tooling/estrai-json-gemini.js import/gemini/_scratch/<slug-opera>.txt import/gemini/incoming/<slug-opera>.json
   ```
   Lo script isola il blocco JSON (Parte B) e lo salva in `incoming/`.
   Se la risposta è già un JSON puro (senza report in prosa), puoi
   copiarlo direttamente in `incoming/` saltando questo passo.

4. **Tu (revisione umana)** leggi e correggi il file JSON in
   `import/gemini/incoming/<slug-opera>.json` quanto necessario.

5. **Valida** (nessuna scrittura, solo controllo):
   ```bash
   node import/gemini/_tooling/validate-package.js import/gemini/incoming/<slug-opera>.json
   ```

6. **Importa** (dry-run consigliato prima):
   ```bash
   node import/gemini/_tooling/import-gemini.js import/gemini/incoming/<slug-opera>.json --dry-run
   node import/gemini/_tooling/import-gemini.js import/gemini/incoming/<slug-opera>.json
   ```
   Durante l'importazione reale, se il pacchetto contiene `candidate_questions`,
   lo script mostra ogni proposta e chiede se approvarla come nuova domanda
   principale della homepage. Rispondendo `s` la domanda viene importata con
   `scope: "global"` e una `homepage_priority` successiva; rispondendo `N`
   resta una proposta in `content/candidate-questions/` e non appare sul sito.
   Se non ci sono conflitti, i file vengono scritti in `/content/...`
   e il pacchetto viene copiato in `import/gemini/processed/`.
   Se ci sono conflitti, nulla viene scritto per le entità in
   conflitto e il pacchetto viene copiato in `import/gemini/rejected/`
   per archivio (l'originale in `incoming/` resta per la correzione).

7. **Ricostruisci gli indici** con lo strumento già esistente del
   progetto (non modificato):
   ```bash
   node build-index.js
   ```
   Questo passaggio esegue anche la validazione referenziale completa
   su tutto `/content` (non solo sul pacchetto appena importato) e
   rigenera tutti i file in `/content/_index/`.

8. **Verifica visivamente** che il sito mostri il nuovo contenuto
   (le pagine leggono `/content` tramite `content-engine.js`, che non
   è stato toccato).

## Cosa fa l'importatore, in sintesi

- Ogni entità del pacchetto diventa un file in `/content/<tipo>/<id>.json`,
  **solo se quell'id non esiste già**.
- Se l'id esiste già con **contenuto identico** → nessuna scrittura,
  segnalato come "già esistente, invariato".
- Se l'id esiste già con **contenuto diverso** → **conflitto**,
  nessuna scrittura per quell'entità, importazione segnalata come
  fallita per quell'entità specifica (mai sovrascrittura silenziosa).
- L'opera (`work`) è un caso speciale: se esiste già, il pacchetto
  **aggiunge** le nuove `editorial_units` all'elenco esistente
  (`work.editorial_units`) e questo viene trattato come un
  **aggiornamento additivo consentito**, non come conflitto — a patto
  che tutti gli altri campi del work restino identici. Se il pacchetto
  propone anche una modifica a un campo diverso da `editorial_units`
  (es. un `title` cambiato), quello resta un conflitto vero e proprio,
  segnalato e non scritto.
- Gli indici in `/content/_index/` **non vengono mai toccati**
  dall'importatore: sono generati esclusivamente da `build-index.js`,
  che va sempre eseguito come passo successivo.

### Idempotenza: cosa si può ripetere e cosa no

- **authors, concepts, questions, commentaries, notes**: se rieseguito
  con lo stesso pacchetto e contenuto identico, l'importazione è
  idempotente (nessun duplicato, nessun errore) — perché queste
  entità possono legittimamente essere referenziate/estese da più
  pacchetti nel tempo (es. lo stesso autore citato in opere diverse).
- **editorial_units e passages**: sono trattate come **sempre nuove
  per definizione**. Una volta importate, un pacchetto che dichiari
  di nuovo lo stesso `unit.id` o lo stesso `passage.id` viene
  **respinto dalla validazione**, anche se il contenuto è identico
  parola per parola. Questo è intenzionale: un'unità editoriale o un
  passaggio già pubblicati non devono mai essere ridefiniti tramite
  il normale flusso di importazione, per evitare che una rielaborazione
  di Gemini sullo stesso locus sovrascriva silenziosamente una
  versione già approvata. Per correggere un'unità o un passaggio già
  presente serve un intervento manuale esplicito su quel file, non
  una nuova esecuzione dell'importatore.
- Di conseguenza, **rieseguire l'importazione dello stesso pacchetto
  di un'opera già importata fallirà in validazione** se quel pacchetto
  contiene di nuovo le stesse unità/passaggi — è il comportamento
  corretto, non un bug. Per aggiungere nuovo materiale alla stessa
  opera, il pacchetto successivo deve contenere solo le NUOVE unità
  editoriali (con nuovi `unit.id` e `passage.id`), non ripetere quelle
  già importate.

## Cosa fare in caso di conflitto

Un conflitto significa: "esiste già qualcosa con questo id, e non è
uguale a quanto proposto". L'importatore non decide da solo quale
versione tenere. Occorre:

1. Aprire il file esistente in `/content/<tipo>/<id>.json` e
   confrontarlo manualmente con il pacchetto.
2. Se la versione del pacchetto è quella corretta, effettuare
   l'aggiornamento **esplicitamente** (modifica manuale del file, o
   nuovo pacchetto con un id diverso se si tratta di contenuto
   realmente distinto) — mai tramite una nuova esecuzione automatica
   dell'importatore, che per princìpio non sovrascrive.
