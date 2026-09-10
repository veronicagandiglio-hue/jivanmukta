# Formato del pacchetto editoriale Gemini → Jivanmukta

Questo documento definisce l'unico formato che Gemini deve conoscere.
Gemini NON deve conoscere né produrre la struttura tecnica interna del
sito (`/content/works`, `/content/editorial-units`, `/content/_index`,
ecc.). Quella conversione è compito esclusivo dell'importatore
(`import-gemini.js`), gestito da Claude.

Il pacchetto è un formato di **interscambio editoriale**, indipendente
dai JSON interni del sito. È deliberatamente più semplice e più
"umano" del modello dati definitivo: un unico file JSON per ogni opera,
scritto da Gemini, letto e verificato da un umano, poi convertito da
Claude.

---

## 1. Dove va il pacchetto

Ogni pacchetto approvato va depositato come singolo file JSON in:

```
/import/gemini/incoming/<slug-opera>.json
```

Esempio: `/import/gemini/incoming/taittiriya-upanishad.json`

Dopo l'importazione, l'importatore sposta il file in:

- `/import/gemini/processed/` — se l'importazione ha avuto successo;
- `/import/gemini/rejected/` — se la validazione ha rifiutato il pacchetto
  (il file NON viene toccato nel contenuto, solo copiato per archivio;
  l'originale in `incoming/` resta per permettere la correzione).

`/import/gemini/` è del tutto separata da `/content/`: nulla in questa
cartella viene letto dal sito o dal build-index. È solo l'area di
scambio tra Gemini, il controllo umano e l'importatore.

---

## 2. Struttura di un pacchetto (una singola opera)

Un pacchetto è un oggetto JSON con questa forma:

```jsonc
{
  "package_format": "jivanmukta-gemini-editorial-v1",   // fisso, obbligatorio
  "work": {
    "id": "taittiriya-upanishad",           // slug stabile, kebab-case
    "title": "Taittirīya Upaniṣad",
    "short_title": "Taittirīya",             // opzionale
    "language": "sanscrito",
    "attribution": "Tradizione śruti ...",   // opzionale
    "editorial_note": ["...", "..."],        // opzionale, array di stringhe
    "details": { "structure": "...", "commentary": "...", "language": "..." }, // opzionale, libero
    "chapters_outline": [ /* opzionale, stessa forma già usata nel sito */ ]
  },

  "authors": [
    {
      "id": "shankara",                      // se l'id esiste già, viene solo collegato
      "name": "Śaṅkara",
      "transliteration": "शङ्कर",
      "role": "bhāṣyakāra",
      "role_description": "...",
      "context": "...",
      "concepts": ["brahman"],                // id di concetti citati in questo pacchetto o già esistenti
      "related_authors": []
    }
  ],

  "editorial_units": [
    {
      "id": "taittiriya-1-1",                // slug stabile, univoco nel sito
      "unit_locus": "I.1",
      "unit_title": "...",
      "sections": [
        {
          "section_locus": "I.1.1",
          "section_title": "...",
          "passages": [
            {
              "id": "tait-1-1-1",             // slug stabile, univoco in tutto il sito
              "original": "... testo sanscrito ...",
              "translation": "... traduzione italiana ...",
              "source": "Taittirīya Upaniṣad, I.1.1",
              "editorial_status": "..."        // opzionale, nota libera
            }
          ]
        }
      ]
    }
  ],

  "concepts": [
    {
      "id": "satya",
      "name": "Satya",
      "transliteration": "सत्य",
      "gloss": "...",
      "passages": ["tait-1-1-1"],              // id di passaggi DI QUESTO o altri pacchetti già importati
      "related_concepts": [],
      "authors": []
    }
  ],

  "questions": [
    {
      // ID di una domanda già esistente nell'indice globale delle domande di Jivanmukta,
      // oppure nuova domanda specifica figlia di una domanda globale.
      "id": "q-che-cose-brahman",
      "passages": ["tait-1-1-1"]               // i passaggi di quest'opera che rispondono a questa domanda
    },
    {
      "id": "che-cose-satya",
      "type": "specific",                       // specific | great | comparison
      "text": "...",
      "problem": "...",
      "parent_question": "q-che-cose-brahman",  // rimanda a una grande domanda globale esistente
      "concepts": ["satya"],
      "passages": ["tait-1-1-1"],
      "commentaries": [],
      "related_questions": []
    }
  ],

  "candidate_questions": [
    // Nuove grandi domande proposte per Jivanmukta, MA non ancora approvate.
    // L'utente deciderà se approvarle e renderle globali.
    {
      "id": "q-nuova-domanda-proposta",
      "type": "great",
      "text": "...",
      "problem": "...",
      "concepts": ["satya"],
      "passages": ["tait-1-1-1"]
    }
  ],

  "explanations": [
    {
      "id": "expl-tait-1-1-1",
      "target_type": "passage",                 // passage | unit | work | question | concept
      "target_id": "tait-1-1-1",
      "title": "Titolo della spiegazione",      // opzionale
      "sections": [
        {
          "heading": "Il contesto del passo",   // opzionale
          "text": "Spiegazione rigorosa, metafisica, tradizionale, comprensibile al lettore comune senza psicologizzazioni."
        }
      ],
      "editorial_status": "draft"               // opzionale: draft | established
    }
  ],

  "commentaries": [
    {
      "id": "shankara-su-tait-1-1-1",
      "author_id": "shankara",
      "passages": ["tait-1-1-1"],
      "text": "...",
      "editorial_status": "..."
    }
  ],

  "notes": [
    {
      "id": "nota-satya",
      "term": "satya",
      "passages": ["tait-1-1-1"],
      "text": "...",
      "editorial_status": "..."
    }
  ],

  "relations": {
    "related_works": [
      // collegamenti facoltativi con altre opere già presenti nel sito,
      // usati solo a scopo di verifica/reporting in questa fase — non
      // creano un campo nel modello /content (che non ha oggi un
      // "opera collegata a opera" nativo). Se in futuro servirà,
      // andrà introdotto separatamente, senza toccare questo importatore
      // senza una richiesta esplicita.
      { "work_id": "brhadaranyaka-upanishad", "why": "..." }
    ]
  },

  "notes_for_reviewer": [
    "Eventuali segnalazioni che Gemini vuole portare all'attenzione di chi approva, es. passaggi incerti, fonti da verificare."
  ]
}
```

### Campi obbligatori per ogni tipo di record

- **work**: `id`, `title`, `language`
- **editorial_units[]**: `id`, `unit_locus`, `sections[]`; ogni section:
  `section_locus`, `passages[]`; ogni passage: `id`, `translation`, `source`
  (`original` può essere stringa vuota se il testo originale non è ancora
  disponibile, come già accade nel sito per `mandukya-4-99`)
- **authors[]**: `id`, `name`
- **concepts[]**: `id`, `name`
- **questions[]**: `id` (e se nuova domanda: `type`, `text`)
- **explanations[]**: `id`, `target_type`, `target_id`, `sections[]`
- **commentaries[]**: `id`, `author_id`, `text`
- **notes[]**: `id`, `term`, `text`

Tutte le altre chiavi mostrate sopra sono opzionali. Array vuoti o
assenti sono equivalenti.

### Regole di identità (ID)

- Ogni `id` deve essere **kebab-case**, stabile, e — a parte
  `work.id` — univoco in tutto il sito, non solo nel pacchetto.
- Se un `id` proposto da Gemini **coincide** con un'entità già
  presente nel sito (es. l'autore `shankara`, il concetto `brahman`),
  l'importatore la tratta come **riferimento**, non come nuova
  creazione: non sovrascrive nulla a meno che il contenuto differisca
  (vedi §5 dell'importatore, "conflitti").
- I passaggi (`passages[].id`) devono essere nuovi in assoluto: non è
  previsto redefinire un passaggio già esistente tramite un pacchetto.
  Se serve correggere un passaggio esistente, va fatto con una
  richiesta esplicita separata dall'importazione ordinaria.

### Cosa Gemini NON deve mai produrre

- I file di `/content/_index/*` (indici derivati, generati solo dal
  build).
- Riferimenti diretti a "source_file" o percorsi del sito.
- Relazioni inverse (es. `passage-questions`): quelle si derivano
  sempre automaticamente durante il build, mai a mano.

---

## 3. Validazione minima richiesta prima dell'importazione

Un pacchetto è "valido" se supera **tutti** questi controlli (l'elenco
completo, con i codici di errore esatti, è implementato in
`_tooling/validate-package.js`):

1. È un JSON sintatticamente corretto.
2. Ha `package_format: "jivanmukta-gemini-editorial-v1"`.
3. Ha un blocco `work` con `id`, `title`, `language`.
4. Ogni `editorial_units[].sections[].passages[]` ha `id`, `translation`, `source`.
5. Ogni ID dichiarato nel pacchetto è **kebab-case** valido.
6. Nessun ID di passaggio nel pacchetto coincide con un passaggio già
   esistente nel sito (nessuna redefinizione implicita).
7. Ogni riferimento incrociato **all'interno del pacchetto** (es. un
   concetto che cita un `passages: [...]`) punta a un passaggio
   effettivamente presente nello stesso pacchetto o già esistente sul
   sito — mai a un ID inventato.
8. Ogni passaggio citato da una `editorial_unit` appartiene a quella
   stessa opera (nessun passaggio "in prestito" da un'altra opera).
9. Nessun ID duplicato all'interno del pacchetto stesso.

La validazione **non** verifica la qualità filologica o dottrinale del
contenuto: quella resta responsabilità della revisione umana.
