#!/usr/bin/env node
/**
 * verify-dynamic-templates.js — Verifica tecnica dei template dinamici
 * =====================================================================
 * Verifica per ciascun template (QUESTION, CONCEPT, WORK, AUTHOR, COMPARISON):
 *   1. caricamento tramite Content Engine
 *   2. relazioni corrette
 *   3. assenza di contenuti hardcoded nei file template
 *   4. gestione di contenuto inesistente ('not-found')
 *   5. gestione di contenuto non ancora disponibile ('pending_refs' / 'cited_not_yet_available')
 * =====================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ContentEngine = require('./js/content-engine.js');

const MIME = { '.json': 'application/json', '.js': 'text/javascript', '.html': 'text/html' };

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

async function main() {
  const server = await startServer();
  const port = server.address().port;
  ContentEngine.configure({ basePath: `http://127.0.0.1:${port}/content/` });

  let failures = 0;
  function check(condition, description) {
    console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${description}`);
    if (!condition) failures++;
  }

  console.log('\n======================================================================');
  console.log('1. VERIFICA TEMPLATE CONCEPT (concetto.html)');
  console.log('======================================================================\n');

  const conceptHtml = fs.readFileSync(path.join(ROOT, 'concetto.html'), 'utf8');

  // 1. Caricamento tramite Content Engine
  const brahman = await ContentEngine.getConcept('brahman');
  check(brahman.status === 'ok' && brahman.data.name === 'Brahman', 'Brahman caricato correttamente tramite Content Engine');
  const atman = await ContentEngine.getConcept('atman');
  check(atman.status === 'ok' && atman.data.name === 'Ātman', 'Ātman caricato correttamente tramite Content Engine');

  // 2. Relazioni corrette
  const bQuestions = await ContentEngine.getConceptQuestions('brahman');
  check(bQuestions.status === 'ok' && bQuestions.data.includes('che-cose-brahman'), 'Relazione inversa concept-questions contiene che-cose-brahman');
  check(bQuestions.status === 'ok' && bQuestions.data.includes('confronto-advaita-buddhismo'), 'Relazione inversa concept-questions contiene confronto-advaita-buddhismo');

  const bRelated = await ContentEngine.getRelatedConcepts('brahman');
  check(bRelated.status === 'ok' && bRelated.data.includes('atman'), 'Relazione simmetrica related_concepts collega brahman ad atman');

  const pRes = await ContentEngine.getPassage('brhad-1-4-1');
  check(pRes.status === 'ok' && pRes.data.work_id === 'brhadaranyaka-upanishad', 'Passaggio collegato alla corretta opera');

  // 3. Assenza di contenuti hardcoded
  check(!conceptHtml.includes('<h1>Brahman</h1>') && !conceptHtml.includes('<h1 class="concept-name">Brahman'), 'Nessun titolo di concetto hardcoded nel markup HTML');
  check(!conceptHtml.includes('Ciò da cui procedono origine'), 'Nessuna glossa hardcoded nel markup HTML');

  // 4. Gestione di contenuto inesistente
  const cMissing = await ContentEngine.getConcept('concetto-fantasma');
  check(cMissing.status === 'not-found' && cMissing.id === 'concetto-fantasma', 'Concetto inesistente gestito con status not-found');
  check(conceptHtml.includes("renderError('not-found'") || conceptHtml.includes('renderError(result.status'), 'Template predisposto per renderError(not-found)');

  // 5. Gestione di contenuto non ancora disponibile
  check(Array.isArray(brahman.data.cited_not_yet_available) && brahman.data.cited_not_yet_available.length > 0, 'Presenza di citazioni non ancora disponibili (cited_not_yet_available)');
  check(conceptHtml.includes('unavailable'), 'Presenza di stili/marcatura per contenuti non ancora disponibili (senza link rotti)');


  console.log('\n======================================================================');
  console.log('2. VERIFICA TEMPLATE WORK (opera.html)');
  console.log('======================================================================\n');

  const workHtml = fs.readFileSync(path.join(ROOT, 'opera.html'), 'utf8');

  // 1. Caricamento tramite Content Engine
  const brhad = await ContentEngine.getWork('brhadaranyaka-upanishad');
  check(brhad.status === 'ok' && brhad.data.title === 'Bṛhadāraṇyaka Upaniṣad', 'Opera caricata correttamente tramite Content Engine');

  // 2. Relazioni corrette
  const wPassages = await ContentEngine.getWorkPassages('brhadaranyaka-upanishad');
  check(wPassages.status === 'ok' && wPassages.data.includes('brhad-1-4-1'), 'Relazione work-passages corretta (include brhad-1-4-1)');

  const uRes = await ContentEngine.getUnit('brhadaranyaka-1-4');
  check(uRes.status === 'ok' && uRes.data.work_id === 'brhadaranyaka-upanishad', 'Unità editoriale collegata all\'opera corretta');

  // 3. Assenza di contenuti hardcoded
  check(!workHtml.includes('<h1 class="work-title">Bṛhadāraṇyaka Upaniṣad</h1>') && !workHtml.includes('data-work-title>Bṛhadāraṇyaka'), 'Nessun titolo opera hardcoded nel markup HTML');
  check(!workHtml.includes('Tradizione śruti — tra le Upaniṣad'), 'Nessuna attribuzione hardcoded nel markup HTML');

  // 4. Gestione di contenuto inesistente
  const wMissing = await ContentEngine.getWork('opera-inesistente');
  check(wMissing.status === 'not-found' && wMissing.id === 'opera-inesistente', 'Opera inesistente gestita con status not-found');
  check(workHtml.includes("renderError('not-found'") || workHtml.includes('renderError(result.status'), 'Template predisposto per renderError(not-found)');

  // 5. Gestione di contenuto non ancora disponibile
  check(Array.isArray(brhad.data.chapters_outline) && brhad.data.chapters_outline.some(c => c.available === false), 'Capitoli non ancora disponibili definiti nel modello dati con available: false');
  check(workHtml.includes('contents__item') || workHtml.includes('unavailable'), 'Capitoli non disponibili renderizzati come testo e non come link rotti');


  console.log('\n======================================================================');
  console.log('3. VERIFICA TEMPLATE AUTHOR (autore.html)');
  console.log('======================================================================\n');

  const authorHtml = fs.readFileSync(path.join(ROOT, 'autore.html'), 'utf8');

  // 1. Caricamento tramite Content Engine
  const shankara = await ContentEngine.getAuthor('shankara');
  check(shankara.status === 'ok' && shankara.data.name === 'Śaṅkara', 'Autore caricato correttamente tramite Content Engine');

  // 2. Relazioni corrette
  const aWorks = await ContentEngine.getAuthorWorks('shankara');
  check(aWorks.status === 'ok' && aWorks.data.includes('brhadaranyaka-upanishad'), 'Relazione author-works derivata dal commentario include brhadaranyaka-upanishad');

  const aConcepts = await ContentEngine.getAuthorConcepts('shankara');
  check(aConcepts.status === 'ok' && aConcepts.data.includes('brahman') && aConcepts.data.includes('atman'), 'Relazione author-concepts include brahman e atman');

  // 3. Assenza di contenuti hardcoded
  check(!authorHtml.includes('<h1 class="author-name">Śaṅkara</h1>') && !authorHtml.includes('<h1 class="author-name">\n      Śaṅkara'), 'Nessun nome autore hardcoded nel markup HTML');
  check(!authorHtml.includes('Riconosciuto dalla tradizione come il sistematizzatore'), 'Nessun contesto autore hardcoded nel markup HTML');

  // 4. Gestione di contenuto inesistente
  const aMissing = await ContentEngine.getAuthor('autore-inesistente');
  check(aMissing.status === 'not-found' && aMissing.id === 'autore-inesistente', 'Autore inesistente gestito con status not-found');
  check(authorHtml.includes("renderError('not-found'") || authorHtml.includes('renderError(result.status'), 'Template predisposto per renderError(not-found)');

  // 5. Gestione di contenuto non ancora disponibile
  check(Array.isArray(shankara.data.pending_works) && shankara.data.pending_works.length > 0, 'Opere pendenti censite in pending_works');
  check(Array.isArray(shankara.data.pending_related_authors) && shankara.data.pending_related_authors.length > 0, 'Autori correlati pendenti censiti in pending_related_authors');
  check(authorHtml.includes('unavailable'), 'Riferimenti pendenti visualizzati senza link rotti (#)');


  console.log('\n======================================================================');
  console.log('4. VERIFICA TEMPLATE COMPARISON (confronto.html)');
  console.log('======================================================================\n');

  const compHtml = fs.readFileSync(path.join(ROOT, 'confronto.html'), 'utf8');

  // 1. Caricamento tramite Content Engine
  const confronto = await ContentEngine.getQuestion('confronto-advaita-buddhismo');
  check(confronto.status === 'ok' && confronto.data.type === 'comparison', 'Confronto caricato correttamente come Question di tipo comparison');
  check(confronto.data.text === 'Advaita e Buddhismo affermano la stessa cosa?', 'Titolo del confronto corretto');

  // 2. Relazioni corrette
  check(Array.isArray(confronto.data.concepts) && confronto.data.concepts.includes('atman') && confronto.data.concepts.includes('brahman'), 'Concetti relazionati censiti nel confronto');
  const compQ = await ContentEngine.getConceptQuestions('atman');
  check(compQ.status === 'ok' && compQ.data.includes('confronto-advaita-buddhismo'), 'Il confronto compare nelle relazioni inverse dei concetti in gioco (atman)');

  // 3. Assenza di contenuti hardcoded
  check(!compHtml.includes('<h1 class="question" style="margin-top: var(--sp-2);">Advaita e Buddhismo'), 'Nessuna domanda hardcoded nel markup HTML di confronto');
  check(!compHtml.includes('L\'accostamento è frequente, spesso a partire da somiglianze'), 'Nessun problema introduttivo hardcoded nel markup HTML di confronto');

  // 4. Gestione di contenuto inesistente
  const qMissing = await ContentEngine.getQuestion('confronto-inesistente');
  check(qMissing.status === 'not-found' && qMissing.id === 'confronto-inesistente', 'Confronto inesistente gestito con status not-found');
  check(compHtml.includes("renderError('not-found'") || compHtml.includes('renderError(result.status'), 'Template predisposto per renderError(not-found)');

  // 5. Gestione di contenuto non ancora disponibile
  check(Array.isArray(confronto.data.terms) && confronto.data.terms.some(t => t.term_b.available === false), 'Termini non ancora censiti nel sito indicati con available: false');
  check(compHtml.includes('terms__b unavailable') || compHtml.includes('concept terms__b unavailable'), 'Termini non ancora censiti renderizzati come span non cliccabili');


  console.log('\n======================================================================');
  console.log('5. VERIFICA NAVIGAZIONE INCROCIATA TRA TEMPLATE DINAMICI');
  console.log('======================================================================\n');

  const domHtml = fs.readFileSync(path.join(ROOT, 'domanda.html'), 'utf8');
  check(domHtml.includes("kind === 'works') return UrlRouter.buildContentUrl('testi'"), "domanda.html punta a /testi/ (UrlRouter) per le opere");
  check(domHtml.includes("kind === 'authors') return UrlRouter.buildContentUrl('autori'"), "domanda.html punta a /autori/ (UrlRouter) per gli autori");
  check(domHtml.includes("kind === 'concepts') return UrlRouter.buildContentUrl('concetti'"), "domanda.html punta a /concetti/ (UrlRouter) per i concetti");

  check(conceptHtml.includes("questionUrl(q.id)"), 'concetto.html punta a domanda.html per le domande');
  check(conceptHtml.includes("workUrl(p.work_id)"), 'concetto.html punta a opera.html per le opere');
  check(conceptHtml.includes("authorUrl(aResult.data.id)"), 'concetto.html punta a autore.html per gli autori');

  check(authorHtml.includes("workUrl(wid)"), 'autore.html punta a opera.html per le opere');
  check(authorHtml.includes("conceptUrl(cid)"), 'autore.html punta a concetto.html per i concetti');
  check(authorHtml.includes("questionUrl(q.id)"), 'autore.html punta a domanda.html per le domande');

  check(compHtml.includes("conceptUrl(termAId)") || compHtml.includes("conceptUrl(t.term_a.id)"), 'confronto.html punta a concetto.html per i concetti');
  check(compHtml.includes("workUrl(s.work_id)"), 'confronto.html punta a opera.html per le opere');
  check(compHtml.includes("authorUrl(s.author_id)") || compHtml.includes("authorUrl(a.id)"), 'confronto.html punta a autore.html per gli autori');

  server.close();

  console.log('\n======================================================================');
  if (failures > 0) {
    console.log(`Verifica FALLITA: ${failures} controlli non superati.\n`);
    process.exit(1);
  } else {
    console.log('Verifica COMPLETATA CON SUCCESSO: tutti i controlli superati al 100%.\n');
  }
}

main().catch((err) => {
  console.error('Errore imprevisto durante la verifica:', err);
  process.exit(1);
});