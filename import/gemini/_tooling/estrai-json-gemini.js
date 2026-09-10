#!/usr/bin/env node
/**
 * estrai-json-gemini.js — Estrazione del pacchetto JSON dalla risposta di Gemini
 * =====================================================================
 * Gemini, nella seconda fase (PROMPT 2 di promptgemini.md), restituisce
 * una Parte A (report leggibile in prosa) seguita da una Parte B (un
 * unico blocco di codice JSON). Questo script prende in input il testo
 * completo della risposta così com'è stato incollato — con tutto il
 * report davanti, eventuali intestazioni tipo "## Parte B", e magari
 * del testo anche dopo il blocco — ed estrae SOLO il blocco JSON,
 * verificando che sia sintatticamente valido, per salvarlo pronto
 * per /import/gemini/incoming/.
 *
 * Non modifica /content. Non chiama validate-package.js (fallo dopo,
 * separatamente). Non modifica il contenuto del JSON: lo estrae e basta.
 *
 * Strategia di estrazione, in ordine:
 *   1. Cerca un blocco delimitato da ```json ... ``` (o ``` ... ``` puro).
 *      Se ce n'è più di uno, prende l'ULTIMO (la Parte B viene sempre
 *      dopo il report, quindi in caso di blocchi multipli il pacchetto
 *      vero è l'ultimo).
 *   2. Se non trova alcun blocco delimitato da backtick, cerca il più
 *      ampio oggetto JSON bilanciato nel testo (dalla prima "{" alla
 *      "}" corrispondente, contando le graffe) che contenga la stringa
 *      "package_format".
 *   3. Se nessuna delle due strategie produce un JSON parsabile,
 *      lo script si ferma e segnala l'errore: non tenta correzioni
 *      automatiche del JSON, per non introdurre alterazioni silenziose
 *      al contenuto prodotto da Gemini.
 *
 * Uso:
 *   node estrai-json-gemini.js <file-risposta.txt> [output.json]
 *
 * Se [output.json] è omesso, stampa il JSON estratto (formattato) su
 * stdout, senza scrivere alcun file.
 *
 * Può anche essere richiamato come modulo:
 *   const { extractPackageJSON } = require('./estrai-json-gemini');
 *   const { json, pkg, warnings } = extractPackageJSON(testoCompleto);
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');

/**
 * Trova tutti i blocchi delimitati da backtick tripli nel testo.
 * Riconosce sia ```json ... ``` sia ``` ... ``` senza etichetta.
 * @returns {{lang: string, content: string, start: number, end: number}[]}
 */
function findFencedBlocks(text) {
  const blocks = [];
  const fenceRe = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    blocks.push({
      lang: (m[1] || '').toLowerCase(),
      content: m[2],
      start: m.index,
      end: m.index + m[0].length
    });
  }
  return blocks;
}

/**
 * Cerca, a partire da ogni occorrenza di "{" nel testo, il più ampio
 * oggetto JSON bilanciato (contando le graffe, ignorando quelle dentro
 * stringhe). Restituisce il primo candidato bilanciato che contiene
 * "package_format" e che effettivamente fa il parse.
 */
function findBalancedJSONObject(text) {
  const candidates = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === stringChar) {
          inString = false;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(i, j + 1));
          break;
        }
      }
    }
  }
  // Preferisce, tra i candidati bilanciati, quelli che contengono
  // "package_format" e sceglie il più lungo (più probabile che sia
  // l'intero pacchetto e non un sotto-oggetto annidato citato altrove).
  const withMarker = candidates.filter((c) => c.includes('package_format'));
  const pool = withMarker.length ? withMarker : candidates;
  pool.sort((a, b) => b.length - a.length);
  return pool;
}

/**
 * Prova a fare il parse di una stringa come JSON. Restituisce l'oggetto
 * o null se il parse fallisce.
 */
function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

/**
 * Estrae il pacchetto JSON da un testo di risposta completo (report +
 * blocco JSON, o solo blocco JSON).
 *
 * @param {string} text - testo completo della risposta di Gemini
 * @returns {{json: string, pkg: object, warnings: string[]}}
 * @throws {Error} se nessuna strategia produce un JSON valido
 */
function extractPackageJSON(text) {
  const warnings = [];

  // Strategia 1: blocchi delimitati da backtick tripli.
  const fenced = findFencedBlocks(text);
  if (fenced.length > 0) {
    // Preferisce i blocchi etichettati "json"; se ce ne sono più di
    // uno, prende l'ultimo (la Parte B viene dopo la Parte A nel testo).
    const jsonLabeled = fenced.filter((b) => b.lang === 'json');
    const pool = jsonLabeled.length ? jsonLabeled : fenced;

    if (fenced.length > 1) {
      warnings.push(
        `Trovati ${fenced.length} blocchi delimitati da backtick nel testo; ` +
        `uso l'ultimo blocco ${jsonLabeled.length ? 'etichettato "json"' : 'trovato'} ` +
        `(assumendo che la Parte B segua la Parte A).`
      );
    }

    // Prova dall'ultimo al primo tra quelli nel pool scelto, in caso
    // l'ultimo non sia in realtà parsabile (es. un blocco di esempio).
    for (let i = pool.length - 1; i >= 0; i--) {
      const candidate = pool[i].content.trim();
      const pkg = tryParse(candidate);
      if (pkg && typeof pkg === 'object') {
        if (!pkg.package_format) {
          warnings.push(
            'Il blocco JSON estratto non contiene il campo "package_format": ' +
            'verificare che sia davvero il pacchetto e non un frammento diverso.'
          );
        }
        return { json: JSON.stringify(pkg, null, 2), pkg, warnings };
      }
    }
    warnings.push(
      'Trovati blocchi delimitati da backtick, ma nessuno contiene JSON sintatticamente valido. ' +
      'Provo con la ricerca di un oggetto JSON bilanciato nel testo grezzo.'
    );
  } else {
    warnings.push(
      'Nessun blocco delimitato da ``` trovato nel testo. ' +
      'Provo con la ricerca di un oggetto JSON bilanciato nel testo grezzo.'
    );
  }

  // Strategia 2: oggetto JSON bilanciato nel testo grezzo.
  const candidates = findBalancedJSONObject(text);
  for (const candidate of candidates) {
    const pkg = tryParse(candidate);
    if (pkg && typeof pkg === 'object') {
      warnings.push(
        'Il JSON è stato recuperato cercando un oggetto bilanciato nel testo, ' +
        'non da un blocco ```json``` esplicito: verificare che l\'estrazione sia completa.'
      );
      return { json: JSON.stringify(pkg, null, 2), pkg, warnings };
    }
  }

  throw new Error(
    'Impossibile estrarre un pacchetto JSON valido dal testo fornito. ' +
    'Verifica che la risposta di Gemini contenga davvero, per intero, il blocco ' +
    'JSON della Parte B (potrebbe essere stato troncato durante la copia).'
  );
}

// ============================================================
// CLI
// ============================================================
if (require.main === module) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath) {
    console.error('Uso: node estrai-json-gemini.js <file-risposta.txt> [output.json]');
    process.exit(2);
  }

  let text;
  try {
    text = fs.readFileSync(path.resolve(inputPath), 'utf8');
  } catch (e) {
    console.error(`Impossibile leggere "${inputPath}": ${e.message}`);
    process.exit(2);
  }

  let result;
  try {
    result = extractPackageJSON(text);
  } catch (e) {
    console.error('');
    console.error('✗  ' + e.message);
    console.error('');
    process.exit(1);
  }

  const { json, pkg, warnings } = result;

  if (warnings.length) {
    console.error('');
    warnings.forEach((w) => console.error('⚠  ' + w));
    console.error('');
  }

  if (outputPath) {
    const resolvedOut = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, json + '\n', 'utf8');
    console.error(`✓  Pacchetto estratto e salvato in: ${outputPath}`);
    if (pkg && pkg.work && pkg.work.id) {
      console.error(`   work.id: ${pkg.work.id}`);
    }
    console.error('');
    console.error('Prossimo passo:');
    console.error(`  node import/gemini/_tooling/validate-package.js ${outputPath}`);
    console.error('');
  } else {
    // Nessun path di output: stampa il JSON su stdout e basta,
    // così può essere reindirizzato o ispezionato manualmente.
    process.stdout.write(json + '\n');
  }
}

module.exports = { extractPackageJSON, findFencedBlocks, findBalancedJSONObject };
