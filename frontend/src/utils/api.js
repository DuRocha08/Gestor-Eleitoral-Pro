import { limparSessao, obterToken } from './authStorage.js';
import { API_BASE } from '../config/appConfig.js';

function erroApiNaoConfigurada() {
  const err = new Error(
    'Backend nao configurado. Defina VITE_API_URL no build ou window.API_URL em api-config.js.'
  );
  err.status = 0;
  err.dados = { motivo: 'API_BASE vazio' };
  return err;
}

export async function apiRequest(caminho, opcoes = {}) {
  const resposta = await apiFetch(caminho, opcoes);
  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const mensagem = dados.erro || dados.mensagem || `Erro na requisicao (HTTP ${resposta.status}).`;
    const err = new Error(mensagem);
    err.status = resposta.status;
    err.dados = dados;
    throw err;
  }

  return dados;
}

export async function apiFetch(caminho, opcoes = {}) {
  const token = obterToken();

  if (!API_BASE) {
    throw erroApiNaoConfigurada();
  }

  const url = `${API_BASE}${caminho}`;

  const resposta = await fetch(url, {
    ...opcoes,
    headers: {
      ...(!(opcoes.body instanceof FormData) && opcoes.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opcoes.headers,
    },
  });

  if (resposta.status === 401) {
    limparSessao();
    window.dispatchEvent(new Event('gestor:sessao-expirada'));
  }
  return resposta;
}

export function apiGet(caminho) {
  return apiRequest(caminho, { method: 'GET' });
}

export function apiPost(caminho, corpo) {
  return apiRequest(caminho, {
    method: 'POST',
    body: JSON.stringify(corpo),
  });
}
