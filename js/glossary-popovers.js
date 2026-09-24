/* Note brevi sui termini del glossario, disponibili in tutto il sito. */
(function () {
  'use strict';
  if (window.__advaitaGlossaryReady) return;
  window.__advaitaGlossaryReady = true;

  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
  const excluded = 'script,style,noscript,textarea,input,select,option,button,a,code,pre,[data-no-glossary],[data-translation],.translation,.verse__text,.verse__original,.passage__text,.passage__original,.passage-card__translation,.passage-card__original,.glossary-dialog';
  const style = document.createElement('style');
  style.textContent = '.glossary-term{font:inherit;color:inherit;background:none;border:0;border-bottom:1px dotted currentColor;padding:0;cursor:help}.glossary-dialog{max-width:min(38rem,calc(100vw - 2rem));max-height:80vh;overflow:auto;border:1px solid #c9c2b4;border-radius:.5rem;padding:1.5rem;background:#fffdf8;color:#201f1c;font:1.05rem/1.6 Georgia,serif;box-shadow:0 1rem 3rem #0003}.glossary-dialog::backdrop{background:#16140fcc}.glossary-dialog h2{font-size:1.4rem;margin:0 2.5rem .75rem 0}.glossary-dialog p{margin:.5rem 0 1rem}.glossary-dialog ul{padding-left:1.3rem}.glossary-dialog li+li{margin-top:.8rem}.glossary-dialog a{color:#354565}.glossary-close{float:right;border:1px solid #aaa;border-radius:.25rem;background:white;padding:.25rem .65rem;font:inherit;cursor:pointer}.glossary-open{font-size:.9em;white-space:nowrap}';
  document.head.appendChild(style);

  const dialog = document.createElement('dialog');
  dialog.className = 'glossary-dialog';
  dialog.setAttribute('aria-labelledby', 'glossary-title');
  dialog.innerHTML = '<button class="glossary-close" type="button">Chiudi</button><h2 id="glossary-title"></h2><div class="glossary-entries"></div>';
  document.body.appendChild(dialog);
  const close = dialog.querySelector('.glossary-close');
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  let lastFocus = null;

  function open(term, entries, trigger) {
    lastFocus = trigger;
    dialog.querySelector('h2').textContent = term;
    const box = dialog.querySelector('.glossary-entries');
    box.replaceChildren();
    entries.forEach((entry) => {
      const item = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = entry.gloss || 'Voce del glossario senza spiegazione disponibile.';
      item.appendChild(p);
      if (!entry.glossaryOnly) {
        const link = document.createElement('a');
        link.href = '/concetti/' + encodeURIComponent(entry.id);
        link.textContent = 'Apri la voce completa';
        link.className = 'glossary-open';
        item.appendChild(link);
      }
      box.appendChild(item);
    });
    if (entries.length > 1) {
      const list = document.createElement('ul');
      entries.forEach((entry) => {
        const li = document.createElement('li');
        li.textContent = (entry.name || entry.id) + ': ' + (entry.gloss || 'Voce senza spiegazione.');
        list.appendChild(li);
      });
      box.replaceChildren(list);
      entries.forEach((entry, i) => {
        if (entry.glossaryOnly) return;
        const link = document.createElement('a');
        link.href = '/concetti/' + encodeURIComponent(entry.id);
        link.textContent = 'Apri ' + (entry.name || entry.id);
        link.className = 'glossary-open';
        box.children[i].appendChild(link);
      });
    }
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    close.focus();
  }
  dialog.addEventListener('close', () => { if (lastFocus && lastFocus.isConnected) lastFocus.focus(); });

  function addTerm(node, term, entries) {
    const plain = norm(term);
    const accents = { a: 'aáàâäā', i: 'iíìîïī', u: 'uúùûüū', r: 'rṛṝ', m: 'mṃ', h: 'hḥ', n: 'nṅñṇ', t: 'tṭ', d: 'dḍ', s: 'sśṣ' };
    const pattern = Array.from(plain).map((ch) => {
      const variants = accents[ch] || ch;
      return variants.length > 1 ? '[' + variants + ']' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + pattern + ')(?=$|[^\\p{L}\\p{N}])', 'giu');
    const source = node.nodeValue;
    let match, from = 0, found = false;
    const frag = document.createDocumentFragment();
    while ((match = re.exec(source))) {
      if (match.index > from) frag.appendChild(document.createTextNode(source.slice(from, match.index)));
      if (match[1]) frag.appendChild(document.createTextNode(match[1]));
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'glossary-term'; btn.textContent = match[2];
      btn.setAttribute('aria-label', 'Spiegazione del termine ' + match[2]);
      btn.addEventListener('click', () => open(match[2], entries, btn));
      frag.appendChild(btn);
      from = match.index + match[0].length;
      found = true;
    }
    if (!found) return;
    if (from < source.length) frag.appendChild(document.createTextNode(source.slice(from)));
    node.parentNode.replaceChild(frag, node);
  }

  let terms = [];
  function scan(root) {
    if (!terms.length || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim() || !node.parentElement) return NodeFilter.FILTER_REJECT;
        return node.parentElement.closest(excluded) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const text = norm(node.nodeValue);
      for (const item of terms) {
        if (text.includes(item.key)) { addTerm(node, item.term, item.entries); break; }
      }
    });
  }

  fetch('/content/_index/concept-index.json').then((r) => r.ok ? r.json() : null).then((index) => {
    if (!index) return;
    const map = new Map();
    const commonItalian = new Set(['essere', 'reale', 'verita', 'verità', 'conoscenza', 'coscienza', 'liberazione', 'meditazione', 'anima', 'mondo', 'persona', 'principio', 'spazio', 'beatitudine', 'maestro', 'maestri', 'azione', 'rituale', 'rituali', 'corpo', 'mente', 'testimone', 'testimoni', 'stato', 'stati', 'uno', 'unita', 'unità', 'assoluto', 'assoluta', 'supremo', 'suprema', 'natura', 'visione', 'dottrina', 'dottrine', 'sapere']);
    const extras = [
      { id: 'term-corpo-sottile', name: 'corpo sottile', transliteration: 'sūkṣma śarīra', gloss: 'Nel modello cosmologico tradizionale, il veicolo individuale non fisico associato a mente, sensi e soffio vitale. È una descrizione del piano individuale, non una definizione del Sé o di Brahman.', glossaryOnly: true },
      { id: 'term-corpo-causale', name: 'corpo causale', transliteration: 'kāraṇa śarīra', gloss: 'Nome dato in alcune esposizioni vedāntiche alla condizione causale legata all’ignoranza e al sonno profondo. È uno schema esplicativo di ordine relativo, non una realtà ultima.', glossaryOnly: true },
      { id: 'term-corpo-grossolano', name: 'corpo grossolano', transliteration: 'sthūla śarīra', gloss: 'Il corpo fisico, percepibile dai sensi. La distinzione da corpo sottile e causale appartiene a una descrizione tradizionale dell’individuo, non alla natura di Brahman.', glossaryOnly: true },
      { id: 'term-corpo-sottile-sanskrit', name: 'sūkṣma śarīra', transliteration: 'sūkṣma śarīra', glossaryAliases: ['sūkṣma śarīra', 'sukshma sharira'], gloss: 'Nel modello cosmologico tradizionale, il veicolo individuale non fisico associato a mente, sensi e soffio vitale. È una descrizione del piano individuale, non una definizione del Sé o di Brahman.', glossaryOnly: true },
      { id: 'term-corpo-causale-sanskrit', name: 'kāraṇa śarīra', transliteration: 'kāraṇa śarīra', glossaryAliases: ['kāraṇa śarīra', 'karana sharira'], gloss: 'Nome dato in alcune esposizioni vedāntiche alla condizione causale legata all’ignoranza e al sonno profondo. È uno schema esplicativo di ordine relativo, non una realtà ultima.', glossaryOnly: true }
    ];
    [...Object.values(index), ...extras].forEach((entry) => {
      const aliases = [...(entry.glossaryAliases || []), entry.name, entry.transliteration, /^[a-z0-9]+$/i.test(entry.id || '') ? entry.id : null].filter(Boolean);
      aliases.forEach((alias) => {
        const clean = alias.trim();
        if (!clean || (clean.includes(' ') && !entry.glossaryAliases) || clean.length < 4 || /^[\d.]+$/.test(clean)) return;
        const key = norm(clean);
        if (commonItalian.has(key)) return;
        if (!map.has(key)) map.set(key, { term: clean, entries: new Map() });
        map.get(key).entries.set(entry.id, entry);
      });
    });
    terms = Array.from(map.entries()).map(([key, v]) => ({ key, term: v.term, entries: Array.from(v.entries.values()) }))
      .sort((a, b) => b.key.length - a.key.length);
    scan(document.body);
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      else if (node.nodeType === Node.TEXT_NODE && node.parentElement && !node.parentElement.closest(excluded)) {
        const text = norm(node.nodeValue || '');
        const item = terms.find((candidate) => text.includes(candidate.key));
        if (item) addTerm(node, item.term, item.entries);
      }
    }))).observe(document.body, { childList: true, subtree: true });
  }).catch(() => {});
}());
