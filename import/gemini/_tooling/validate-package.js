#!/usr/bin/env node
/**
 * validate-package.js — Validazione pacchetto editoriale Gemini
 * =====================================================================
 * Verifica FORMALE (non dottrinale, non filologica) di un pacchetto
 * prodotto secondo /import/gemini/FORMATO-PACCHETTO.md, PRIMA che
 * venga importato nel modello /content del sito.
 *
 * Non scrive nulla. Non modifica /content. Non modifica il pacchetto.
 * Restituisce solo un report ed exit code (0 = valido, 1 = invalido).
 *
 * Uso:
 *   node import/gemini/_tooling/validate-package.js <path-al-pacchetto.json>
 *
 * Può anche essere richiamato come modulo (usato da import-gemini.js):
 *   const { validatePackage } = require('./validate-package');
 *   const { errors, warnings, pkg } = validatePackage(pkgPath, contentDir);
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const REQUIRED_PACKAGE_FORMAT = 'jivanmukta-gemini-editorial-v1';

function isKebab(id) {
  return typeof id === 'string' && KEBAB_RE.test(id);
}

/**
 * Carica i registri esistenti dal sito (/content) per i controlli che
 * richiedono di sapere cosa esiste già. Tollera l'assenza totale di
 * /content (progetto vuoto) restituendo registri vuoti.
 */
function loadExistingRegistries(contentDir) {
  const ENTITY_DIRS = {
    question: 'questions',
    concept: 'concepts',
    work: 'works',
    author: 'authors',
    commentary: 'commentaries',
    note: 'notes',
    unit: 'editorial-units'
  };

  function listJSONFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results = results.concat(listJSONFiles(full));
      else if (entry.name.endsWith('.json')) results.push(full);
    }
    return results;
  }

  const registries = {};
  for (const [kind, dirName] of Object.entries(ENTITY_DIRS)) {
    const map = {};
    for (const f of listJSONFiles(path.join(contentDir, dirName))) {
      try {
        const entity = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (entity.id) map[entity.id] = entity;
      } catch (e) {
        // File esistente malformato: non è compito del validatore del
        // pacchetto Gemini segnalarlo; lo farà build-index.js.
      }
    }
    registries[kind] = map;
  }

  // Passaggi esistenti: vanno estratti dalle editorial-units esistenti.
  const existingPassages = {};
  for (const unit of Object.values(registries.unit)) {
    for (const section of (unit.sections || [])) {
      for (const p of (section.passages || [])) {
        if (p && p.id) existingPassages[p.id] = { unit_id: unit.id, work_id: unit.work_id };
      }
    }
  }

  return { ...registries, passage: existingPassages };
}

/**
 * Valida un pacchetto già caricato in memoria (oggetto JS).
 * @returns {{errors: string[], warnings: string[]}}
 */
function validatePackageObject(pkg, existing, pkgLabel) {
  const errors = [];
  const warnings = [];

  function err(msg) { errors.push(`[${pkgLabel}] ${msg}`); }
  function warn(msg) { warnings.push(`[${pkgLabel}] ${msg}`); }

  if (!pkg || typeof pkg !== 'object') {
    err('Il pacchetto non è un oggetto JSON valido.');
    return { errors, warnings };
  }

  // 1. package_format
  if (pkg.package_format !== REQUIRED_PACKAGE_FORMAT) {
    err(
      `Campo "package_format" mancante o errato. Atteso: "${REQUIRED_PACKAGE_FORMAT}", ` +
      `trovato: ${JSON.stringify(pkg.package_format)}`
    );
  }

  // 2. work
  const work = pkg.work;
  if (!work || typeof work !== 'object') {
    err('Blocco "work" mancante o non valido.');
    return { errors, warnings }; // senza work non si può continuare in modo sensato
  }
  if (!work.id) err('work.id mancante.');
  else if (!isKebab(work.id)) err(`work.id "${work.id}" non è in formato kebab-case valido.`);
  if (!work.title) err('work.title mancante.');
  if (!work.language) err('work.language mancante.');

  const workAlreadyExists = work.id && !!existing.work[work.id];
  if (workAlreadyExists) {
    warn(
      `work.id "${work.id}" corrisponde a un'opera già esistente sul sito. ` +
      `Il pacchetto verrà trattato come AGGIUNTA a quell'opera (nuove unità/passaggi), ` +
      `non come sua ridefinizione.`
    );
  }

  // Raccoglie tutti gli ID dichiarati nel pacchetto, per tipo, per i controlli di duplicazione interna.
  const seenInPackage = {
    unit: new Set(), passage: new Set(), author: new Set(),
    concept: new Set(), question: new Set(), commentary: new Set(), note: new Set()
  };

  function checkDuplicateInPackage(kind, id, where) {
    if (!id) return;
    if (seenInPackage[kind].has(id)) {
      err(`ID "${id}" (${kind}) duplicato all'interno del pacchetto (${where}).`);
    }
    seenInPackage[kind].add(id);
  }

  // 3. editorial_units + passages
  const units = Array.isArray(pkg.editorial_units) ? pkg.editorial_units : [];
  if (units.length === 0) {
    warn('Il pacchetto non contiene alcuna editorial_unit.');
  }

  // Passaggi noti in questo pacchetto -> per validare i riferimenti incrociati (concepts/questions/ecc.)
  const passagesInPackage = {}; // id -> work_id dichiarato (via la unit che lo contiene)

  units.forEach((unit, uIdx) => {
    const uLabel = `editorial_units[${uIdx}]`;
    if (!unit.id) { err(`${uLabel}.id mancante.`); }
    else if (!isKebab(unit.id)) { err(`${uLabel}.id "${unit.id}" non è kebab-case valido.`); }
    else {
      checkDuplicateInPackage('unit', unit.id, uLabel);
      if (existing.unit[unit.id]) {
        err(
          `${uLabel}.id "${unit.id}" coincide con una editorial-unit già esistente sul sito. ` +
          `Le unità editoriali non possono essere ridefinite tramite import ordinario.`
        );
      }
    }
    if (!unit.unit_locus) warn(`${uLabel}.unit_locus mancante.`);

    const sections = Array.isArray(unit.sections) ? unit.sections : [];
    if (sections.length === 0) warn(`${uLabel} ("${unit.id}") non ha alcuna section.`);

    sections.forEach((section, sIdx) => {
      const sLabel = `${uLabel}.sections[${sIdx}]`;
      if (!section.section_locus) warn(`${sLabel}.section_locus mancante.`);

      const passages = Array.isArray(section.passages) ? section.passages : [];
      passages.forEach((p, pIdx) => {
        const pLabel = `${sLabel}.passages[${pIdx}]`;
        if (!p.id) { err(`${pLabel}.id mancante.`); return; }
        if (!isKebab(p.id)) { err(`${pLabel}.id "${p.id}" non è kebab-case valido.`); }
        checkDuplicateInPackage('passage', p.id, pLabel);

        if (existing.passage[p.id]) {
          err(
            `${pLabel}.id "${p.id}" coincide con un passaggio già esistente sul sito ` +
            `(opera esistente: ${existing.passage[p.id].work_id}). ` +
            `I passaggi esistenti non possono essere ridefiniti tramite import ordinario: ` +
            `serve una richiesta esplicita separata.`
          );
        }

        if (typeof p.translation !== 'string' || p.translation.trim() === '') {
          err(`${pLabel}.translation mancante o vuoto.`);
        }
        if (typeof p.original !== 'string') {
          warn(`${pLabel}.original assente: verrà trattato come stringa vuota (testo originale non ancora disponibile).`);
        }
        if (!p.source) err(`${pLabel}.source mancante.`);

        passagesInPackage[p.id] = work && work.id;
      });
    });
  });

  // Helper: un passaggio referenziato da concepts/questions/ecc. deve
  // esistere nel pacchetto stesso o già sul sito.
  function passageResolvable(pid) {
    return !!passagesInPackage[pid] || !!existing.passage[pid];
  }
  function authorResolvable(aid) {
    return seenInPackage.author.has(aid) || !!existing.author[aid];
  }
  function conceptResolvable(cid) {
    return seenInPackage.concept.has(cid) || !!existing.concept[cid];
  }
  function questionResolvable(qid) {
    return seenInPackage.question.has(qid) || !!existing.question[qid];
  }
  function commentaryResolvable(cmid) {
    return seenInPackage.commentary.has(cmid) || !!existing.commentary[cmid];
  }

  // Occorre pre-registrare gli ID di authors/concepts/questions/commentaries/notes
  // PRIMA di validarne i riferimenti incrociati reciproci (possono citarsi a vicenda).
  const authors = Array.isArray(pkg.authors) ? pkg.authors : [];
  authors.forEach((a, i) => {
    if (!a.id) err(`authors[${i}].id mancante.`);
    else if (!isKebab(a.id)) err(`authors[${i}].id "${a.id}" non è kebab-case valido.`);
    else checkDuplicateInPackage('author', a.id, `authors[${i}]`);
  });

  const concepts = Array.isArray(pkg.concepts) ? pkg.concepts : [];
  concepts.forEach((c, i) => {
    if (!c.id) err(`concepts[${i}].id mancante.`);
    else if (!isKebab(c.id)) err(`concepts[${i}].id "${c.id}" non è kebab-case valido.`);
    else checkDuplicateInPackage('concept', c.id, `concepts[${i}]`);
  });

  const questions = Array.isArray(pkg.questions) ? pkg.questions : [];
  questions.forEach((q, i) => {
    if (!q.id) err(`questions[${i}].id mancante.`);
    else if (!isKebab(q.id)) err(`questions[${i}].id "${q.id}" non è kebab-case valido.`);
    else checkDuplicateInPackage('question', q.id, `questions[${i}]`);
    if (!q.type) err(`questions[${i}].type mancante.`);
    else if (!['specific', 'great', 'comparison'].includes(q.type)) {
      warn(`questions[${i}].type "${q.type}" non è uno dei valori noti (specific, great, comparison).`);
    }
    if (!q.text) err(`questions[${i}].text mancante.`);
  });

  const commentaries = Array.isArray(pkg.commentaries) ? pkg.commentaries : [];
  commentaries.forEach((cm, i) => {
    if (!cm.id) err(`commentaries[${i}].id mancante.`);
    else if (!isKebab(cm.id)) err(`commentaries[${i}].id "${cm.id}" non è kebab-case valido.`);
    else checkDuplicateInPackage('commentary', cm.id, `commentaries[${i}]`);
    if (!cm.author_id) err(`commentaries[${i}].author_id mancante.`);
    if (!cm.text) err(`commentaries[${i}].text mancante.`);
  });

  const notes = Array.isArray(pkg.notes) ? pkg.notes : [];
  notes.forEach((n, i) => {
    if (!n.id) err(`notes[${i}].id mancante.`);
    else if (!isKebab(n.id)) err(`notes[${i}].id "${n.id}" non è kebab-case valido.`);
    else checkDuplicateInPackage('note', n.id, `notes[${i}]`);
    if (!n.term) err(`notes[${i}].term mancante.`);
    if (!n.text) err(`notes[${i}].text mancante.`);
  });

  // Ora validiamo i riferimenti incrociati.
  authors.forEach((a, i) => {
    (a.concepts || []).forEach((cid) => {
      if (!conceptResolvable(cid)) err(`authors[${i}] ("${a.id}").concepts riferisce concetto inesistente: "${cid}"`);
    });
    (a.related_authors || []).forEach((aid) => {
      if (!authorResolvable(aid)) err(`authors[${i}] ("${a.id}").related_authors riferisce autore inesistente: "${aid}"`);
    });
  });

  concepts.forEach((c, i) => {
    (c.passages || []).forEach((pid) => {
      if (!passageResolvable(pid)) err(`concepts[${i}] ("${c.id}").passages riferisce passaggio inesistente: "${pid}"`);
      else if (passagesInPackage[pid] && passagesInPackage[pid] !== work.id) {
        err(
          `concepts[${i}] ("${c.id}").passages riferisce passaggio "${pid}" ` +
          `che appartiene all'opera "${passagesInPackage[pid]}", non a "${work.id}". ` +
          `Un concetto può riferirsi a passaggi di altre opere solo se già esistenti sul sito.`
        );
      }
    });
    (c.related_concepts || []).forEach((cid) => {
      if (!conceptResolvable(cid)) err(`concepts[${i}] ("${c.id}").related_concepts riferisce concetto inesistente: "${cid}"`);
    });
    (c.authors || []).forEach((aid) => {
      if (!authorResolvable(aid)) err(`concepts[${i}] ("${c.id}").authors riferisce autore inesistente: "${aid}"`);
    });
  });

  questions.forEach((q, i) => {
    (q.passages || []).forEach((pid) => {
      if (!passageResolvable(pid)) err(`questions[${i}] ("${q.id}").passages riferisce passaggio inesistente: "${pid}"`);
    });
    (q.concepts || []).forEach((cid) => {
      if (!conceptResolvable(cid)) err(`questions[${i}] ("${q.id}").concepts riferisce concetto inesistente: "${cid}"`);
    });
    (q.commentaries || []).forEach((cmid) => {
      if (!commentaryResolvable(cmid)) err(`questions[${i}] ("${q.id}").commentaries riferisce commentary inesistente: "${cmid}"`);
    });
    if (q.parent_question && !questionResolvable(q.parent_question)) {
      err(`questions[${i}] ("${q.id}").parent_question riferisce domanda inesistente: "${q.parent_question}"`);
    }
    (q.related_questions || []).forEach((rq) => {
      const rqid = typeof rq === 'string' ? rq : rq.id;
      if (rqid && !questionResolvable(rqid)) {
        err(`questions[${i}] ("${q.id}").related_questions riferisce domanda inesistente: "${rqid}"`);
      }
    });
  });

  commentaries.forEach((cm, i) => {
    if (cm.author_id && !authorResolvable(cm.author_id)) {
      err(`commentaries[${i}] ("${cm.id}").author_id riferisce autore inesistente: "${cm.author_id}"`);
    }
    (cm.passages || []).forEach((pid) => {
      if (!passageResolvable(pid)) err(`commentaries[${i}] ("${cm.id}").passages riferisce passaggio inesistente: "${pid}"`);
    });
  });

  notes.forEach((n, i) => {
    (n.passages || []).forEach((pid) => {
      if (!passageResolvable(pid)) err(`notes[${i}] ("${n.id}").passages riferisce passaggio inesistente: "${pid}"`);
    });
  });

  return { errors, warnings };
}

function validatePackage(pkgPath, contentDir) {
  const pkgLabel = path.basename(pkgPath);
  let pkg;
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    pkg = JSON.parse(raw);
  } catch (e) {
    return {
      errors: [`[${pkgLabel}] JSON non valido: ${e.message}`],
      warnings: [],
      pkg: null
    };
  }
  const existing = loadExistingRegistries(contentDir);
  const { errors, warnings } = validatePackageObject(pkg, existing, pkgLabel);
  return { errors, warnings, pkg };
}

// ============================================================
// CLI
// ============================================================
if (require.main === module) {
  const pkgPath = process.argv[2];
  if (!pkgPath) {
    console.error('Uso: node validate-package.js <path-al-pacchetto.json>');
    process.exit(2);
  }
  const contentDir = path.join(__dirname, '..', '..', '..', 'content');
  const { errors, warnings } = validatePackage(path.resolve(pkgPath), contentDir);

  console.log('');
  console.log(`Validazione: ${pkgPath}`);
  console.log('');

  if (warnings.length) {
    console.log(`Warnings: ${warnings.length}`);
    warnings.forEach((w) => console.log('  ⚠  ' + w));
    console.log('');
  } else {
    console.log('Warnings: 0');
    console.log('');
  }

  if (errors.length) {
    console.log(`Errors: ${errors.length}`);
    errors.forEach((e) => console.log('  ✗  ' + e));
    console.log('');
    console.log('Pacchetto NON valido.');
    console.log('');
    process.exit(1);
  } else {
    console.log('Errors: 0');
    console.log('');
    console.log('Pacchetto valido.');
    console.log('');
    process.exit(0);
  }
}

module.exports = { validatePackage, validatePackageObject, loadExistingRegistries, isKebab, REQUIRED_PACKAGE_FORMAT };
