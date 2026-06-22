// URL publica opcional da API. O build substitui este valor quando VITE_API_URL existe.
(function configurarApiPublica() {
  window.API_URL = '';

  let origemApi = '';
  try {
    const url = new URL(window.API_URL);
    const hostLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if ((url.protocol === 'https:' || (hostLocal && url.protocol === 'http:')) &&
        !url.username && !url.password && url.pathname.endsWith('/api')) {
      origemApi = url.origin;
    }
  } catch (_) {
    // Sem URL externa, a politica permanece restrita a mesma origem.
  }

  const politica = document.createElement('meta');
  politica.httpEquiv = 'Content-Security-Policy';
  politica.content = "default-src 'self'; script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; " +
    "connect-src 'self'" + (origemApi ? ' ' + origemApi : '') + "; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'";
  document.head.appendChild(politica);
}());
