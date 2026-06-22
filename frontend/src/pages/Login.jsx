
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { estaAutenticado, salvarSessao } from '../utils/authStorage.js';
import { AuthBrandPanel, AlertBox } from '../components/ui/ExecutiveUI.jsx';
import { MARCA_SISTEMA, NOME_SISTEMA } from '../constants/cargosPoliticos.js';
import { API_BASE } from '../config/appConfig.js';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [codigoMfa, setCodigoMfa] = useState('');
  const [mfaNecessario, setMfaNecessario] = useState(false);

  useEffect(function() {
    if (estaAutenticado()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  async function entrar(evento) {
    evento.preventDefault();
    setErro('');

    if (!email.trim()) { setErro('Digite seu e-mail.'); return; }
    if (!senha)        { setErro('Digite sua senha.'); return; }

    if (!API_BASE) {
      setErro('API nao configurada. Defina VITE_API_URL no build ou window.API_URL em api-config.js.');
      return;
    }

    setCarregando(true);
    try {
      const resposta = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(), senha,
          codigo_mfa: mfaNecessario ? codigoMfa.trim() : undefined,
        }),
      });

      const dados = await resposta.json();

      if (resposta.status === 202 && dados.mfa_necessario) {
        setMfaNecessario(true);
        setErro('');
        return;
      }

      if (!resposta.ok) {
        if (resposta.status === 429 && dados.tentar_novamente_em_segundos) {
          const minutos = Math.max(1, Math.ceil(dados.tentar_novamente_em_segundos / 60));
          setErro(`Muitas tentativas. Tente novamente em ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`);
        } else {
          setErro(dados.erro || 'E-mail ou senha incorretos.');
        }
        return;
      }

      salvarSessao(dados.token, dados.usuario);
      navigate('/dashboard', { replace: true });
    } catch (_) {
      setErro('Nao foi possivel conectar ao servidor. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-white">

      <AuthBrandPanel
        titulo="Bem-vindo de volta"
        descricao="Entre com seu e-mail e senha para acessar o painel da sua campanha."
      />

      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">

          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-6">
            <img
              src={MARCA_SISTEMA}
              alt="Símbolo do Gestor Eleitoral"
              width="36"
              height="36"
              className="w-9 h-9 object-contain"
            />
            <p className="section-eyebrow">{NOME_SISTEMA}</p>
          </div>

          <div className="card p-8">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Entrar</h2>
              <p className="text-sm text-slate-400 mt-0.5">Acesso ao painel de gestão</p>
            </div>

            {erro && <AlertBox tipo="erro">{erro}</AlertBox>}

            <form onSubmit={entrar} className="space-y-4" noValidate>

              <div>
                <label htmlFor="email" className="label">E-mail</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={function(e) { setEmail(e.target.value); }}
                  disabled={carregando}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {mfaNecessario && (
                <div>
                  <label htmlFor="codigoMfa" className="label">Código de autenticação</label>
                  <input id="codigoMfa" className="input" value={codigoMfa}
                    onChange={function(e) { setCodigoMfa(e.target.value); }}
                    inputMode="numeric" autoComplete="one-time-code" maxLength={10}
                    placeholder="000000 ou código de reserva" required />
                </div>
              )}

              <div>
                <label htmlFor="senha" className="label">Senha</label>
                <input
                  id="senha"
                  type="password"
                  className="input"
                  value={senha}
                  onChange={function(e) { setSenha(e.target.value); }}
                  disabled={carregando}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full mt-2"
                disabled={carregando}
              >
                {carregando ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83
                               M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-6">
              Primeira vez?{' '}
              <Link
                to="/register"
                className="text-indigo-600 font-medium hover:text-indigo-700 hover:underline"
              >
                Criar conta
              </Link>
            </p>
            <p className="text-center text-xs mt-3">
              <Link to="/forgot-password" className="text-indigo-600 hover:underline">Esqueci minha senha</Link>
            </p>
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">
            Entre para sua organização de campanha
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
