export const CHAVE_TOKEN   = 'gestor_eleitoral_token';
export const CHAVE_USUARIO = 'gestor_eleitoral_usuario';

function lerArmazenamento(chave) {
  return localStorage.getItem(chave) || sessionStorage.getItem(chave);
}

function decodificarPayload(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const completo = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return JSON.parse(atob(completo));
}

export function obterToken() {
  const token = lerArmazenamento(CHAVE_TOKEN);
  if (!token) return null;

  const partes = token.split('.');
  if (partes.length !== 3) {
    limparSessao();
    return null;
  }

  try {
    // A assinatura continua sendo validada somente pelo backend.
    const payload = decodificarPayload(token);
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      limparSessao();
      return null;
    }
    return token;
  } catch (_) {
    limparSessao();
    return null;
  }
}

export function estaAutenticado() {
  return obterToken() !== null;
}

export function salvarSessao(token, usuario) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  sessionStorage.setItem(CHAVE_TOKEN, token);
  sessionStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}

export function obterUsuario() {
  try {
    const valor = lerArmazenamento(CHAVE_USUARIO);
    return valor ? JSON.parse(valor) : null;
  } catch (_) {
    limparSessao();
    return null;
  }
}

export function limparSessao() {
  sessionStorage.removeItem(CHAVE_TOKEN);
  sessionStorage.removeItem(CHAVE_USUARIO);
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_USUARIO);
}
