#!/usr/bin/env node
/**
 * dev-server.js — server locale che rispetta /_redirects
 * =====================================================================
 * npx serve e python3 -m http.server sono server "dumb": non sanno
 * nulla del file /_redirects (che è una convenzione di hosting tipo
 * Cloudflare Pages o Netlify), quindi gli URL "puliti" del sito
 * (/testi/<id>, /domande/<id>, /concetti/<id>, /autori/<id>,
 * /confronti/<id>, /testi/<id>/<cap>[/<sez>]) danno sempre 404 in
 * locale, anche se in produzione funzionano benissimo.
 *
 * Questo script legge /_redirects allo stesso modo di Cloudflare
 * Pages / Netlify:
 *   - path con wildcard (*) o parametri (:nome) vengono confrontati
 *     nell'ordine in cui compaiono nel file (la prima regola che
 *     corrisponde vince, esattamente come da commento in _redirects);
 *   - status 200  -> rewrite interno: il browser mantiene l'URL
 *     "pulito" nella barra degli indirizzi, il server serve però il
 *     file di destinazione (es. opera.html) SENZA redirect visibile;
 *   - status 301  -> redirect vero e proprio: il browser viene
 *     mandato sul nuovo URL, che poi verrà rimatchato dalle regole
 *     sopra (perché nel file le regole 301 puntano a URL "puliti",
 *     che a loro volta matchano una regola 200 più in alto).
 *
 * Se nessuna regola combacia, il file cercato esiste fisicamente sul
 * disco (es. index.html, un file .js, un'immagine), o è una richiesta
 * a /content/*.json: si serve il file così com'è, normale static
 * file serving. Se non esiste nulla, 404.
 *
 * Non modifica /content, non modifica _redirects, non scrive nulla
 * sul disco: legge soltanto.
 *
 * Uso:
 *   node dev-server.js [porta] [cartella-radice]
 *   (default: porta 8000, cartella corrente)
 * =====================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.argv[2], 10) || 8000;
const ROOT = path.resolve(process.argv[3] || '.');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * Parsa /_redirects nello stesso formato usato da Cloudflare Pages /
 * Netlify: righe vuote e commenti (#) ignorati, ogni riga valida è
 * "<da>  <a>  <status>" separati da spazi/tab multipli.
 */
function loadRedirects(redirectsPath) {
  if (!fs.existsSync(redirectsPath)) return [];
  const lines = fs.readFileSync(redirectsPath, 'utf8').split(/\r?\n/);
  const rules = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 3) continue;
    const [from, to, status] = parts;
    rules.push({ from, to, status: parseInt(status, 10) });
  }
  return rules;
}

/**
 * Converte un pattern stile _redirects (con :param e *) in una regex
 * con gruppi nominati, così possiamo sia verificare il match sia
 * sostituire i placeholder nel target.
 */
function compilePattern(pattern) {
  const paramNames = [];
  let regexStr = '^';
  const segments = pattern.split('/').filter((s) => s !== '');
  for (const seg of segments) {
    regexStr += '/';
    if (seg === '*') {
      paramNames.push('splat');
      regexStr += '(.*)';
    } else if (seg.startsWith(':')) {
      paramNames.push(seg.slice(1));
      regexStr += '([^/]+)';
    } else {
      regexStr += seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  regexStr += '/?$';
  return { regex: new RegExp(regexStr), paramNames };
}

/**
 * Applica le regole di redirect a un pathname. Restituisce
 * { status, destination } oppure null se nessuna regola combacia.
 * Rispetta l'ordine del file: la prima regola che matcha vince.
 */
function matchRedirect(rules, pathname) {
  for (const rule of rules) {
    const { regex, paramNames } = compilePattern(rule.from);
    const m = regex.exec(pathname);
    if (!m) continue;

    const params = {};
    paramNames.forEach((name, i) => { params[name] = m[i + 1]; });

    // Sostituisce sia :nome che * (via "splat") nel target.
    let destination = rule.to;
    if (destination.includes('*') && params.splat !== undefined) {
      destination = destination.replace('*', params.splat);
    }
    destination = destination.replace(/:([a-zA-Z_]+)/g, (_, name) =>
      params[name] !== undefined ? params[name] : ':' + name
    );

    return { status: rule.status, destination };
  }
  return null;
}

function send404(res, message) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<h1>Error response</h1><p>Error code: 404</p><p>Message: ${message}</p>` +
    `<p>Error code explanation: 404 - Nothing matches the given URI.</p>`
  );
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send404(res, 'File not found.');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/**
 * Data una richiesta di pathname, prova a risolverla su disco:
 * prima come file esatto, poi (se è una directory o manca
 * l'estensione) come index.html dentro quella cartella.
 */
function resolveOnDisk(pathname) {
  const candidate = path.join(ROOT, decodeURIComponent(pathname));
  if (!candidate.startsWith(ROOT)) return null; // niente path traversal
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  const asIndex = path.join(candidate, 'index.html');
  if (fs.existsSync(asIndex)) return asIndex;
  return null;
}

const redirectRules = loadRedirects(path.join(ROOT, '_redirects'));
console.log(`Regole di redirect caricate da _redirects: ${redirectRules.length}`);

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let pathname = parsed.pathname;

  // Fino a 5 rewrite/redirect concatenati, per evitare loop infiniti
  // in caso di regole che si richiamano a vicenda per errore.
  for (let hop = 0; hop < 5; hop++) {
    // 1. Il file esiste già fisicamente così com'è? Servilo subito,
    //    senza applicare regole (stesso comportamento di Cloudflare
    //    Pages: gli asset reali hanno sempre priorità sui redirect
    //    quando il path coincide esattamente con un file esistente
    //    E non c'è una regola più specifica pensata apposta per lui).
    const direct = resolveOnDisk(pathname);
    const matched = matchRedirect(redirectRules, pathname);

    if (!matched) {
      if (direct) {
        serveStaticFile(res, direct);
      } else {
        send404(res, 'File not found.');
      }
      return;
    }

    if (matched.status === 301) {
      // Redirect vero: il browser deve rifare la richiesta sul nuovo
      // URL, mantenendo però l'eventuale query string originale.
      const location = matched.destination + (parsed.search || '');
      res.writeHead(301, { Location: location });
      res.end();
      return;
    }

    // status 200 = rewrite interno: il browser mantiene l'URL nella
    // barra degli indirizzi, ma serviamo il file di destinazione. La
    // query string originale (es. eventuali ?rif= residui) va
    // preservata per compatibilità con il resto del codice.
    pathname = matched.destination;
  }

  send404(res, 'Troppi redirect concatenati (possibile loop in _redirects).');
});

server.listen(PORT, () => {
  console.log(`Server con supporto _redirects attivo su http://localhost:${PORT}`);
  console.log(`Cartella servita: ${ROOT}`);
  console.log('');
  console.log('Ora puoi usare gli URL "puliti" del sito, es.:');
  console.log(`  http://localhost:${PORT}/testi/brhadaranyaka-upanishad`);
  console.log(`  http://localhost:${PORT}/domande/che-cose-brahman`);
  console.log(`  http://localhost:${PORT}/concetti/brahman`);
  console.log(`  http://localhost:${PORT}/autori/shankara`);
});
