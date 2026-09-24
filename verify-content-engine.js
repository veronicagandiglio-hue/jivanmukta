#!/usr/bin/env node
/**
 * verify-content-engine.js — Verifica tecnica del Content Engine
 * =====================================================================
 * Non è un test del design né delle pagine: dimostra soltanto che
 * js/content-engine.js, usato esattamente come lo userebbe una pagina
 * (via fetch HTTP reale, non lettura diretta da filesystem), riesce a:
 *
 *   1. recuperare le quattro entità del Vertical Slice richieste:
 *        che-cose-brahman (question)
 *        brahman (concept)
 *        brhadaranyaka-upanishad (work)
 *        brhad-1-4-1 (passage)
 *   2. recuperare le relazioni inverse del passaggio brhad-1-4-1
 *   3. distinguere correttamente un id inesistente (not-found) da un
 *      indice non caricabile (unavailable)
 *
 * Avvia un piccolo server statico locale sulla cartella del progetto,
 * così che ContentEngine usi lo stesso fetch() che userebbe nel
 * browser — nessuna scorciatoia via filesystem.
 *
 * Uso:  node verify-content-engine.js
 * =====================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ContentEngine = require('./js/content-engine.js');

const MIME = { '.json': 'application/json', '.js': 'text/javascript' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function printResult(label, result) {
  if (result.status === 'ok') {
    const preview = Array.isArray(result.data)
      ? `[${result.data.join(', ')}]`
      : result.data.id || JSON.stringify(result.data).slice(0, 80);
    console.log(`  OK           ${label} → ${preview}`);
  } else if (result.status === 'not-found') {
    console.log(`  NOT-FOUND    ${label} → id "${result.id}" inesistente`);
  } else {
    console.log(`  UNAVAILABLE  ${label} → ${result.message}`);
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  ContentEngine.configure({ basePath: `http://127.0.0.1:${port}/content/` });

  let failures = 0;
  function check(condition, description) {
    console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${description}`);
    if (!condition) failures++;
  }

  console.log('\n=== 1. Entità richieste dal Vertical Slice ===\n');

  const question = await ContentEngine.getQuestion('q-che-cose-brahman');
  printResult('getQuestion("q-che-cose-brahman")', question);
  check(question.status === 'ok' && question.data.text === "Che cos'è Brahman?", 'testo della domanda corretto');

  const concept = await ContentEngine.getConcept('brahman');
  printResult('getConcept("brahman")', concept);
  check(concept.status === 'ok' && concept.data.name === 'Brahman', 'nome del concetto corretto');

  const work = await ContentEngine.getWork('kena-upanishad');
  printResult('getWork("kena-upanishad")', work);
  check(work.status === 'ok' && work.data.title === 'Kenopaniṣad', 'titolo dell\'opera corretto');

  const passage = await ContentEngine.getPassage('kena-1-2');
  printResult('getPassage("kena-1-2")', passage);
  check(passage.status === 'ok' && passage.data.work_id === 'kena-upanishad', 'passaggio collegato all\'opera corretta');

  console.log('\n=== 2. Relazioni inverse del passaggio kena-1-2 ===\n');

  const pQuestions = await ContentEngine.getPassageQuestions('kena-1-2');
  printResult('getPassageQuestions("kena-1-2")', pQuestions);
  check(pQuestions.status === 'ok' && pQuestions.data.includes('q-che-cose-brahman'), 'la domanda q-che-cose-brahman è tra le relazioni inverse');

  const pConcepts = await ContentEngine.getPassageConcepts('kena-1-2');
  printResult('getPassageConcepts("kena-1-2")', pConcepts);
  check(pConcepts.status === 'ok' && pConcepts.data.includes('brahman'), 'brahman è tra i concetti collegati');

  const pCommentaries = await ContentEngine.getPassageCommentaries('kena-1-2');
  printResult('getPassageCommentaries("kena-1-2")', pCommentaries);
  check(pCommentaries.status === 'ok' && pCommentaries.data.includes('comm-kena-soggetto-trascendente'), 'il commentario è collegato');

  const pNotes = await ContentEngine.getPassageNotes('kena-1-2');
  printResult('getPassageNotes("kena-1-2")', pNotes);
  check(pNotes.status === 'ok' && pNotes.data.includes('note-srotrasya-srotram'), 'la nota terminologica è collegata');

  console.log('\n=== 3. Altre relazioni (a scopo dimostrativo) ===\n');

  const conceptQuestions = await ContentEngine.getConceptQuestions('brahman');
  printResult('getConceptQuestions("brahman")', conceptQuestions);

  const workPassages = await ContentEngine.getWorkPassages('kena-upanishad');
  printResult('getWorkPassages("kena-upanishad")', workPassages);

  const relatedQuestions = await ContentEngine.getRelatedQuestions('q-che-cose-brahman');
  if (relatedQuestions.status === 'ok') {
    relatedQuestions.data.forEach((r) => {
      console.log(`  OK           getRelatedQuestions("q-che-cose-brahman") → ${r.id} (${r.why}) risolta: ${r.question.status}`);
    });
  } else {
    printResult('getRelatedQuestions("q-che-cose-brahman")', relatedQuestions);
  }

  console.log('\n=== 4. Distinzione inesistente / non disponibile ===\n');

  const missing = await ContentEngine.getQuestion('domanda-che-non-esiste');
  printResult('getQuestion("domanda-che-non-esiste")', missing);
  check(missing.status === 'not-found', 'id inesistente riconosciuto come not-found, non come errore');

  ContentEngine.clearCache();
  ContentEngine.configure({ basePath: `http://127.0.0.1:${port}/percorso-inesistente/` });
  const unavailableResult = await ContentEngine.getQuestion('q-che-cose-brahman');
  printResult('getQuestion("q-che-cose-brahman") con basePath errato', unavailableResult);
  check(unavailableResult.status === 'unavailable', 'indice non caricabile riconosciuto come unavailable, non confuso con not-found');

  server.close(() => {
    console.log('');
    if (failures > 0) {
      console.log(`Verifica FALLITA: ${failures} controlli non superati.\n`);
      process.exit(1);
    } else {
      console.log('Verifica COMPLETATA: tutti i controlli superati.\n');
    }
  });
}

main().catch((err) => {
  console.error('Errore imprevisto durante la verifica:', err);
  process.exit(1);
});
