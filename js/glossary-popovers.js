/* Note brevi sui termini del glossario, disponibili in tutto il sito. */
(function () {
  'use strict';
  if (window.__advaitaGlossaryReady) return;
  window.__advaitaGlossaryReady = true;

  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
  const excluded = 'script,style,noscript,textarea,input,select,option,button,a,code,pre,[data-no-glossary],[data-translation],.translation,.verse__text,.verse__original,.passage__text,.passage__original,.passage-card__translation,.passage-card__original,.glossary-dialog';
  const style = document.createElement('style');
  style.textContent = '.glossary-term{position:relative;font:inherit;color:inherit;background:none;border:0;border-bottom:1px dotted currentColor;padding:0;cursor:help}.glossary-term::after{content:attr(data-gloss);display:none;position:absolute;z-index:20;left:0;bottom:calc(100% + .4rem);width:min(24rem,80vw);padding:.8rem 1rem;border:1px solid #c9c2b4;border-radius:.35rem;background:#fffdf8;color:#201f1c;text-align:left;white-space:normal;font:1rem/1.45 Georgia,serif;box-shadow:0 .35rem 1.3rem #0003}.glossary-term:hover::after,.glossary-term:focus-visible::after{display:block}.glossary-dialog{max-width:min(38rem,calc(100vw - 2rem));max-height:80vh;overflow:auto;border:1px solid #c9c2b4;border-radius:.5rem;padding:1.5rem;background:#fffdf8;color:#201f1c;font:1.05rem/1.6 Georgia,serif;box-shadow:0 1rem 3rem #0003}.glossary-dialog::backdrop{background:#16140fcc}.glossary-dialog h2{font-size:1.4rem;margin:0 2.5rem .75rem 0}.glossary-dialog p{margin:.5rem 0 1rem}.glossary-dialog ul{padding-left:1.3rem}.glossary-dialog li+li{margin-top:.8rem}.glossary-dialog a{color:#354565}.glossary-close{float:right;border:1px solid #aaa;border-radius:.25rem;background:white;padding:.25rem .65rem;font:inherit;cursor:pointer}.glossary-open{font-size:.9em;white-space:nowrap}';
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
      const matchedText = match[2];
      btn.type = 'button'; btn.className = 'glossary-term'; btn.textContent = matchedText;
      const explanation = entries.map((entry) => (entries.length > 1 ? (entry.name || entry.id) + ': ' : '') + (entry.gloss || 'Voce del glossario senza spiegazione disponibile.')).join(' ');
      btn.dataset.gloss = explanation;
      btn.title = explanation;
      btn.setAttribute('aria-label', 'Spiegazione del termine ' + matchedText);
      btn.addEventListener('click', () => open(matchedText, entries, btn));
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
      { id: 'term-corpo-causale-sanskrit', name: 'kāraṇa śarīra', transliteration: 'kāraṇa śarīra', glossaryAliases: ['kāraṇa śarīra', 'karana sharira'], gloss: 'Nome dato in alcune esposizioni vedāntiche alla condizione causale legata all’ignoranza e al sonno profondo. È uno schema esplicativo di ordine relativo, non una realtà ultima.', glossaryOnly: true },
      { id: 'term-ontologico', name: 'ontologico', transliteration: 'ontologica', glossaryAliases: ['ontologico', 'ontologica', 'ontologia'], gloss: 'Riguarda ciò che si considera reale o il modo in cui qualcosa esiste. Qui non significa che una tesi sia stata dimostrata scientificamente.', glossaryOnly: true },
      { id: 'term-incondizionato', name: 'incondizionato', transliteration: 'incondizionata', glossaryAliases: ['incondizionato', 'incondizionata'], gloss: 'Che non dipende da condizioni o cause. Nel discorso su Brahman è un’indicazione per escludere ogni limite, non una sua descrizione completa.', glossaryOnly: true },
      { id: 'term-trascendente', name: 'trascendente', transliteration: 'trascendente', glossaryAliases: ['trascendente', 'trascendenti'], gloss: 'Che non è contenuto nei limiti di ciò che i sensi o il pensiero possono conoscere. Non indica un luogo lontano o separato.', glossaryOnly: true },
      { id: 'term-riassorbimento', name: 'riassorbimento', transliteration: 'riassorbimento', glossaryAliases: ['riassorbimento', 'riassorbire'], gloss: 'Nelle descrizioni cosmologiche indica il venir meno delle forme manifestate. È un modo tradizionale di raccontare il cosmo, non un cambiamento di Brahman.', glossaryOnly: true },
      { id: 'term-emanazione', name: 'emanazione', transliteration: 'emanazione', glossaryAliases: ['emanazione', 'emanazioni'], gloss: 'Termine per descrivere l’apparire del mondo a partire da un principio. In queste pagine è un modello cosmologico tradizionale, non una definizione ultima di Brahman.', glossaryOnly: true },
      { id: 'term-gnosi', name: 'gnosi', transliteration: 'gnosi', glossaryAliases: ['gnosi'], gloss: 'Conoscenza spirituale o metafisica. Nel Vedānta indica la conoscenza del Sé, non un’informazione segreta o un’esperienza speciale.', glossaryOnly: true },
      { id: 'term-metafisico', name: 'metafisico', transliteration: 'metafisica', glossaryAliases: ['metafisico', 'metafisica', 'metafisici', 'metafisiche'], gloss: 'Riguarda i principi ultimi della realtà, oltre lo studio dei fenomeni fisici. Non significa semplicemente misterioso o paranormale.', glossaryOnly: true },
      { id: 'term-teurgico', name: 'teurgico', transliteration: 'teurgica', glossaryAliases: ['teurgico', 'teurgica'], gloss: 'Riferito a riti o pratiche che, nella tradizione, mettono in rapporto l’essere umano con il divino. È distinto dalla conoscenza non-duale di Brahman.', glossaryOnly: true },
      { id: 'term-sovraindividuale', name: 'sovraindividuale', transliteration: 'sovraindividuali', glossaryAliases: ['sovraindividuale', 'sovraindividuali'], gloss: 'Che supera i limiti della singola persona, ma può ancora appartenere a un ordine cosmico o condizionato. Non equivale automaticamente all’Assoluto.', glossaryOnly: true },
      { id: 'term-sovrarazionale', name: 'sovrarazionale', transliteration: 'sovrarazionale', glossaryAliases: ['sovrarazionale'], gloss: 'Che non può essere raggiunto dal solo ragionamento. Non vuol dire irrazionale o contrario alla ragione.', glossaryOnly: true },
      { id: 'term-cosmologia', name: 'cosmologico', transliteration: 'cosmologia', glossaryAliases: ['cosmologico', 'cosmologica', 'cosmologici', 'cosmologiche', 'cosmologia'], gloss: 'Relativo alla descrizione tradizionale dell’origine e dell’ordine del cosmo. Non è la descrizione della Realtà ultima in sé.', glossaryOnly: true },
      { id: 'term-nonduale', name: 'non-duale', transliteration: 'non duale', glossaryAliases: ['non-duale', 'non-duali', 'non duale'], gloss: 'Che non ammette una seconda realtà indipendente accanto all’Assoluto. Non significa che le differenze pratiche o le esperienze quotidiane non si presentino.', glossaryOnly: true }
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
