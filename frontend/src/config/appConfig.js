// URLs do app: local (/) e GitHub Pages (/GESTOR-ELEITORAL/)

export const ROUTER_BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';

function validarUrlApi(url) {
  const valor = String(url || '').trim().replace(/\/$/, '');
  if (!valor) return '';
  if (valor === '/api') return valor;

  try {
    const analisada = new URL(valor);
    const hostLocal = analisada.hostname === 'localhost' || analisada.hostname === '127.0.0.1';
    if ((!hostLocal && analisada.protocol !== 'https:') ||
        (hostLocal && !['http:', 'https:'].includes(analisada.protocol)) ||
        analisada.username || analisada.password || analisada.search || analisada.hash ||
        !analisada.pathname.endsWith('/api')) {
      return '';
    }
    return valor;
  } catch (_) {
    return '';
  }
}

function pegarUrlDoEnv() {
  return validarUrlApi(import.meta.env.VITE_API_URL);
}

function pegarUrlDaJanela() {
  if (typeof window === 'undefined') return '';
  return validarUrlApi(window.API_URL);
}

function ehLocalhost() {
  if (typeof window === 'undefined') {
    return false;
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function montarApiBase() {
  const doEnv = pegarUrlDoEnv();
  if (doEnv) {
    return doEnv;
  }

  const daJanela = pegarUrlDaJanela();
  if (daJanela) {
    return daJanela;
  }

  if (ehLocalhost()) {
    return '/api';
  }

  return '';
}

export const API_BASE = montarApiBase();
