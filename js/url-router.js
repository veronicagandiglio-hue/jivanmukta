/**
 * url-router.js — risoluzione ID contenuto <-> URL pubblici leggibili
 * =====================================================================
 * Livello di routing aggiunto SOPRA ai template esistenti, senza
 * toccare Content Engine, build-index.js o il rendering delle pagine.
 *
 * Ogni template pubblico vive sotto un prefisso fisso nel path:
 *
 *   /domande/<id>                    -> domanda.html   (Question)
 *   /concetti/<id>                   -> concetto.html  (Concept)
 *   /testi/<id>                      -> opera.html      (Work)
 *   /testi/<id>/<cap>[/<sez>]        -> pagina di unità/passaggio
 *   /autori/<id>                     -> autore.html     (Author)
 *   /confronti/<id>                  -> confronto.html  (Comparison)
 *
 * La corrispondenza prefisso -> file fisico è realizzata a livello di
 * hosting (vedi /_redirects), NON in questo script: qui ci si limita
 * a leggere il pathname corrente e a estrarne l'id (ed eventuali
 * segmenti aggiuntivi dopo l'id), oppure — se la pagina viene aperta
 * direttamente con la vecchia convenzione ?rif=/?id= — a usare quella,
 * per non rompere i link già in circolazione.
 *
 * Vanilla JavaScript, nessuna dipendenza. Stessa convenzione di
 * content-engine.js: funziona sia nel browser (window) sia in Node
 * (per gli script di verifica), esponendosi su globalThis.
 * =====================================================================
 */
(function (global) {
  'use strict';

  function stripSlashes(path) {
    return path.replace(/^\/+|\/+$/g, '');
  }

  /**
   * Risolve l'id del contenuto (ed eventuali segmenti extra) dall'URL
   * corrente, dato il prefisso pubblico atteso per QUESTA pagina
   * (es. 'domande', 'concetti', 'testi', 'autori', 'confronti').
   *
   * Ritorna { id, extra: string[] } oppure null se non è possibile
   * determinare alcun id.
   */
  function resolveContentId(expectedPrefix) {
    const parts = stripSlashes(global.location.pathname).split('/').filter(Boolean);
    const prefixIndex = parts.indexOf(expectedPrefix);
    if (prefixIndex !== -1 && parts[prefixIndex + 1]) {
      return {
        id: decodeURIComponent(parts[prefixIndex + 1]),
        extra: parts.slice(prefixIndex + 2).map(decodeURIComponent)
      };
    }
    // Retrocompatibilità: apertura diretta del template fisico con
    // ?rif=<id> o ?id=<id> (vecchia convenzione del Vertical Slice).
    const params = new global.URLSearchParams(global.location.search);
    const id = params.get('rif') || params.get('id');
    return id ? { id: id, extra: [] } : null;
  }

  /**
   * Costruisce l'URL pubblico leggibile per un contenuto.
   * `extra`, se presente, aggiunge segmenti dopo l'id (es. capitolo,
   * sezione) — usato solo per i testi (/testi/<id>/<cap>/<sez>).
   */
  function buildContentUrl(prefix, id, extra) {
    let url = '/' + prefix + '/' + encodeURIComponent(id);
    if (extra && extra.length) {
      url += '/' + extra.map(encodeURIComponent).join('/');
    }
    return url;
  }

  const UrlRouter = { resolveContentId: resolveContentId, buildContentUrl: buildContentUrl };

  global.UrlRouter = UrlRouter;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = UrlRouter;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
