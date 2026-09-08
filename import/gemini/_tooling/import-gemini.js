#!/usr/bin/env node
/**
 * import-gemini.js — Importatore pacchetti editoriali Gemini
 * =====================================================================
 * Trasforma un pacchetto editoriale APPROVATO (formato descritto in
 * /import/gemini/FORMATO-PACCHETTO.md) nel modello /content già
 * utilizzato da Jivanmukta:
 *
 *   /content/works/<id>.json                (creato solo se non esiste)
 *   /content/editorial-units/<id>.json       (creato solo se non esiste)
 *   /content/authors/<id>.json               (creato se non esiste;
 *                                              altrimenti solo collegato)
 *   /content/concepts/<id>.json              (creato se non esiste;
 *                                              altrimenti solo collegato)
 *   /content/questions/<id>.json             (creato solo se non esiste)
 *   /content/commentaries/<id>.json          (creato solo se non esiste)
 *   /content/notes/<id>.json                 (creato solo se non esiste)
 *
 * NON modifica /content/_index/* (quello è compito esclusivo di
 * build-index.js, da eseguire DOPO l'importazione).
 *
 * PRINCIPI (dal mandato):
 *   - mantenere gli ID stabili: gli ID del pacchetto diventano gli ID
 *     dei file, senza rinominare nulla;
 *   - non creare duplicati: se un file con lo stesso id esiste già,
 *     non viene ricreato;
 *   - non modificare contenuti già esistenti senza una richiesta
 *     esplicita: se un id esiste già con un contenuto DIVERSO da
 *     quanto proposto nel pacchetto, è un CONFLITTO → segnalato,
 *     nessuna scrittura;
 *   - verificare riferimenti inesistenti e che i passaggi appartengano
 *     all'opera corretta: delegato a validate-package.js, eseguito
 *     sempre prima di scrivere qualunque cosa;
 *   - segnalare conflitti invece di sovrascrivere silenziosamente.
 *
 * Uso:
 *   node import/gemini/_tooling/import-gemini.js <path-al-pacchetto.json> [--dry-run]
 *
 *   --dry-run   Esegue tutti i controlli e mostra cosa verrebbe scritto,
 *               senza scrivere nulla né spostare il file del pacchetto.
 *
 * Dopo un'importazione riuscita (non dry-run), eseguire:
 *   node build-index.js
 * per rigenerare gli indici e validare l'integrità complessiva del sito.
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');
const { validatePackage } = require('./validate-package');

const ROOT = path.join(__dirname, '..', '..', '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const IMPORT_DIR = path.join(ROOT, 'import', 'gemini');
const PROCESSED_DIR = path.join(IMPORT_DIR, 'processed');
const REJECTED_DIR = path.join(IMPORT_DIR, 'rejected');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSONPretty(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Confronto "semantico" tollerante all'ordine delle chiavi, per
 * decidere se un id già esistente ha contenuto IDENTICO (import
 * idempotente, nessuna azione) o DIVERSO (conflitto, da segnalare).
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
  return ak.every((k) => deepEqual(a[k], b[k]));
}

class ImportReport {
  constructor() {
    this.created = [];   // { kind, id, file }
    this.linked = [];    // { kind, id }  -- già esisteva, identico, nessuna scrittura
    this.updated = [];   // { kind, id, file } -- aggiornamento additivo consentito (solo work.editorial_units)
    this.conflicts = []; // { kind, id, file, reason }
    this.errors = [];    // stringhe: bloccano l'intera importazione
  }
  get hasConflicts() { return this.conflicts.length > 0; }
  get hasErrors() { return this.errors.length > 0; }
}

/**
 * Scrive (o collega, o segnala conflitto per) una entità singola.
 *
 * @param {string} dirName   sottocartella di /content (es. 'authors')
 * @param {string} kind      etichetta per il report (es. 'author')
 * @param {object} entity    oggetto da scrivere, DEVE avere .id
 * @param {ImportReport} report
 * @param {boolean} dryRun   se true, non scrive nulla su disco: calcola
 *                           solo cosa accadrebbe (created/linked/conflicts/updated)
 * @param {object} [opts]
 * @param {(existing:object, candidate:object) => boolean} [opts.isAdditiveUpdate]
 *   Se fornita e ritorna true, una differenza rispetto all'esistente non è
 *   trattata come conflitto ma come AGGIORNAMENTO ADDITIVO consentito
 *   (es. work.editorial_units che cresce senza perdere nulla). Usata solo
 *   per il work: ogni altra entità resta "scrivi se nuovo, altrimenti
 *   uguale o conflitto".
 */
function upsertEntity(dirName, kind, entity, report, dryRun, opts) {
  const dir = path.join(CONTENT_DIR, dirName);
  const file = path.join(dir, `${entity.id}.json`);
  const isAdditiveUpdate = opts && opts.isAdditiveUpdate;

  if (fs.existsSync(file)) {
    const existing = readJSON(file);
    if (deepEqual(existing, entity)) {
      report.linked.push({ kind, id: entity.id });
      return;
    }
    if (isAdditiveUpdate && isAdditiveUpdate(existing, entity)) {
      report.updated.push({ kind, id: entity.id, file: path.relative(ROOT, file) });
      if (dryRun) return;
      writeJSONPretty(file, entity);
      return;
    }
    report.conflicts.push({
      kind,
      id: entity.id,
      file: path.relative(ROOT, file),
      reason:
        `Esiste già un ${kind} con id "${entity.id}" ma con contenuto diverso ` +
        `da quello proposto nel pacchetto. Nessuna scrittura eseguita. ` +
        `Serve una richiesta esplicita di aggiornamento per modificarlo.`
    });
    return;
  }

  report.created.push({ kind, id: entity.id, file: path.relative(ROOT, file) });
  if (dryRun) return; // non scrivere nulla in modalità simulazione

  fs.mkdirSync(dir, { recursive: true });
  writeJSONPretty(file, entity);
}

/**
 * Vero solo se `candidate` differisce da `existing` esclusivamente per
 * l'aggiunta di nuovi elementi in `editorial_units` (existing.editorial_units
 * è un prefisso/sottoinsieme, in ordine, di candidate.editorial_units, e
 * tutti gli altri campi sono identici). Usata per decidere se un work già
 * esistente può ricevere nuove unità senza che ciò sia un conflitto.
 */
function isWorkAdditiveUpdate(existing, candidate) {
  const { editorial_units: existingUnits = [], ...existingRest } = existing;
  const { editorial_units: candidateUnits = [], ...candidateRest } = candidate;
  if (!deepEqual(existingRest, candidateRest)) return false;
  // ogni unità già esistente deve comparire, nello stesso ordine relativo,
  // dentro l'elenco candidato (che può solo aggiungerne altre in coda).
  if (existingUnits.length > candidateUnits.length) return false;
  return existingUnits.every((uid, i) => candidateUnits[i] === uid);
}

/**
 * Costruisce l'oggetto "work" da scrivere in /content/works, includendo
 * l'elenco delle editorial_units. Se il work esiste già, le nuove unità
 * del pacchetto vanno AGGIUNTE a work.editorial_units (mai rimpiazzate).
 */
function buildWorkEntity(pkgWork, newUnitIds, existingWorkFile) {
  const base = { ...pkgWork };
  delete base.id; // ricostruito sotto, per fissare l'ordine delle chiavi in testa
  const entity = { id: pkgWork.id, ...base };

  let existingUnits = [];
  if (existingWorkFile && fs.existsSync(existingWorkFile)) {
    const existing = readJSON(existingWorkFile);
    existingUnits = existing.editorial_units || [];
  }
  const merged = existingUnits.slice();
  for (const uid of newUnitIds) {
    if (!merged.includes(uid)) merged.push(uid);
  }
  entity.editorial_units = merged;
  return entity;
}

/**
 * Costruisce la lista di tutte le entità da scrivere (compreso il work
 * già "mergiato"), senza scrivere nulla. Usata sia per la scansione a
 * secco dei conflitti sia per l'effettiva scrittura, così le due fasi
 * vedono esattamente le stesse entità.
 */
function buildEntityPlan(pkg) {
  const workFile = path.join(CONTENT_DIR, 'works', `${pkg.work.id}.json`);
  const newUnitIds = (pkg.editorial_units || []).map((u) => u.id);
  const workEntity = buildWorkEntity(pkg.work, newUnitIds, workFile);

  const plan = [{
    dirName: 'works',
    kind: 'work',
    entity: workEntity,
    opts: { isAdditiveUpdate: isWorkAdditiveUpdate }
  }];

  for (const unit of (pkg.editorial_units || [])) {
    plan.push({
      dirName: 'editorial-units',
      kind: 'unit',
      entity: {
        id: unit.id,
        work_id: pkg.work.id,
        unit_locus: unit.unit_locus,
        unit_title: unit.unit_title,
        sections: unit.sections
      }
    });
  }
  for (const a of (pkg.authors || [])) plan.push({ dirName: 'authors', kind: 'author', entity: a });
  for (const c of (pkg.concepts || [])) plan.push({ dirName: 'concepts', kind: 'concept', entity: c });
  for (const q of (pkg.questions || [])) plan.push({ dirName: 'questions', kind: 'question', entity: q });
  for (const cm of (pkg.commentaries || [])) plan.push({ dirName: 'commentaries', kind: 'commentary', entity: cm });
  for (const n of (pkg.notes || [])) plan.push({ dirName: 'notes', kind: 'note', entity: n });

  return plan;
}

function importPackage(pkgPath, { dryRun = false } = {}) {
  const report = new ImportReport();
  const pkgLabel = path.basename(pkgPath);

  const { errors: validationErrors, warnings: validationWarnings, pkg } =
    validatePackage(pkgPath, CONTENT_DIR);

  if (validationErrors.length > 0) {
    report.errors.push(
      `Pacchetto non valido (${validationErrors.length} errori). Importazione interrotta.`
    );
    return { report, pkg, validationErrors, validationWarnings };
  }

  const plan = buildEntityPlan(pkg);

  // --- Fase 1: scansione a secco di TUTTI i conflitti, senza scrivere
  //     nulla. L'importazione è atomica rispetto ai conflitti: se anche
  //     una sola entità del pacchetto è in conflitto, non si scrive
  //     NIENTE di quel pacchetto (né work, né unit, né le altre entità),
  //     per evitare importazioni parziali difficili da ricostruire.
  for (const item of plan) {
    upsertEntity(item.dirName, item.kind, item.entity, report, /* dryRun */ true, item.opts);
  }

  if (report.hasConflicts) {
    report.errors.push(
      `${report.conflicts.length} conflitto/i rilevato/i. Importazione ANNULLATA per l'intero ` +
      `pacchetto: nessuna scrittura è stata eseguita in /content, nemmeno per le entità del ` +
      `pacchetto che non erano in conflitto. Risolvere i conflitti elencati sopra e ripetere ` +
      `l'importazione.`
    );
    if (!dryRun) {
      fs.mkdirSync(REJECTED_DIR, { recursive: true });
      fs.copyFileSync(pkgPath, path.join(REJECTED_DIR, pkgLabel));
    }
    return { report, pkg, validationErrors, validationWarnings };
  }

  // --- Fase 2: nessun conflitto. Scrive realmente (salvo dry-run). ---
  report.created = [];
  report.linked = [];
  report.updated = [];
  for (const item of plan) {
    upsertEntity(item.dirName, item.kind, item.entity, report, dryRun, item.opts);
  }

  if (!dryRun && !report.hasErrors) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    const dest = path.join(PROCESSED_DIR, pkgLabel);
    fs.copyFileSync(pkgPath, dest);
  }

  return { report, pkg, validationErrors, validationWarnings };
}

// ============================================================
// CLI
// ============================================================
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const pkgPath = args.find((a) => !a.startsWith('--'));

  if (!pkgPath) {
    console.error('Uso: node import-gemini.js <path-al-pacchetto.json> [--dry-run]');
    process.exit(2);
  }

  const resolvedPath = path.resolve(pkgPath);
  console.log('');
  console.log(`Importazione pacchetto: ${resolvedPath}`);
  console.log(dryRun ? '(modalità --dry-run: nessuna scrittura verrà eseguita)' : '');
  console.log('');

  const { report, validationErrors, validationWarnings } = importPackage(resolvedPath, { dryRun });

  if (validationWarnings && validationWarnings.length) {
    console.log(`Warnings di validazione: ${validationWarnings.length}`);
    validationWarnings.forEach((w) => console.log('  ⚠  ' + w));
    console.log('');
  }

  if (validationErrors && validationErrors.length) {
    console.log(`Errori di validazione: ${validationErrors.length}`);
    validationErrors.forEach((e) => console.log('  ✗  ' + e));
    console.log('');
    console.log('Importazione interrotta: il pacchetto non ha superato la validazione.');
    console.log('');
    process.exit(1);
  }

  if (report.hasConflicts) {
    console.log(`CONFLITTI (${report.conflicts.length}):`);
    report.conflicts.forEach((c) => {
      console.log(`  ✗  [${c.kind}] ${c.id}  (${c.file})`);
      console.log(`     ${c.reason}`);
    });
    console.log('');
    console.log(
      `Nessuna scrittura è stata eseguita in /content: l'importazione è ANNULLATA per l'intero ` +
      `pacchetto (anche le ${report.created.length} entità senza conflitto elencate sotto NON sono state scritte).`
    );
    if (report.created.length) {
      console.log('  Entità che sarebbero state create se non ci fosse stato il conflitto:');
      report.created.forEach((c) => console.log(`    - [${c.kind}] ${c.id}  →  ${c.file}`));
    }
    console.log('');
    console.log('Il file del pacchetto è stato copiato in import/gemini/rejected/ per archivio.');
    console.log('Risolvere i conflitti elencati sopra e ripetere l\'importazione.');
    console.log('');
    process.exit(1);
  }

  if (report.created.length) {
    console.log(`Creati (${report.created.length}):`);
    report.created.forEach((c) => console.log(`  + [${c.kind}] ${c.id}  →  ${c.file}`));
    console.log('');
  }

  if (report.updated.length) {
    console.log(`Aggiornati per aggiunta additiva (${report.updated.length}):`);
    report.updated.forEach((u) => console.log(`  ~  [${u.kind}] ${u.id}  →  ${u.file}`));
    console.log('');
  }

  if (report.linked.length) {
    console.log(`Già esistenti, invariati (${report.linked.length}):`);
    report.linked.forEach((l) => console.log(`  = [${l.kind}] ${l.id}`));
    console.log('');
  }

  if (report.hasErrors) {
    console.log('Importazione completata CON ERRORI.');
    console.log('');
    process.exit(1);
  }

  if (dryRun) {
    console.log('Dry-run completato: nessuna modifica scritta su disco.');
  } else {
    console.log('Importazione completata con successo.');
    console.log('Il file del pacchetto è stato copiato in import/gemini/processed/.');
    console.log('');
    console.log('Prossimo passo: eseguire "node build-index.js" per rigenerare gli indici.');
  }
  console.log('');
}

module.exports = { importPackage };
