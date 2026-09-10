/**
 * content-engine.js — Content Engine (fase: layer di accesso frontend)
 * =====================================================================
 * Layer comune tra le pagine del sito e gli indici generati da
 * build-index.js (/content/_index/*.json).
 *
 * Le pagine che usano questo modulo non devono conoscere:
 *   - la struttura interna degli indici
 *   - i percorsi dei file sotto /content
 *   - la logica di fetch (caricamento, cache, gestione errori)
 *   - la logica di risoluzione delle relazioni
 *
 * Le pagine chiedono un'entità o una relazione per id e ricevono
 * sempre un oggetto "risultato" con la stessa forma, mai un'eccezione
 * da dover intercettare caso per caso:
 *
 *   { status: 'ok',          data: <entità o array di id> }
 *   { status: 'not-found',   id: <id richiesto> }
 *   { status: 'unavailable', message: <motivo del mancato caricamento> }
 *
 * La distinzione tra 'not-found' e 'unavailable' è quella richiesta:
 *   - 'not-found'   → l'indice si è caricato correttamente, ma l'id
 *                     richiesto non esiste in questo Vertical Slice.
 *   - 'unavailable' → l'indice stesso non si è potuto caricare
 *                     (rete assente, file mancante, JSON malformato,
 *                     risposta HTTP non ok). Il contenuto potrebbe
 *                     esistere, ma qui non è possibile saperlo.
 *
 * Il Content Engine NON contiene logica grafica e NON tocca il DOM:
 * si occupa solo di caricamento, cache, risoluzione delle relazioni
 * e accesso ai dati. Le pagine restano libere di presentare i
 * risultati come preferiscono.
 *
 * Vanilla JavaScript, nessuna dipendenza. Funziona sia nel browser
 * (window) sia in Node (globalThis), perché non usa mai `window`
 * direttamente: si appoggia solo a `fetch`, disponibile in entrambi
 * gli ambienti.
 * =====================================================================
 */
(function (global) {
  'use strict';

  // ============================================================
  // Configurazione
  // ============================================================

  // Percorso della cartella /content, relativo alla pagina che carica
  // questo script — stessa convenzione già in uso nel Vertical Slice
  // (vedi slice.js: const base = 'content/').
  let basePath = 'content/';

  /**
   * Permette di personalizzare dove si trova la cartella /content,
   * per pagine che non la hanno come sibling diretto.
   * @param {{ basePath?: string }} options
   */
  function configure(options) {
    if (options && typeof options.basePath === 'string') {
      basePath = options.basePath.endsWith('/') ? options.basePath : options.basePath + '/';
    }
  }

  // ============================================================
  // Stati dei risultati
  // ============================================================

  const STATUS = Object.freeze({
    OK: 'ok',
    NOT_FOUND: 'not-found',
    UNAVAILABLE: 'unavailable'
  });

  function ok(data) {
    return { status: STATUS.OK, data };
  }

  function notFound(id) {
    return { status: STATUS.NOT_FOUND, id };
  }

  function unavailable(message) {
    return { status: STATUS.UNAVAILABLE, message };
  }

  // ============================================================
  // Caricamento indici (con cache)
  // ============================================================
  //
  // Ogni file di /content/_index viene caricato al più una volta per
  // sessione di pagina: la Promise di caricamento viene messa in
  // cache e riutilizzata da tutte le chiamate successive, anche
  // concorrenti.

  const indexCache = new Map(); // fileName -> Promise<object|null>

  async function fetchIndexFile(fileName) {
    try {
      const response = await fetch(basePath + '_index/' + fileName);
      if (!response.ok) {
        console.error(
          `[content-engine] Indice non disponibile (HTTP ${response.status}): ${fileName}`
        );
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error(`[content-engine] Impossibile caricare l'indice: ${fileName}`, error);
      return null;
    }
  }

  function loadIndexFile(fileName) {
    if (!indexCache.has(fileName)) {
      indexCache.set(fileName, fetchIndexFile(fileName));
    }
    return indexCache.get(fileName);
  }

  /**
   * Svuota la cache degli indici. Utile per test o per forzare un
   * ricaricamento dopo una nuova build dei contenuti.
   */
  function clearCache() {
    indexCache.clear();
  }

  // ============================================================
  // Accesso alle entità
  // ============================================================
  //
  // Ogni file _index/<kind>-index.json contiene già il record
  // completo di ogni entità di quel tipo, indicizzato per id
  // (questo è il formato prodotto da build-index.js). Il Content
  // Engine non ha quindi mai bisogno di leggere i file sorgente
  // sotto /content/<tipo>/, solo gli indici generati.

  const ENTITY_INDEX_FILES = {
    question: 'question-index.json',
    concept: 'concept-index.json',
    work: 'work-index.json',
    author: 'author-index.json',
    commentary: 'commentary-index.json',
    note: 'note-index.json',
    passage: 'passage-index.json',
    unit: 'unit-index.json',
    explanation: 'explanation-index.json'
  };

  async function getEntity(kind, id) {
    const fileName = ENTITY_INDEX_FILES[kind];
    const index = await loadIndexFile(fileName);
    if (index === null) {
      return unavailable(`Indice "${kind}" non caricabile (${fileName}).`);
    }
    if (!Object.prototype.hasOwnProperty.call(index, id)) {
      return notFound(id);
    }
    return ok(index[id]);
  }

  /** Restituisce tutte le entità di un tipo nell'ordine dell'indice. */
  async function getEntities(kind) {
    const fileName = ENTITY_INDEX_FILES[kind];
    const index = await loadIndexFile(fileName);
    if (index === null) {
      return unavailable(`Indice "${kind}" non caricabile (${fileName}).`);
    }
    return ok(Object.values(index));
  }

  function getQuestion(id) {
    return getEntity('question', id);
  }

  function getConcept(id) {
    return getEntity('concept', id);
  }

  function getWork(id) {
    return getEntity('work', id);
  }

  function getAuthor(id) {
    return getEntity('author', id);
  }

  function getCommentary(id) {
    return getEntity('commentary', id);
  }

  function getNote(id) {
    return getEntity('note', id);
  }

  function getPassage(id) {
    return getEntity('passage', id);
  }

  function getUnit(id) {
    return getEntity('unit', id);
  }

  function getExplanation(id) {
    return getEntity('explanation', id);
  }

  // ============================================================
  // Accesso alle relazioni (indici inversi derivati)
  // ============================================================
  //
  // Ogni relazione controlla prima che l'entità di partenza esista
  // (propagando 'not-found' / 'unavailable' se necessario), poi legge
  // l'indice della relazione. L'assenza dell'id in un indice di
  // relazione è uno stato valido: significa "nessuna relazione di
  // questo tipo", non un errore — per questo produce sempre 'ok' con
  // un array (eventualmente vuoto), mai 'not-found'.

  const RELATIONS = {
    passageQuestions: { file: 'passage-questions.json', entityKind: 'passage' },
    passageConcepts: { file: 'passage-concepts.json', entityKind: 'passage' },
    passageCommentaries: { file: 'passage-commentaries.json', entityKind: 'passage' },
    passageNotes: { file: 'passage-notes.json', entityKind: 'passage' },
    passageExplanations: { file: 'passage-explanations.json', entityKind: 'passage' },
    questionExplanations: { file: 'question-explanations.json', entityKind: 'question' },
    conceptQuestions: { file: 'concept-questions.json', entityKind: 'concept' },
    conceptRelatedConcepts: { file: 'concept-related-concepts.json', entityKind: 'concept' },
    workPassages: { file: 'work-passages.json', entityKind: 'work' },
    workQuestions: { file: 'work-questions.json', entityKind: 'work' },
    authorConcepts: { file: 'author-concepts.json', entityKind: 'author' },
    authorWorks: { file: 'author-works.json', entityKind: 'author' }
  };

  async function getRelation(name, id) {
    const config = RELATIONS[name];
    const entityResult = await getEntity(config.entityKind, id);
    if (entityResult.status !== STATUS.OK) {
      return entityResult; // 'not-found' o 'unavailable': si propaga così com'è
    }
    const relationIndex = await loadIndexFile(config.file);
    if (relationIndex === null) {
      return unavailable(`Indice di relazione non caricabile (${config.file}).`);
    }
    return ok(relationIndex[id] || []);
  }

  /** Domande che nascono da un passaggio. */
  function getPassageQuestions(id) {
    return getRelation('passageQuestions', id);
  }

  /** Concetti trattati in un passaggio. */
  function getPassageConcepts(id) {
    return getRelation('passageConcepts', id);
  }

  /** Commentari collegati a un passaggio. */
  function getPassageCommentaries(id) {
    return getRelation('passageCommentaries', id);
  }

  /** Note editoriali collegate a un passaggio. */
  function getPassageNotes(id) {
    return getRelation('passageNotes', id);
  }

  /** Spiegazioni Jivanmukta collegate a un passaggio. */
  function getPassageExplanations(id) {
    return getRelation('passageExplanations', id);
  }

  /** Spiegazioni collegate a una domanda. */
  function getQuestionExplanations(id) {
    return getRelation('questionExplanations', id);
  }

  /** Domande che affrontano un dato concetto. */
  function getConceptQuestions(id) {
    return getRelation('conceptQuestions', id);
  }

  /** Concetti collegati a un dato concetto (chiusura simmetrica). */
  function getRelatedConcepts(id) {
    return getRelation('conceptRelatedConcepts', id);
  }

  /** Passaggi di un'opera, nell'ordine editoriale di lettura. */
  function getWorkPassages(id) {
    return getRelation('workPassages', id);
  }

  /** Domande collegate ai passaggi di un'opera. */
  function getWorkQuestions(id) {
    return getRelation('workQuestions', id);
  }

  /** Concetti collegati a un autore. */
  function getAuthorConcepts(id) {
    return getRelation('authorConcepts', id);
  }

  /** Opere collegate a un autore (anche tramite i suoi commentari). */
  function getAuthorWorks(id) {
    return getRelation('authorWorks', id);
  }

  /**
   * Domande "related_questions" di una domanda, risolte in record
   * completi (non solo l'id grezzo). Nasconde alla pagina la logica
   * di risoluzione: la pagina riceve già le domande collegate pronte
   * all'uso, con la motivazione editoriale ("why") associata.
   *
   * Risultato (in caso di 'ok'): array di
   *   { id, why, question: <risultato di getQuestion(id)> }
   */
  async function getRelatedQuestions(id) {
    const questionResult = await getEntity('question', id);
    if (questionResult.status !== STATUS.OK) {
      return questionResult;
    }
    const refs = questionResult.data.related_questions || [];
    const resolved = await Promise.all(
      refs.map(async (ref) => ({
        id: ref.id,
        why: ref.why,
        question: await getQuestion(ref.id)
      }))
    );
    return ok(resolved);
  }

  // ============================================================
  // API pubblica
  // ============================================================

  const ContentEngine = {
    configure,
    clearCache,
    STATUS,

    // Entità
    getQuestion,
    getConcept,
    getWork,
    getAuthor,
    getCommentary,
    getNote,
    getPassage,
    getUnit,
    getExplanation,
    getEntities,

    // Relazioni
    getPassageQuestions,
    getPassageConcepts,
    getPassageCommentaries,
    getPassageNotes,
    getPassageExplanations,
    getQuestionExplanations,
    getConceptQuestions,
    getRelatedConcepts,
    getWorkPassages,
    getWorkQuestions,
    getAuthorConcepts,
    getAuthorWorks,
    getRelatedQuestions
  };

  global.ContentEngine = ContentEngine;

  // Supporto opzionale a CommonJS/Node (usato dalla verifica tecnica),
  // senza che questo influisca sull'uso nel browser.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentEngine;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
