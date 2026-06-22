import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { limparSessao } from '../utils/authStorage.js';
import { apiFetch } from '../utils/api.js';
import { BadgeNivel } from './ui/ExecutiveUI.jsx';
import { MARCA_SISTEMA, NOME_SISTEMA } from '../constants/cargosPoliticos.js';

const ITENS_MENU = [
  { rotulo: 'Painel', caminho: '/dashboard', niveis: ['admin', 'coordenador', 'operador', 'visualizador'] },
  { rotulo: 'Eleitores', caminho: '/eleitores', niveis: ['admin', 'coordenador', 'operador', 'visualizador'] },
  { rotulo: 'Financeiro', caminho: '/financeiro', niveis: ['admin', 'coordenador'] },
  { rotulo: 'Demandas', caminho: '/demandas', niveis: ['admin', 'coordenador', 'operador', 'visualizador'] },
  { rotulo: 'Integrações', caminho: '/integracoes', niveis: ['admin', 'coordenador', 'operador'] },
  { rotulo: 'Administração', caminho: '/admin', niveis: ['admin', 'coordenador'] },
  { rotulo: 'Segurança', caminho: '/seguranca', niveis: ['admin', 'coordenador', 'operador', 'visualizador'] },
];

function Navbar({ usuario }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(function() {
    setMenuAberto(false);
  }, [location.pathname]);

  useEffect(function() {
    if (!menuAberto) return;
    function fecharComEscape(evento) {
      if (evento.key === 'Escape') setMenuAberto(false);
    }
    document.addEventListener('keydown', fecharComEscape);
    return function() { document.removeEventListener('keydown', fecharComEscape); };
  }, [menuAberto]);

  const itensVisiveis = ITENS_MENU.filter(function (item) {
    return item.niveis.includes(usuario?.nivel);
  });
  if (usuario?.administrador_global) {
    itensVisiveis.push({ rotulo: 'Plataforma', caminho: '/plataforma', niveis: ['admin'] });
  }

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      limparSessao();
      navigate('/login', { replace: true });
    }
  }

  return (
    <>
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-50 px-3 py-2 text-sm font-medium
                   bg-white border border-slate-200 text-slate-700 rounded-md
                   hover:bg-slate-50 transition-colors"
        onClick={function () { setMenuAberto(!menuAberto); }}
        aria-label={menuAberto ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
        aria-expanded={menuAberto}
        aria-controls="menu-principal"
      >
        {menuAberto ? '✕' : '☰'}
      </button>

      {menuAberto && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-slate-900/20"
          onClick={function () { setMenuAberto(false); }}
          aria-hidden="true"
        />
      )}

      <aside
        id="menu-principal"
        aria-label="Menu lateral"
        className={
          'fixed inset-y-0 left-0 z-40 w-60 bg-white/95 border-r border-slate-200/80 ' +
          'flex flex-col select-none h-screen overflow-y-auto shadow-xl shadow-slate-900/5 backdrop-blur ' +
          (menuAberto
            ? 'translate-x-0 visible'
            : '-translate-x-full invisible lg:translate-x-0 lg:visible') +
          ' transition-transform duration-200'
        }
      >
        <div className="px-4 h-16 flex items-center border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <img
              src={MARCA_SISTEMA}
              alt=""
              width="32"
              height="32"
              className="w-8 h-8 object-contain flex-shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-slate-950 tracking-tight">
              {NOME_SISTEMA}
            </span>
          </div>
        </div>

        {usuario && (
          <div className="mx-3 my-3 px-3 py-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-sm font-medium text-slate-800 truncate leading-tight">
              {usuario.nome}
            </p>
            <p className="text-xs text-slate-400 truncate mb-2">
              {usuario.email}
            </p>
            <BadgeNivel nivel={usuario.nivel} />
          </div>
        )}

        <nav className="flex-1 px-3 py-2" aria-label="Navegação principal">
          <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.16em]">
            Menu
          </p>

          <ul className="space-y-0.5" role="list">
            {itensVisiveis.map(function (item) {
              return (
                <li key={item.caminho}>
                  <NavLink
                    to={item.caminho}
                    onClick={function () { setMenuAberto(false); }}
                    className={function ({ isActive }) {
                      return (
                        'flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg border ' +
                        'transition-all duration-150 ' +
                        (isActive
                          ? 'bg-indigo-50 border-indigo-100 text-indigo-800 font-semibold shadow-sm'
                          : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900')
                      );
                    }}
                  >
                    {item.rotulo}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-3 border-t border-slate-100">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-sm
                       text-slate-500 rounded-lg hover:bg-slate-100 hover:text-slate-900
                       transition-colors duration-100"
            onClick={sair}
            disabled={saindo}
            aria-busy={saindo}
          >
            <span>{saindo ? 'Saindo...' : 'Sair'}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}

export default Navbar;
