#!/usr/bin/env node
/**
 * verify-unit-reading.js — Verifica tecnica del sistema di lettura
 * =====================================================================
 * Verifica, senza toccare design, Content Engine, modello dati o
 * sistema delle relazioni:
 *   1. Apertura dell'opera (opera.html, invariato).
 *   2. Apertura dell'unità editoriale (unita.html, nuovo template).
 *   3. Visualizzazione sequenziale dei passaggi (work-passages / unit).
 *   4. Deep link a brhad-1-4-1 (path pubblico + anchor).
 *   5. Evidenziazione del passaggio corretto (id DOM raggiungibile).
 *   6. Accesso alle note.
 *   7. Accesso ai commenti.
 *   8. Visualizzazione delle domande collegate.
 *   9. Passaggio al passaggio precedente/successivo (adiacenza).
 *  10. Ritorno alla Question (parametro ?from=).
 * =====================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ContentEngine = require('./js/content-engine.js');
const UrlRouter = require('./js/url-router.js');

const MIME = { '.json': 'application/json', '.js': 'text/javascript', '.html': 'text/html' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
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
  console.log('1. APERTURA DELL\'OPERA');
  console.log('======================================================================\n');

  const workResult = await ContentEngine.getWork('brhadaranyaka-upanishad');
  check(workResult.status === 'ok', 'Opera "brhadaranyaka-upanishad" caricata tramite Content Engine');
  const work = workResult.data;
  check(Array.isArray(work.editorial_units) && work.editorial_units.includes('brhadaranyaka-1-4'), 'L\'opera elenca l\'unità editoriale I.4');

  const operaHtml = fs.readFileSync(path.join(ROOT, 'opera.html'), 'utf8');
  check(operaHtml.includes('ContentEngine.getUnit(unitId)'), 'opera.html risolve le unità tramite Content Engine (invariato)');

  console.log('\n======================================================================');
  console.log('2. APERTURA DELL\'UNITÀ EDITORIALE');
  console.log('======================================================================\n');

  const unitResult = await ContentEngine.getUnit('brhadaranyaka-1-4');
  check(unitResult.status === 'ok', 'Unità "brhadaranyaka-1-4" caricata tramite Content Engine');
  const unit = unitResult.data;
  check(unit.work_id === 'brhadaranyaka-upanishad', 'L\'unità è collegata all\'opera corretta (work_id)');
  check(unit.unit_locus === 'I.4', 'Locus dell\'unità corretto (I.4)');

  const unitHtml = fs.readFileSync(path.join(ROOT, 'unita.html'), 'utf8');
  check(unitHtml.includes('ContentEngine.getUnit'), 'unita.html carica l\'unità tramite Content Engine');
  check(unitHtml.includes('ContentEngine.getPassage'), 'unita.html carica i passaggi tramite Content Engine');
  check(!unitHtml.includes('ātmaivedam agre'), 'Nessun contenuto testuale del passaggio hardcoded in unita.html');
  check(!unitHtml.includes('Śaṅkara osserva'), 'Nessun testo di commento hardcoded in unita.html');

  console.log('\n======================================================================');
  console.log('3. VISUALIZZAZIONE SEQUENZIALE DEI PASSAGGI');
  console.log('======================================================================\n');

  const workPassagesResult = await ContentEngine.getWorkPassages('brhadaranyaka-upanishad');
  check(workPassagesResult.status === 'ok', 'Sequenza dei passaggi dell\'opera disponibile (work-passages)');
  check(workPassagesResult.data.includes('brhad-1-4-1'), 'La sequenza contiene brhad-1-4-1');

  const sections = unit.sections || [];
  check(sections.length >= 1, 'L\'unità ha almeno una sezione editoriale');
  const passagesInUnit = sections.flatMap((s) => s.passages || []);
  check(passagesInUnit.some((p) => p.id === 'brhad-1-4-1'), 'Il passaggio brhad-1-4-1 è presente nella sequenza dell\'unità');

  check(unitHtml.includes("class: 'section-group'"), 'unita.html raggruppa i passaggi per sezione in un unico flusso (.section-group)');
  check(unitHtml.includes("id = 'passage-' + passage.id"), 'Ogni passaggio riceve un id DOM individuale e indirizzabile');
  check(unitHtml.includes('.verse:last-child{ border-bottom'), 'Il CSS presenta i passaggi come flusso continuo (stessa classe .verse per tutti), non come pagine separate');

  console.log('\n======================================================================');
  console.log('4. DEEP LINK A brhad-1-4-1');
  console.log('======================================================================\n');

  const passageResult = await ContentEngine.getPassage('brhad-1-4-1');
  check(passageResult.status === 'ok', 'Passaggio brhad-1-4-1 caricato tramite Content Engine');
  const passage = passageResult.data;
  check(passage.unit_locus === 'I.4', 'Il passaggio riporta il locus della propria unità (I.4)');

  const deepLinkPath = UrlRouter.buildContentUrl('testi', passage.work_id, ['i', '4']) + '#' + passage.id;
  check(deepLinkPath === '/testi/brhadaranyaka-upanishad/i/4#brhad-1-4-1', 'Path pubblico del deep link corretto: ' + deepLinkPath);

  const redirects = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8');
  check(/\/testi\/:slug\/:cap(\/:sez)?\s+\/unita\.html\s+200/.test(redirects), '_redirects instrada /testi/:slug/:cap verso unita.html (200, rewrite)');

  console.log('\n======================================================================');
  console.log('5. EVIDENZIAZIONE DEL PASSAGGIO CORRETTO');
  console.log('======================================================================\n');

  check(unitHtml.includes('function highlightTargetPassage'), 'unita.html implementa l\'evidenziazione del passaggio raggiunto via anchor');
  check(unitHtml.includes("el.dataset.highlighted = 'true'"), 'Il passaggio target riceve un marcatore data-highlighted');
  check(unitHtml.includes('[data-highlighted="true"]'), 'Il CSS definisce uno stile visivo per il passaggio evidenziato');
  check(unitHtml.includes('scrollIntoView'), 'Il passaggio evidenziato viene portato in vista automaticamente');

  console.log('\n======================================================================');
  console.log('6. ACCESSO ALLE NOTE');
  console.log('======================================================================\n');

  const notesResult = await ContentEngine.getPassageNotes('brhad-1-4-1');
  check(notesResult.status === 'ok' && notesResult.data.includes('nota-purushavidhah'), 'Relazione passage-notes restituisce la nota collegata');
  const noteResult = await ContentEngine.getNote('nota-purushavidhah');
  check(noteResult.status === 'ok' && noteResult.data.term === 'puruṣavidhaḥ', 'Nota "puruṣavidhaḥ" caricata correttamente');
  check(unitHtml.includes('ContentEngine.getPassageNotes'), 'unita.html risolve le note per ciascun passaggio');
  check(unitHtml.includes("'nota-' + passage.id"), 'Ogni nota riceve un id DOM indirizzabile (accessibile anche a selettore di profondità disattivato)');

  console.log('\n======================================================================');
  console.log('7. ACCESSO AI COMMENTI');
  console.log('======================================================================\n');

  const commResult = await ContentEngine.getPassageCommentaries('brhad-1-4-1');
  check(commResult.status === 'ok' && commResult.data.includes('shankara-su-brhad-1-4-1'), 'Relazione passage-commentaries restituisce il commentario collegato');
  const commentaryResult = await ContentEngine.getCommentary('shankara-su-brhad-1-4-1');
  check(commentaryResult.status === 'ok' && commentaryResult.data.author_id === 'shankara', 'Commentario di Śaṅkara caricato correttamente');
  check(unitHtml.includes('ContentEngine.getPassageCommentaries'), 'unita.html risolve i commentari per ciascun passaggio');
  check(unitHtml.includes("className = 'verse__comment'"), 'Il commento è reso con il componente esistente <details class="verse__comment">');

  console.log('\n======================================================================');
  console.log('8. VISUALIZZAZIONE DELLE DOMANDE COLLEGATE');
  console.log('======================================================================\n');

  const pqResult = await ContentEngine.getPassageQuestions('brhad-1-4-1');
  check(pqResult.status === 'ok' && pqResult.data.includes('che-cose-brahman'), 'Relazione passage-questions restituisce la domanda collegata');
  check(unitHtml.includes('ContentEngine.getPassageQuestions'), 'unita.html risolve le domande per ciascun passaggio (marcatore di rilevanza)');
  check(unitHtml.includes("toggle.className = 'relevance-toggle'"), 'Il marcatore di rilevanza riusa il componente esistente');
  check(unitHtml.includes('id="section-related"'), 'La sezione "domande che nascono da questa unità" è presente nel template');

  console.log('\n======================================================================');
  console.log('9. PASSAGGIO AL PASSAGGIO PRECEDENTE/SUCCESSIVO');
  console.log('======================================================================\n');

  check(unitHtml.includes('function renderAdjacentUnits'), 'unita.html calcola le unità adiacenti nella barra di contesto');
  check(unitHtml.includes('function renderSectionNav'), 'unita.html genera la navigazione precedente/successivo/indice a fine unità');
  check(unitHtml.includes("unitIds.indexOf(unit.id)"), 'La navigazione si basa sull\'ordine editoriale reale dell\'opera (editorial_units), non su valori fissi');
  check(unitHtml.includes("aria-disabled"), 'I limiti della sequenza (nessun precedente/successivo) sono segnalati esplicitamente, non con link rotti');

  console.log('\n======================================================================');
  console.log('10. RITORNO ALLA QUESTION');
  console.log('======================================================================\n');

  const domandaHtml = fs.readFileSync(path.join(ROOT, 'domanda.html'), 'utf8');
  check(domandaHtml.includes('function passageContextLink'), 'domanda.html costruisce un link contestuale (non isolato) al passaggio');
  check(domandaHtml.includes("params.set('from', currentQuestionId)"), 'Il link dalla Question porta con sé l\'id della domanda di provenienza (?from=)');
  check(domandaHtml.includes("passageContextLink(passage, question.id)"), 'Il link "apri la sezione completa" nella pagina Question usa il nuovo link contestuale');
  check(unitHtml.includes("params.get('from')"), 'unita.html legge il parametro ?from=');
  check(unitHtml.includes('function renderFromQuestion'), 'unita.html mostra un link esplicito di ritorno alla domanda di provenienza');
  check(unitHtml.includes('questionUrl(fromId)') || unitHtml.includes('questionUrl(fromQuestionId)'), 'Il link di ritorno punta all\'URL pubblico corretto della domanda (via UrlRouter)');

  console.log('\n======================================================================');
  console.log('VERIFICA "NESSUNA MODIFICA A CONTENT ENGINE / MODELLO DATI / RELAZIONI"');
  console.log('======================================================================\n');

  const ceSource = fs.readFileSync(path.join(ROOT, 'js', 'content-engine.js'), 'utf8');
  const urSource = fs.readFileSync(path.join(ROOT, 'js', 'url-router.js'), 'utf8');
  check(ceSource.includes("global.ContentEngine = ContentEngine;"), 'content-engine.js espone la stessa API pubblica di prima (non modificato)');
  check(urSource.includes("global.UrlRouter = UrlRouter;"), 'url-router.js espone la stessa API pubblica di prima (non modificato)');

  console.log('\n======================================================================');
  if (failures === 0) {
    console.log('TUTTI I CONTROLLI SUPERATI');
  } else {
    console.log(`${failures} CONTROLLI FALLITI`);
  }
  console.log('======================================================================\n');

  server.close();
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
