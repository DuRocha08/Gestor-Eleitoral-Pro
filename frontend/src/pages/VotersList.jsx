import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BadgeStatus } from '../components/ui/ExecutiveUI.jsx';
import ImportarPlanilha from '../components/ImportarPlanilha.jsx';
import { obterUsuario } from '../utils/authStorage.js';
import { apiFetch } from '../utils/api.js';
import EleitorFormModal from '../components/EleitorFormModal.jsx';

const STATUS_VOTO_OPCOES = [
  { valor: '',                rotulo: 'Todos os status' },
  { valor: 'nao_identificado',rotulo: 'Não identificado' },
  { valor: 'indeciso',        rotulo: 'Indeciso' },
  { valor: 'provavel',        rotulo: 'Provável' },
  { valor: 'confirmado',      rotulo: 'Confirmado' },
  { valor: 'oposicao',        rotulo: 'Oposição' },
  { valor: 'abstencao',       rotulo: 'Abstenção' },
];

function VotersList() {
  const usuario = obterUsuario();
  const podeImportar = usuario?.nivel !== 'visualizador';
  const podeEditar = usuario?.nivel !== 'visualizador';
  const podeExcluir = ['admin','coordenador'].includes(usuario?.nivel);
  const [eleitores, setEleitores]       = useState([]);
  const [paginacao, setPaginacao]       = useState({ pagina: 1, total: 0, total_paginas: 1 });
  const [carregando, setCarregando]     = useState(true);
  const [erro, setErro]                 = useState('');
  const [modalImport, setModalImport]   = useState(false);
  const [bairroDigitado, setBairroDigitado] = useState('');
  const [eleitorEmEdicao, setEleitorEmEdicao] = useState(undefined);
  const requisicaoAtual = useRef(0);

  const [filtros, setFiltros] = useState({
    bairro: '',
    status_voto: '',
    page: 1,
    limit: 20,
  });

  const buscarEleitores = useCallback(async function() {
    const idRequisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErro('');
    try {
      const params = new URLSearchParams();
      if (filtros.bairro)      params.set('bairro',      filtros.bairro);
      if (filtros.status_voto) params.set('status_voto', filtros.status_voto);
      params.set('page',  filtros.page);
      params.set('limit', filtros.limit);

      const resposta = await apiFetch('/voters?' + params.toString());

      if (!resposta.ok) {
        const dados = await resposta.json();
        if (idRequisicao === requisicaoAtual.current) {
          setErro(dados.erro || 'Erro ao carregar eleitores.');
        }
        return;
      }

      const dados = await resposta.json();
      if (idRequisicao === requisicaoAtual.current) {
        setEleitores(dados.dados || []);
        setPaginacao(dados.paginacao || { pagina: 1, total: 0, total_paginas: 1 });
      }
    } catch (_) {
      if (idRequisicao === requisicaoAtual.current) {
        setErro('Nao foi possivel conectar ao servidor.');
      }
    } finally {
      if (idRequisicao === requisicaoAtual.current) setCarregando(false);
    }
  }, [filtros]);

  useEffect(function() {
    buscarEleitores();
  }, [buscarEleitores]);

  useEffect(function() {
    const timer = setTimeout(function() {
      setFiltros(function(prev) {
        if (prev.bairro === bairroDigitado) return prev;
        return Object.assign({}, prev, { bairro: bairroDigitado, page: 1 });
      });
    }, 400);
    return function() { clearTimeout(timer); };
  }, [bairroDigitado]);

  function aplicarFiltro(campo, valor) {
    setFiltros(function(prev) {
      return Object.assign({}, prev, { [campo]: valor, page: 1 });
    });
  }

  function irParaPagina(novaPagina) {
    setFiltros(function(prev) {
      return Object.assign({}, prev, { page: novaPagina });
    });
  }

  function onFecharImport() {
    setModalImport(false);
    buscarEleitores();
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
            Gestor Eleitoral
          </p>
          <h1 className="page-title">Eleitores</h1>
          <p className="page-subtitle" aria-live="polite">
            {paginacao.total > 0 ? paginacao.total + ' registros na base' : 'Base de eleitores da campanha'}
          </p>
        </div>
        <div className="flex gap-2">{podeEditar && <button type="button" className="btn-secondary" onClick={function(){setEleitorEmEdicao(null);}}>Novo eleitor</button>}{podeImportar && <button
          type="button"
          className="btn-primary max-w-max px-4 bg-teal-600 hover:bg-teal-700 flex items-center gap-2 flex-shrink-0"
          onClick={function() { setModalImport(true); }}
        >
          <span>↑</span> Importar planilha
        </button>}</div>
      </header>

      <div className="card p-4 mb-5 flex flex-wrap gap-3">
        <div className="flex-1 min-w-44">
          <label htmlFor="filtro-bairro" className="label">Filtrar por bairro</label>
          <input
            id="filtro-bairro"
            type="text"
            className="input"
            placeholder="Ex: Jardim São Paulo"
            value={bairroDigitado}
            onChange={function(e) { setBairroDigitado(e.target.value); }}
          />
        </div>
        <div className="w-52">
          <label htmlFor="filtro-status" className="label">Status de voto</label>
          <select
            id="filtro-status"
            className="input"
            value={filtros.status_voto}
            onChange={function(e) { aplicarFiltro('status_voto', e.target.value); }}
          >
            {STATUS_VOTO_OPCOES.map(function(op) {
              return <option key={op.valor} value={op.valor}>{op.rotulo}</option>;
            })}
          </select>
        </div>
        <div className="w-32">
          <label htmlFor="filtro-limite" className="label">Por página</label>
          <select
            id="filtro-limite"
            className="input"
            value={filtros.limit}
            onChange={function(e) { aplicarFiltro('limit', Number(e.target.value)); }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            className="btn-secondary"
            onClick={function() {
              setBairroDigitado('');
              setFiltros({ bairro: '', status_voto: '', page: 1, limit: 20 });
            }}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {erro && (
        <div role="alert" className="mb-4 p-3 text-sm border rounded-lg bg-red-50 border-red-200 text-red-700">
          <span>{erro}</span>{' '}
          <button type="button" className="font-semibold underline" onClick={buscarEleitores}>Tentar novamente</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="gov-table" aria-label="Lista de eleitores">
            <caption className="sr-only">Eleitores cadastrados na campanha</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Bairro</th>
                <th scope="col">Zona / Seção</th>
                <th scope="col">Status de voto</th>
                <th scope="col">Contato</th>
                {podeEditar && <th scope="col">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                Array.from({ length: 8 }).map(function(_, i) {
                  return (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map(function(_, j) {
                        return (
                          <td key={j}>
                            <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : eleitores.length === 0 ? (
                <tr>
                  <td colSpan={podeEditar ? 6 : 5} className="text-center text-slate-400 py-12">
                    {filtros.bairro || filtros.status_voto
                      ? 'Nenhum eleitor encontrado com estes filtros.'
                      : 'Nenhum eleitor cadastrado ainda. Importe uma planilha para começar.'}
                  </td>
                </tr>
              ) : (
                eleitores.map(function(eleitor) {
                  return (
                    <tr key={eleitor.id}>
                      <td className="font-medium text-slate-800">{eleitor.nome}</td>
                      <td className="text-slate-600">{eleitor.bairro || '—'}</td>
                      <td>
                        {eleitor.zona_eleitoral && eleitor.secao_eleitoral ? (
                          <span className="font-mono text-xs text-slate-500">
                            {String(eleitor.zona_eleitoral).padStart(3, '0')}
                            {' / '}
                            {String(eleitor.secao_eleitoral).padStart(4, '0')}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td>
                        <BadgeStatus status={eleitor.status_voto} />
                      </td>
                      <td className="font-mono text-xs text-slate-500">
                        {eleitor.whatsapp || eleitor.telefone || '—'}
                      </td>
                      {podeEditar && <td><button className="btn-secondary text-xs" onClick={function(){setEleitorEmEdicao(eleitor);}}>Editar</button></td>}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {paginacao.total_paginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Página {paginacao.pagina} de {paginacao.total_paginas} ·{' '}
              {paginacao.total} registros
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                disabled={paginacao.pagina <= 1}
                onClick={function() { irParaPagina(paginacao.pagina - 1); }}
              >
                ← Anterior
              </button>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                disabled={paginacao.pagina >= paginacao.total_paginas}
                onClick={function() { irParaPagina(paginacao.pagina + 1); }}
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>

      {podeImportar && (
        <ImportarPlanilha aberto={modalImport} onFechar={onFecharImport} />
      )}
      {eleitorEmEdicao !== undefined && <EleitorFormModal eleitor={eleitorEmEdicao} podeExcluir={podeExcluir}
        onFechar={function(){setEleitorEmEdicao(undefined);}}
        onSalvo={function(){setEleitorEmEdicao(undefined);buscarEleitores();}} />}
    </div>
  );
}

export default VotersList;
