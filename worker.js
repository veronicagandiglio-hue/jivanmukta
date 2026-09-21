const legacyRedirects = new Map([
  ['/che-cose-brahman.html', '/domande/q-natura-brahman-purna'],
  ['/che-cose-reale.html', '/domande/q-natura-brahman-purna'],
  ['/domanda-brahman.html', '/domande/q-natura-brahman-purna'],
  ['/concetto-brahman.html', '/concetti/purna'],
  ['/autore-shankara.html', '/autori/adi-shankara'],
  ['/opera-brhadaranyaka.html', '/testi/isha-upanishad'],
  ['/opera-brhadaranyaka-cap1.html', '/testi/isha-upanishad/1-18'],
  ['/confronto-advaita-buddhismo.html', '/']
]);

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && legacyRedirects.has(url.pathname)) {
      return Response.redirect(new URL(legacyRedirects.get(url.pathname), url), 301);
    }

    let assetPath = null;
    const parts = url.pathname.split('/').filter(Boolean);
    const prefix = parts[0];

    if (url.pathname === '/' || url.pathname === '') assetPath = '/index.html';
    if (url.pathname === '/testi' || url.pathname === '/testi/') assetPath = '/testi.html';
    if (url.pathname === '/percorso' || url.pathname === '/percorso/') assetPath = '/percorso.html';
    if (prefix === 'percorso' && parts[1]) assetPath = '/percorso.html';
    if (prefix === 'domande' && parts[1]) assetPath = '/domanda.html';
    if (prefix === 'concetti' && parts[1]) assetPath = '/concetto.html';
    if (prefix === 'autori' && parts[1]) assetPath = '/autore.html';
    if (prefix === 'confronti' && parts[1]) assetPath = '/confronto.html';
    if (prefix === 'testi' && parts[1]) {
      assetPath = parts.length === 2 ? '/opera.html' : '/unita.html';
    }

    return env.ASSETS.fetch(assetPath ? assetRequest(request, assetPath) : request);
  }
};
