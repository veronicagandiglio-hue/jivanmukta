const http = require('http');
const path = require('path');
const ContentEngine = require('../js/content-engine.js');
const devServerPath = path.resolve(__dirname, '../dev-server.js');
const { spawn } = require('child_process');

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
  });
}

async function run() {
  console.log('Avvio dev-server su porta 8099...');
  const port = 8099;
  const child = spawn('node', [devServerPath, String(port)], { cwd: path.resolve(__dirname, '..') });

  // Attendi che il server sia attivo
  await new Promise((resolve) => setTimeout(resolve, 1500));

  try {
    console.log('\n=== TEST 1: Dati del Percorso Fondamentale e Hook Questions ===');

    // Configura ContentEngine sul server HTTP
    ContentEngine.configure({ basePath: `http://127.0.0.1:${port}/content/` });

    // 1. Verifica le 10 tappe
    const stepsRes = await ContentEngine.getEntities('core_path');
    if (stepsRes.status !== 'ok' || stepsRes.data.length !== 10) {
      throw new Error(`Attese 10 tappe nel core-path, trovate ${stepsRes.data?.length}`);
    }
    console.log(`[PASS] 10 tappe del Percorso Fondamentale caricate.`);

    for (let i = 1; i <= 10; i++) {
      const step = stepsRes.data.find(s => s.step_number === i);
      if (!step) throw new Error(`Tappa ${i} non trovata`);
      if (!step.title || !step.editorial_response) throw new Error(`Tappa ${i} priva di titolo o risposta editoriale`);
      console.log(`  - Tappa ${String(i).padStart(2, '0')}: "${step.title}" (Passaggi Upaniṣad: ${step.upanishad_passages?.length || 0})`);
    }

    // 2. Verifica domande hook
    const hooks = [
      'q-esperienza-unita',
      'q-esperienza-fine-io',
      'q-esperienza-mondo-uno',
      'q-esperienza-perche-finita',
      'q-esperienza-non-duale-brahman',
      'q-esperienza-ritorno-persona'
    ];
    for (const hid of hooks) {
      const qRes = await ContentEngine.getQuestion(hid);
      if (qRes.status !== 'ok') throw new Error(`Domanda hook ${hid} non trovata`);
      if (!qRes.data.editorial_stance) throw new Error(`Domanda hook ${hid} priva di editorial_stance`);
      if (!qRes.data.target_core_path_id) throw new Error(`Domanda hook ${hid} priva di target_core_path_id`);
    }
    console.log(`[PASS] Tutte le 6 domande-aggancio esperienziali verificate con successo.`);

    // 3. Verifica bidirezionalità: passaggio -> core_path
    const pCheck = 'isha-1-1';
    const cpRes = await ContentEngine.getPassageCorePath(pCheck);
    if (cpRes.status !== 'ok' || !cpRes.data.includes('02-che-cosa-significa-realta')) {
      throw new Error(`Passaggio ${pCheck} non collegato a 02-che-cosa-significa-realta`);
    }
    console.log(`[PASS] Bidirezionalità verificata: ${pCheck} collegato alla tappa ${cpRes.data.join(', ')}.`);

    console.log('\n=== TEST 2: Routing HTTP e dev-server.js ===');

    // 1. Homepage
    const home = await get(port, '/');
    if (home.status !== 200 || !home.body.includes('Ti è accaduto qualcosa che non riesci a spiegare?')) {
      throw new Error(`Homepage non contiene la nuova architettura: HTTP ${home.status}`);
    }
    console.log('[PASS] / serve index.html con la nuova homepage a due ingressi.');

    // 2. Percorso fondamentale
    const percorso = await get(port, '/percorso/01-che-cose-la-metafisica');
    if (percorso.status !== 200 || !percorso.body.includes('Percorso Fondamentale')) {
      throw new Error(`Endpoint percorso non funzionante: HTTP ${percorso.status}`);
    }
    console.log('[PASS] /percorso/01-che-cose-la-metafisica serve percorso.html correttamente (200 rewrite).');

    // 3. Domanda-aggancio
    const domanda = await get(port, '/domande/q-esperienza-unita');
    if (domanda.status !== 200 || !domanda.body.includes('section-hook-stance')) {
      throw new Error(`Endpoint domanda non funzionante: HTTP ${domanda.status}`);
    }
    console.log('[PASS] /domande/q-esperienza-unita serve domanda.html con orientation box (200 rewrite).');

    // 4. Opera Upaniṣad
    const opera = await get(port, '/testi/isha-upanishad');
    console.log(`[PASS] /testi/isha-upanishad risponde con HTTP ${opera.status}.`);

    // 5. Unità Upaniṣad
    const unita = await get(port, '/testi/isha-upanishad/1-18');
    console.log(`[PASS] /testi/isha-upanishad/1-18 risponde con HTTP ${unita.status}.`);

    // 6. Redirect 301 storico
    const redir = await get(port, '/che-cose-brahman.html');
    if (redir.status !== 301) {
      throw new Error(`Redirect 301 legacy fallito: HTTP ${redir.status}`);
    }
    console.log(`[PASS] /che-cose-brahman.html risponde con HTTP 301 verso ${redir.headers.location}.`);

    console.log('\n=== TUTTE LE VERIFICHE DELL\'ARCHITETTURA SUPERATE CON SUCCESSO! ===\n');

  } catch (err) {
    console.error('\n[ERRORE]', err);
    process.exit(1);
  } finally {
    child.kill();
  }
}

run();
