const http = require('http');
const fs = require('fs');
const path = require('path');
const ContentEngine = require('./js/content-engine.js');

const ROOT = __dirname;
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

async function testVerticalSlice() {
  console.log('=== TEST VERTICAL SLICE RIFORMA EDITORIALE ===\n');

  const server = await startServer();
  const port = server.address().port;
  ContentEngine.configure({ basePath: `http://127.0.0.1:${port}/content/` });

  try {
    // 1. Homepage: verifica che le domande globali siano 8 e ordinate per priority
    const qResult = await ContentEngine.getEntities('question');
    if (qResult.status !== 'ok') {
      throw new Error('Impossibile caricare le domande: ' + qResult.message);
    }

    const globalQuestions = qResult.data
      .filter(q => q.scope === 'global')
      .sort((a, b) => (a.homepage_priority || 999) - (b.homepage_priority || 999));

    console.log(`[PASS] Domande globali trovate: ${globalQuestions.length}`);
    globalQuestions.forEach((g, i) => {
      console.log(`   ${i + 1}. [${g.id}] priority=${g.homepage_priority}: "${g.text}"`);
    });

    if (globalQuestions.length !== 8) {
      throw new Error(`Previste 8 domande globali, trovate ${globalQuestions.length}`);
    }

    // 2. Verifica la domanda fondamentale: "Che cos'è Brahman?"
    const brahmanQ = await ContentEngine.getQuestion('q-che-cose-brahman');
    if (brahmanQ.status !== 'ok') {
      throw new Error('Domanda q-che-cose-brahman non trovata');
    }
    console.log('\n[PASS] Domanda q-che-cose-brahman caricata.');
    console.log(`   Testo: "${brahmanQ.data.text}"`);
    console.log(`   Introduzione presente: ${Boolean(brahmanQ.data.introduction)} (lunghezza: ${brahmanQ.data.introduction.length} caratteri)`);
    console.log(`   Passaggi associati: ${brahmanQ.data.passages.join(', ')}`);

    // Verifica che i passaggi appartengano a più opere distinte
    const worksFound = new Set();
    for (const pid of brahmanQ.data.passages) {
      const pRes = await ContentEngine.getPassage(pid);
      if (pRes.status === 'ok' && pRes.data.work_id) {
        worksFound.add(pRes.data.work_id);
      }
    }
    console.log(`[PASS] Opere trasversali coinvolte nella domanda: ${Array.from(worksFound).join(', ')}`);
    if (!worksFound.has('kena-upanishad') || !worksFound.has('isha-upanishad')) {
      throw new Error('La domanda non raccoglie passaggi sia da Kena che da Isha!');
    }

    // 3. Spiegazioni Jivanmukta
    console.log('\n[PASS] Verifica Spiegazioni Jivanmukta:');
    const expIndex = JSON.parse(fs.readFileSync('./content/_index/explanation-index.json', 'utf8'));
    console.log(`   Spiegazioni presenti in archivio: ${Object.keys(expIndex).length}`);
    for (const [id, exp] of Object.entries(expIndex)) {
      console.log(`   - ${id}: target=[${exp.target_type}:${exp.target_id}], sezioni=${exp.sections.length}, titolo="${exp.title || 'Nessuno'}"`);
    }

    // 4. Verifica passaggi con spiegazione
    const kena11Exp = await ContentEngine.getPassageExplanations('kena-1-1');
    console.log(`\n[PASS] kena-1-1 ha spiegazioni: ${kena11Exp.data.join(', ')}`);
    if (!kena11Exp.data.includes('expl-kena-1-1')) {
      throw new Error('kena-1-1 non ha collegata expl-kena-1-1');
    }

    const isha11Exp = await ContentEngine.getPassageExplanations('isha-1-1');
    console.log(`[PASS] isha-1-1 ha spiegazioni: ${isha11Exp.data.join(', ')}`);
    if (!isha11Exp.data.includes('expl-isha-1-1')) {
      throw new Error('isha-1-1 non ha collegata expl-isha-1-1');
    }

    // 5. Verifica passaggio -> domande (relazione inversa)
    const kena11Q = await ContentEngine.getPassageQuestions('kena-1-1');
    console.log(`[PASS] kena-1-1 contribuisce alle domande: ${kena11Q.data.join(', ')}`);
    if (!kena11Q.data.includes('q-che-cose-brahman')) {
      throw new Error('kena-1-1 non è collegato a q-che-cose-brahman');
    }

    // 6. Verifica question-index-for-gemini.json
    const geminiIndex = JSON.parse(fs.readFileSync('./content/_index/question-index-for-gemini.json', 'utf8'));
    console.log(`\n[PASS] question-index-for-gemini.json generato con ${geminiIndex.length} domande.`);
    const gBrahman = geminiIndex.find(q => q.id === 'q-che-cose-brahman');
    console.log(`   Dati per Gemini di q-che-cose-brahman:`);
    console.log(`     scope: ${gBrahman.scope}`);
    console.log(`     child_questions: ${gBrahman.child_questions.join(', ')}`);

    console.log('\n=== TUTTI I CONTROLLI VERTICAL SLICE SUPERATI CON SUCCESSO! ===');
  } finally {
    server.close();
  }
}

testVerticalSlice().catch(err => {
  console.error('\n[FAIL] Errore:', err);
  process.exit(1);
});
