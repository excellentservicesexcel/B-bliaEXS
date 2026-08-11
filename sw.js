/*
  Minha Bíblia — funcionamento sem internet.

  Este arquivo precisa ficar na MESMA PASTA do index.html (a raiz do site).
  Ele guarda uma cópia do aplicativo e dos arquivos de texto no aparelho,
  para que tudo continue abrindo mesmo sem conexão.
*/

const CACHE_APP = 'biblia-app-v1';
const CACHE_DADOS = 'biblia-dados-v1';

// O essencial para o app abrir sozinho.
const ARQUIVOS_BASE = [
  './',
  './index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_APP)
      .then(cache => cache.addAll(ARQUIVOS_BASE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n !== CACHE_APP && n !== CACHE_DADOS)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// A página pede para guardar uma lista de arquivos.
self.addEventListener('message', (event) => {
  const dados = event.data || {};

  if (dados.tipo === 'GUARDAR') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_DADOS);
      let ok = 0, falhou = 0;

      for (const url of (dados.urls || [])) {
        try {
          const resp = await fetch(url, { cache: 'reload' });
          if (resp && (resp.ok || resp.type === 'opaque')) {
            await cache.put(url, resp.clone());
            ok++;
          } else { falhou++; }
        } catch (e) { falhou++; }

        // Avisa o progresso à página.
        if (event.source) {
          event.source.postMessage({ tipo: 'PROGRESSO', ok, falhou, total: (dados.urls || []).length });
        }
      }

      if (event.source) event.source.postMessage({ tipo: 'CONCLUIDO', ok, falhou });
    })());
  }

  if (dados.tipo === 'LIMPAR') {
    event.waitUntil(
      caches.delete(CACHE_DADOS).then(() => {
        if (event.source) event.source.postMessage({ tipo: 'LIMPO' });
      })
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const mesmaOrigem = url.origin === self.location.origin;
  const ehNavegacao = req.mode === 'navigate';

  // Abrir o app: tenta a internet, cai para a cópia guardada.
  if (ehNavegacao) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE_APP).then(c => c.put('./index.html', copia)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Arquivos do próprio site (Bíblias, hinos, dicionário):
  // usa a cópia guardada primeiro — é instantâneo e funciona sem internet.
  if (mesmaOrigem && url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(req).then(guardado => {
        const daRede = fetch(req).then(resp => {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE_DADOS).then(c => c.put(req, copia)).catch(() => {});
          }
          return resp;
        }).catch(() => guardado);
        return guardado || daRede;
      })
    );
    return;
  }

  // Fontes, ícones e bibliotecas externas: cópia guardada se a rede falhar.
  event.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          const copia = resp.clone();
          caches.open(CACHE_DADOS).then(c => c.put(req, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
