#!/usr/bin/env node
/**
 * build-index.js — Content Engine (fase: indicizzazione + validazione)
 * =====================================================================
 * Consolida l'indicizzazione del Vertical Slice e aggiunge la
 * validazione formale dell'integrità referenziale di tutti i contenuti
 * in /content.
 *
 * PRINCIPIO FONDAMENTALE
 *   FILE = UNITÀ EDITORIALE       (questions, concepts, works,
 *                                   authors, commentaries, notes,
 *                                   editorial-units: un file = un
 *                                   record, identificato dal suo
 *                                   campo "id")
 *   PASSAGE = BLOCCO LOGICO         (i passaggi non hanno un file
 *   CON ID INTERNO                  proprio: vivono annidati dentro
 *                                    le sections di una editorial-
 *                                    unit e vengono estratti da qui)
 *
 * Cosa fa, in ordine:
 *   1. Legge ricorsivamente ogni directory di entità e costruisce
 *      un registro id -> entità per ciascun tipo (questions,
 *      concepts, works, authors, commentaries, notes,
 *      editorial-units). La lettura è ricorsiva: se in futuro
 *      un'entità sarà organizzata in sottocartelle continua a
 *      funzionare senza modifiche.
 *   2. Espande ogni editorial-unit nei suoi passaggi, costruendo
 *      il passage-index globale con provenienza completa (opera,
 *      unità editoriale, locus, sequenza di lettura, file sorgente).
 *   3. Verifica l'integrità referenziale di ogni relazione dichiarata
 *      nei file sorgente. Distingue tre categorie:
 *
 *        ERROR               — riferimento a ID inesistente, ID
 *                              duplicato, passaggio duplicato tra
 *                              unità editoriali. La build termina
 *                              con exit code 1.
 *
 *        WARNING             — situazioni anomale ma non bloccanti
 *                              (es. unità editoriale orfana).
 *
 *        NOT YET AVAILABLE   — riferimento dichiarato esplicitamente
 *                              come non ancora pubblicato tramite il
 *                              campo "pending_refs". Non produce errori
 *                              né link rotti.
 *
 *   4. Deriva le relazioni INVERSE (passage->questions, ecc.),
 *      MAI scritte a mano nei file sorgente.
 *   5. Scrive tutti gli indici in /content/_index.
 *   6. Stampa un report di build strutturato.
 *
 * Campo pending_refs (opzionale, su qualunque entità)
 * ---------------------------------------------------
 * Dichiara riferimenti a entità il cui ID è noto al sistema ma che
 * non sono ancora pubblicate o tradotte sul sito. Esempio:
 *
 *   "pending_refs": [
 *     { "type": "passage", "id": "brhad-2-3-1",
 *       "note": "Traduzione non ancora disponibile." }
 *   ]
 *
 * Tipi validi per "type": question, concept, passage, work, author,
 * commentary, note, unit.
 *
 * È distinto da "cited_not_yet_available" (citazioni editoriali libere
 * senza un ID registrato nel sistema).
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, 'content');
const INDEX_DIR   = path.join(CONTENT_DIR, '_index');

const ENTITY_DIRS = {
  question:    'questions',
  concept:     'concepts',
  work:        'works',
  author:      'authors',
  commentary:  'commentaries',
  note:        'notes',
  unit:        'editorial-units',
  explanation: 'explanations'
};

// I tipi validi per pending_refs.type
const VALID_PENDING_TYPES = new Set(Object.keys(ENTITY_DIRS).concat(['passage']));

// ============================================================
// Infrastruttura di diagnostica
// ============================================================

const errors         = [];  // bloccanti — exit 1
const warnings       = [];  // non bloccanti
const notYetAvailable = []; // pending_refs — informativi
let   relationsValidated = 0;

/**
 * Formatta un errore strutturato nel formato richiesto.
 *
 * @param {string} sourceFile  - percorso relativo a CONTENT_DIR del file sorgente
 * @param {string} entityId    - id dell'entità che dichiara il riferimento
 * @param {string} field       - campo che contiene il riferimento invalido
 * @param {string} kind        - tipo dell'entità referenziata
 * @param {string} referencedId - ID che non è stato trovato
 */
function formatError(sourceFile, entityId, field, kind, referencedId) {
  return [
    '',
    'ERROR',
    `File:          ${sourceFile}`,
    `Entity:        ${entityId}`,
    `Field:         ${field}`,
    `Referenced ${kind} does not exist: ${referencedId}`,
    ''
  ].join('\n');
}

/**
 * Formatta un messaggio NOT YET AVAILABLE.
 */
function formatNotYetAvailable(sourceFile, entityId, type, id, note) {
  const lines = [
    '',
    'NOT YET AVAILABLE',
    `File:          ${sourceFile}`,
    `Entity:        ${entityId}`,
    `Type:          ${type}`,
    `ID:            ${id}`
  ];
  if (note) lines.push(`Note:          ${note}`);
  lines.push('');
  return lines.join('\n');
}

// ============================================================
// Utilità
// ============================================================

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function rel(filePath) {
  return path.relative(CONTENT_DIR, filePath).split(path.sep).join('/');
}

function listJSONFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listJSONFiles(full));
    } else if (entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

// ============================================================
// 1. Carica ogni directory di entità in un registro id -> entità.
// ============================================================
const registries = {}; // registries[kind] = { id: { ...entity, source_file } }

for (const [kind, dirName] of Object.entries(ENTITY_DIRS)) {
  const map = {};
  for (const f of listJSONFiles(path.join(CONTENT_DIR, dirName))) {
    const entity = readJSON(f);
    if (!entity.id) {
      warnings.push(`File senza campo "id": ${rel(f)} (directory: ${dirName})`);
      continue;
    }
    if (map[entity.id]) {
      errors.push(
        [
          '',
          'ERROR',
          `Duplicate ID "${entity.id}" in ${dirName}`,
          `First definition:  ${map[entity.id].source_file}`,
          `Redefined in:      ${rel(f)}`,
          ''
        ].join('\n')
      );
    }
    map[entity.id] = { ...entity, source_file: rel(f) };
  }
  registries[kind] = map;
}

const questions    = registries.question;
const concepts     = registries.concept;
const works        = registries.work;
const authors      = registries.author;
const commentaries = registries.commentary;
const notes        = registries.note;
const units        = registries.unit;
const explanations = registries.explanation;

// Il registro dei passaggi viene costruito al passo 2.
const passageIndex = {};

const REGISTRY_BY_KIND = {
  passage:     passageIndex,
  question:    questions,
  concept:     concepts,
  author:      authors,
  commentary:  commentaries,
  note:        notes,
  work:        works,
  unit:        units,
  explanation: explanations
};

// ============================================================
// 2. Espandi le editorial-units in un unico passageIndex globale.
//
//    Ordine di lettura:
//      - per ogni work, nell'ordine alfabetico per id (deterministico);
//      - per ogni work, le sue editorial_units nell'ordine dichiarato
//        in work.editorial_units (ordine editoriale voluto);
//      - dentro ogni unità, le sections nell'ordine dell'array;
//      - dentro ogni section, i passages nell'ordine dichiarato.
//    Le editorial-units orfane vengono comunque indicizzate e segnalate
//    come WARNING (non ERROR: l'unità esiste, ma non è collegata a un work).
// ============================================================

function expandUnit(unit, sequenceRef) {
  const sections = unit.sections || [];
  sections.forEach((section) => {
    (section.passages || []).forEach((p, indexInSection) => {
      if (!p.id) {
        warnings.push(
          `Passage without "id" field in ${unit.source_file} ` +
          `(section "${section.section_locus || '?'}")`
        );
        return;
      }
      if (passageIndex[p.id]) {
        errors.push(
          [
            '',
            'ERROR',
            `Duplicate passage ID "${p.id}"`,
            `First definition:  ${passageIndex[p.id].source_file}`,
            `Redefined in:      ${unit.source_file}`,
            ''
          ].join('\n')
        );
      }
      passageIndex[p.id] = {
        ...p,
        work_id:          unit.work_id,
        unit_id:          unit.id,
        unit_locus:       unit.unit_locus,
        unit_title:       unit.unit_title,
        section_locus:    section.section_locus,
        section_title:    section.section_title,
        locus:            section.section_locus,
        index_in_section: indexInSection,
        sequence:         sequenceRef.value++,
        source_file:      unit.source_file
      };
    });
  });
}

const sequenceRef  = { value: 0 };
const unitsVisited = new Set();

// 2a. Unità raggiungibili da un work, nell'ordine editoriale dichiarato.
for (const workId of Object.keys(works).sort()) {
  const work = works[workId];
  for (const unitId of (work.editorial_units || [])) {
    const unit = units[unitId];
    if (!unit) {
      errors.push(
        formatError(work.source_file, work.id, 'editorial_units', 'unit', unitId)
      );
      continue;
    }
    if (unitsVisited.has(unitId)) {
      errors.push(
        [
          '',
          'ERROR',
          `Editorial unit "${unitId}" referenced more than once`,
          `(cited again from work: ${work.id})`,
          ''
        ].join('\n')
      );
      continue;
    }
    unitsVisited.add(unitId);
    expandUnit(unit, sequenceRef);
  }
}

// 2b. Unità orfane: indicizzate comunque, segnalate come WARNING.
for (const unitId of Object.keys(units).sort()) {
  if (unitsVisited.has(unitId)) continue;
  warnings.push(
    `Editorial unit "${unitId}" not referenced by any work.editorial_units ` +
    `(orphan unit — indexed anyway)`
  );
  expandUnit(units[unitId], sequenceRef);
}

// ============================================================
// 3. Verifica l'integrità referenziale.
//
//    checkRef(kind, id, sourceFile, entityId, field)
//      → true  se il riferimento è valido (incrementa relationsValidated)
//      → false se non esiste (registra un ERROR formattato)
//
//    processPendingRefs(entity)
//      → registra ogni voce di pending_refs come NOT YET AVAILABLE.
//
//    Le relazioni inverse vengono derivate qui, mai scritte a mano
//    nei file sorgente.
// ============================================================

function checkRef(kind, id, sourceFile, entityId, field) {
  if (!id) return false; // campo assente: nessun riferimento da verificare
  const registry = REGISTRY_BY_KIND[kind];
  if (!registry[id]) {
    errors.push(formatError(sourceFile, entityId, field, kind, id));
    return false;
  }
  relationsValidated++;
  return true;
}

function processPendingRefs(entity) {
  if (!Array.isArray(entity.pending_refs)) return;
  for (const ref of entity.pending_refs) {
    if (!VALID_PENDING_TYPES.has(ref.type)) {
      warnings.push(
        `Unknown type "${ref.type}" in pending_refs of ${entity.source_file} ` +
        `(entity: ${entity.id}). Valid types: ${[...VALID_PENDING_TYPES].join(', ')}`
      );
      continue;
    }
    notYetAvailable.push(
      formatNotYetAvailable(entity.source_file, entity.id, ref.type, ref.id, ref.note)
    );
  }
}

const passageQuestions       = {}; // passage_id -> [question_id]
const passageConcepts        = {}; // passage_id -> [concept_id]
const passageCommentaries    = {}; // passage_id -> [commentary_id]
const passageNotes           = {}; // passage_id -> [note_id]
const passageExplanations    = {}; // passage_id -> [explanation_id]
const questionExplanations   = {}; // question_id -> [explanation_id]
const conceptQuestions       = {}; // concept_id -> [question_id]
const conceptRelatedConcepts = {}; // concept_id -> [concept_id]  (chiusura simmetrica)
const authorConcepts         = {}; // author_id  -> [concept_id]  (da concept.authors)
const workPassages           = {}; // work_id    -> [passage_id]  (da passageIndex, ordine di sequenza)
const workQuestions          = {}; // work_id    -> [question_id] (da question.passages -> passage.work_id)
const authorWorks            = {}; // author_id  -> [work_id]     (da commentary.author_id + commentary.passages)

function addInverse(map, key, value) {
  if (!map[key]) map[key] = [];
  if (!map[key].includes(value)) map[key].push(value);
}

// --- QUESTION → CONCEPT, PASSAGE, COMMENTARY, QUESTION ---------------
for (const q of Object.values(questions)) {
  processPendingRefs(q);

  for (const pid of (q.passages || [])) {
    if (checkRef('passage', pid, q.source_file, q.id, 'passages')) {
      addInverse(passageQuestions, pid, q.id);
      const wid = passageIndex[pid].work_id;
      if (wid) addInverse(workQuestions, wid, q.id);
    }
  }
  for (const cid of (q.concepts || [])) {
    if (checkRef('concept', cid, q.source_file, q.id, 'concepts')) {
      addInverse(conceptQuestions, cid, q.id);
    }
  }
  for (const cmid of (q.commentaries || [])) {
    checkRef('commentary', cmid, q.source_file, q.id, 'commentaries');
  }
  for (const rq of (q.related_questions || [])) {
    checkRef('question', rq.id, q.source_file, q.id, 'related_questions');
  }
  if (q.parent_question) {
    checkRef('question', q.parent_question, q.source_file, q.id, 'parent_question');
  }
  for (const sq of (q.specific_questions || [])) {
    checkRef('question', sq, q.source_file, q.id, 'specific_questions');
  }
}

// --- CONCEPT → PASSAGE, AUTHOR, CONCEPT, QUESTION --------------------
for (const c of Object.values(concepts)) {
  processPendingRefs(c);

  for (const pid of (c.passages || [])) {
    if (checkRef('passage', pid, c.source_file, c.id, 'passages')) {
      addInverse(passageConcepts, pid, c.id);
    }
  }
  for (const aid of (c.authors || [])) {
    if (checkRef('author', aid, c.source_file, c.id, 'authors')) {
      addInverse(authorConcepts, aid, c.id);
    }
  }
  for (const rc of (c.related_concepts || [])) {
    if (checkRef('concept', rc, c.source_file, c.id, 'related_concepts')) {
      // Relazione simmetrica: se dichiarata da un solo lato, l'altro la riceve
      // per derivazione — senza che nessuno dei due file venga scritto a mano.
      addInverse(conceptRelatedConcepts, c.id, rc);
      addInverse(conceptRelatedConcepts, rc, c.id);
    }
  }
  for (const qid of (c.questions || [])) {
    if (checkRef('question', qid, c.source_file, c.id, 'questions')) {
      addInverse(conceptQuestions, c.id, qid);
    }
  }
}

// --- PASSAGE → COMMENTARY, NOTE (da commentary e note verso passage) --
// (Le relazioni dirette passage→commentary e passage→note sono scritte
//  nei file commentary e note, non nel passage. Le inverse vengono
//  derivate qui.)

// --- COMMENTARY → PASSAGE, AUTHOR ------------------------------------
for (const cm of Object.values(commentaries)) {
  processPendingRefs(cm);

  const authorValid = cm.author_id
    ? checkRef('author', cm.author_id, cm.source_file, cm.id, 'author_id')
    : false;

  for (const pid of (cm.passages || [])) {
    if (checkRef('passage', pid, cm.source_file, cm.id, 'passages')) {
      addInverse(passageCommentaries, pid, cm.id);
      // AUTHOR → WORKS derivato dall'attività di commento (non dal campo
      // author.works, che resta dichiarazione diretta e non viene toccato).
      if (authorValid) {
        const wid = passageIndex[pid].work_id;
        if (wid) addInverse(authorWorks, cm.author_id, wid);
      }
    }
  }
}

// --- NOTE → PASSAGE --------------------------------------------------
for (const n of Object.values(notes)) {
  processPendingRefs(n);

  for (const pid of (n.passages || [])) {
    if (checkRef('passage', pid, n.source_file, n.id, 'passages')) {
      addInverse(passageNotes, pid, n.id);
    }
  }
}

// --- AUTHOR → WORK, AUTHOR -------------------------------------------
for (const a of Object.values(authors)) {
  processPendingRefs(a);

  for (const wid of (a.works || [])) {
    checkRef('work', wid, a.source_file, a.id, 'works');
  }
  for (const cid of (a.concepts || [])) {
    checkRef('concept', cid, a.source_file, a.id, 'concepts');
  }
  for (const aid of (a.related_authors || [])) {
    checkRef('author', aid, a.source_file, a.id, 'related_authors');
  }
}

// --- EDITORIAL-UNIT → WORK -------------------------------------------
for (const u of Object.values(units)) {
  processPendingRefs(u);

  if (u.work_id) {
    checkRef('work', u.work_id, u.source_file, u.id, 'work_id');
  }
}

// --- EXPLANATION → PASSAGE / UNIT / WORK / QUESTION / CONCEPT ---------
for (const exp of Object.values(explanations)) {
  processPendingRefs(exp);

  if (exp.target_type && exp.target_id) {
    if (checkRef(exp.target_type, exp.target_id, exp.source_file, exp.id, 'target_id')) {
      if (exp.target_type === 'passage') {
        addInverse(passageExplanations, exp.target_id, exp.id);
      } else if (exp.target_type === 'question') {
        addInverse(questionExplanations, exp.target_id, exp.id);
      }
    }
  }
}

// --- WORK → PASSAGES ---------------------------------------------------
// Derivato da passageIndex, che porta già il work_id di provenienza di
// ogni passaggio (assegnato in expandUnit). Object.entries preserva
// l'ordine di inserimento, che è già l'ordine di sequenza editoriale:
// nessun riordinamento necessario.
for (const [pid, p] of Object.entries(passageIndex)) {
  if (p.work_id) addInverse(workPassages, p.work_id, pid);
}

// --- QUESTION INDEX FOR GEMINI -----------------------------------------
// Genera una vista consultabile da Gemini con gerarchia e metadati
const childQuestionsMap = {};
for (const q of Object.values(questions)) {
  if (q.parent_question) {
    addInverse(childQuestionsMap, q.parent_question, q.id);
  }
}

const questionIndexForGemini = Object.values(questions).map((q) => ({
  id: q.id,
  scope: q.scope || 'local',
  type: q.type || 'specific',
  text: q.text,
  problem: q.problem || '',
  introduction: q.introduction || null,
  parent_question: q.parent_question || null,
  child_questions: childQuestionsMap[q.id] || [],
  concepts: q.concepts || []
}));

// ============================================================
// 4. Scrivi gli indici generati
// ============================================================
fs.mkdirSync(INDEX_DIR, { recursive: true });

function writeIndex(name, data) {
  fs.writeFileSync(path.join(INDEX_DIR, name), JSON.stringify(data, null, 2));
}

writeIndex('question-index.json',          questions);
writeIndex('concept-index.json',           concepts);
writeIndex('work-index.json',              works);
writeIndex('author-index.json',            authors);
writeIndex('commentary-index.json',        commentaries);
writeIndex('note-index.json',              notes);
writeIndex('unit-index.json',              units);
writeIndex('explanation-index.json',       explanations);
writeIndex('passage-index.json',           passageIndex);
writeIndex('passage-questions.json',       passageQuestions);
writeIndex('passage-concepts.json',        passageConcepts);
writeIndex('passage-commentaries.json',    passageCommentaries);
writeIndex('passage-notes.json',           passageNotes);
writeIndex('passage-explanations.json',    passageExplanations);
writeIndex('question-explanations.json',   questionExplanations);
writeIndex('concept-questions.json',       conceptQuestions);
writeIndex('concept-related-concepts.json', conceptRelatedConcepts);
writeIndex('author-concepts.json',         authorConcepts);
writeIndex('work-passages.json',           workPassages);
writeIndex('work-questions.json',          workQuestions);
writeIndex('author-works.json',            authorWorks);
writeIndex('question-index-for-gemini.json', questionIndexForGemini);

// ============================================================
// 5. Report di build
// ============================================================
const nQ  = Object.keys(questions).length;
const nC  = Object.keys(concepts).length;
const nW  = Object.keys(works).length;
const nU  = Object.keys(units).length;
const nP  = Object.keys(passageIndex).length;
const nA  = Object.keys(authors).length;
const nCm = Object.keys(commentaries).length;
const nN  = Object.keys(notes).length;
const nE  = Object.keys(explanations).length;

console.log('');
console.log('Build completed.');
console.log('');
console.log(`  Questions:       ${nQ}`);
console.log(`  Concepts:        ${nC}`);
console.log(`  Works:           ${nW}`);
console.log(`  Editorial units: ${nU}`);
console.log(`  Passages:        ${nP}`);
console.log(`  Authors:         ${nA}`);
console.log(`  Commentaries:    ${nCm}`);
console.log(`  Notes:           ${nN}`);
console.log(`  Explanations:    ${nE}`);
console.log('');
console.log(`  Relations validated: ${relationsValidated}`);
console.log('');
console.log('  Indici inversi generati:');
console.log(`    passage-questions.json         : ${Object.keys(passageQuestions).length} passaggi`);
console.log(`    passage-concepts.json          : ${Object.keys(passageConcepts).length} passaggi`);
console.log(`    passage-commentaries.json      : ${Object.keys(passageCommentaries).length} passaggi`);
console.log(`    passage-notes.json             : ${Object.keys(passageNotes).length} passaggi`);
console.log(`    passage-explanations.json      : ${Object.keys(passageExplanations).length} passaggi`);
console.log(`    question-explanations.json     : ${Object.keys(questionExplanations).length} domande`);
console.log(`    concept-questions.json         : ${Object.keys(conceptQuestions).length} concetti`);
console.log(`    concept-related-concepts.json  : ${Object.keys(conceptRelatedConcepts).length} concetti`);
console.log(`    author-concepts.json           : ${Object.keys(authorConcepts).length} autori`);
console.log(`    work-passages.json             : ${Object.keys(workPassages).length} opere`);
console.log(`    work-questions.json            : ${Object.keys(workQuestions).length} opere`);
console.log(`    author-works.json              : ${Object.keys(authorWorks).length} autori`);
console.log(`    question-index-for-gemini.json : ${questionIndexForGemini.length} domande`);
console.log('');

if (notYetAvailable.length > 0) {
  console.log(`  Not yet available: ${notYetAvailable.length}`);
  notYetAvailable.forEach((msg) => console.log(msg));
} else {
  console.log(`  Not yet available: 0`);
}

if (warnings.length > 0) {
  console.log(`  Warnings: ${warnings.length}`);
  warnings.forEach((w) => console.log('    ⚠  ' + w));
} else {
  console.log(`  Warnings: 0`);
}

if (errors.length > 0) {
  console.log(`  Errors: ${errors.length}`);
  errors.forEach((e) => console.log(e));
  console.log('');
  console.log('Build failed.');
  console.log('');
  process.exit(1);
} else {
  console.log(`  Errors: 0`);
  console.log('');
}
