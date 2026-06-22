import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard, BadgeStatus } from '../components/ui/ExecutiveUI.jsx';
import { obterConfigDashboard } from '../utils/dashboardKpis.js';
import ImportarPlanilha from '../components/ImportarPlanilha.jsx';
import { obterUsuario } from '../utils/authStorage.js';
import { apiFetch } from '../utils/api.js';
import { numeroPlanilha, valorPlanilha } from '../utils/planilhaDados.js';

function fmt(v) { return v != null ? String(v) : '—'; }

function fmtMoeda(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function lerRespostaApi(resposta, opcional = false) {
  if (opcional && resposta?.status === 404) return null;
  if (!resposta?.ok) {
    const dadosErro = await resposta?.json().catch(function() { return {}; });
    throw new Error(dadosErro?.erro || 'Falha ao carregar dados do painel.');
  }
  return resposta.json();
}

function SecaoTitulo({ icone, titulo, subtitulo }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
      <span className="text-xl">{icone}</span>
      <div>
        <p className="card-title">{titulo}</p>
        {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
    </div>
  );
}

function TabelaSimples({ colunas, linhas, legenda }) {
  if (!linhas || linhas.length === 0)
    return <p className="text-sm text-slate-400 text-center py-6">Sem dados disponíveis.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="gov-table">
        {legenda && <caption className="sr-only">{legenda}</caption>}
        <thead>
          <tr>{colunas.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.slice(0, 8).map((row, i) => (
            <tr key={i}>
              {colunas.map(c => {
                const valor = valorPlanilha(row, c.key, ...(c.alternativas || []));
                return (
                  <td key={c.key} className={c.moeda ? 'font-semibold text-slate-800' : ''}>
                    {c.moeda ? fmtMoeda(numeroPlanilha(valor)) : fmt(valor)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {linhas.length > 8 && (
        <p className="text-xs text-slate-400 text-center py-2">
          Mostrando 8 de {linhas.length} registros
        </p>
      )}
    </div>
  );
}

function SecaoPlanoCampanha({ dados }) {
  if (!dados) return null;
  const config = dados.configuracao || {};
  const cronograma = dados.cronograma || [];
  const metas = dados.metas || [];

  const porFase = {};
  cronograma.forEach(function(row) {
    const fase = row['Fase'] || row['fase'] || 'Geral';
    if (!porFase[fase]) porFase[fase] = 0;
    porFase[fase]++;
  });

  return (
    <div className="card overflow-hidden mb-6">
      <SecaoTitulo icone="📅" titulo="Plano de Campanha" subtitulo={`${cronograma.length} ações · ${metas.length} metas`} />
      <div className="p-5">
        {config.nome_candidato && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { l: 'Candidato', v: config.nome_candidato },
              { l: 'Cargo', v: config.cargo },
              { l: 'Cidade', v: config.cidade },
              { l: 'Nº Urna', v: config.numero_urna },
            ].map(function(item) {
              return item.v ? (
                <div key={item.l} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">{item.l}</p>
                  <p className="text-sm font-semibold text-slate-800">{fmt(item.v)}</p>
                </div>
              ) : null;
            })}
          </div>
        )}
        {Object.keys(porFase).length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Ações por fase</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(porFase).map(function([fase, qtd]) {
                return (
                  <div key={fase} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-center">
                    <p className="text-lg font-bold text-blue-700">{qtd}</p>
                    <p className="text-xs text-blue-500">{fase}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Cronograma</p>
            <TabelaSimples
          legenda="Cronograma do plano de campanha"
          linhas={cronograma}
          colunas={[
            { key: 'Fase', label: 'Fase' },
            { key: 'Tarefa / Ação', label: 'Ação' },
            { key: 'Responsável', label: 'Responsável' },
            { key: 'Status', label: 'Status' },
          ]}
        />
      </div>
    </div>
  );
}

function SecaoPesquisa({ dados }) {
  if (!dados) return null;
  const entrevistas  = dados.entrevistas   || [];
  const porCandidato = dados.por_candidato || [];
  const porTema      = dados.por_tema      || [];
  return (
    <div className="card overflow-hidden mb-6">
      <SecaoTitulo icone="🗳️" titulo="Pesquisa de Intenção de Voto"
        subtitulo={`${entrevistas.length} entrevistas · ${porCandidato.length} candidatos · ${porTema.length} temas`} />
      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por candidato</p>
        <TabelaSimples
              legenda="Pesquisa agrupada por candidato"
              linhas={porCandidato}
              colunas={[
                { key: 'Candidato', label: 'Candidato' },
                { key: '% do Total', label: '%' },
                { key: 'Partido', label: 'Partido' },
              ]}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por tema</p>
            <TabelaSimples
              legenda="Pesquisa agrupada por tema"
              linhas={porTema}
              colunas={[
                { key: 'Tema', label: 'Tema' },
                { key: '% do Total', label: '%' },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SecaoFinanceiro({ dados }) {
  if (!dados) return null;
  const receitas = dados.receitas  || [];
  const despesas = dados.despesas  || [];
  const totalReceitas = receitas.reduce(function(s, r) { return s + numeroPlanilha(valorPlanilha(r, 'Valor (R$)', 'Valor')); }, 0);
  const totalDespesas = despesas.reduce(function(s, r) { return s + numeroPlanilha(valorPlanilha(r, 'Valor (R$)', 'Valor')); }, 0);
  const saldo = totalReceitas - totalDespesas;
  return (
    <div className="card overflow-hidden mb-6">
      <SecaoTitulo icone="💰" titulo="Financeiro Eleitoral (TSE)"
        subtitulo={`${receitas.length} receitas · ${despesas.length} despesas`} />
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
            <p className="text-xs text-green-600 mb-1">Total Receitas</p>
            <p className="text-lg font-bold text-green-700">{fmtMoeda(totalReceitas)}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
            <p className="text-xs text-red-600 mb-1">Total Despesas</p>
            <p className="text-lg font-bold text-red-700">{fmtMoeda(totalDespesas)}</p>
          </div>
          <div className={`border rounded-lg p-3 text-center ${saldo >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
            <p className={`text-xs mb-1 ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Saldo</p>
            <p className={`text-lg font-bold ${saldo >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{fmtMoeda(saldo)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Receitas</p>
            <TabelaSimples
              legenda="Receitas importadas"
              linhas={receitas}
              colunas={[
                { key: 'Tipo de Receita', label: 'Tipo' },
                { key: 'Doador / Origem', label: 'Doador' },
                { key: 'Valor (R$)', alternativas: ['Valor'], label: 'Valor', moeda: true },
              ]}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Despesas</p>
            <TabelaSimples
              legenda="Despesas importadas"
              linhas={despesas}
              colunas={[
                { key: 'Descrição', alternativas: ['Fornecedor/Beneficiario', 'Fornecedor / Beneficiario'], label: 'Descrição' },
                { key: 'Categoria', label: 'Categoria' },
                { key: 'Valor (R$)', alternativas: ['Valor'], label: 'Valor', moeda: true },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const usuario = obterUsuario();
  const config = obterConfigDashboard(usuario?.cargo_politico, usuario?.modo_sistema);
  const podeImportar = usuario?.nivel !== 'visualizador';
  const podeVerFinanceiro = usuario?.nivel === 'admin' || usuario?.nivel === 'coordenador';

  const [kpis,             setKpis]             = useState(null);
  const [ultimosCadastros, setUltimosCadastros] = useState([]);
  const [carregando,       setCarregando]       = useState(true);
  const [erro,             setErro]             = useState('');
  const [modalImport,      setModalImport]      = useState(false);

  const [planoCampanha, setPlanoCampanha] = useState(null);
  const [pesquisa,      setPesquisa]      = useState(null);
  const [financeiro,    setFinanceiro]    = useState(null);

  const buscarDados = useCallback(async function() {
    setCarregando(true);
    setErro('');
    try {
      const [resConfirmados, resProvaveis, resDemandas, resRecentes,
             resPlano, resPesquisa, resFinanceiro] =
        await Promise.all([
          apiFetch('/voters?status_voto=confirmado&limit=1'),
          apiFetch('/voters?status_voto=provavel&limit=1'),
          apiFetch('/demands?status=aberta&limit=1'),
          apiFetch('/voters?limit=8'),
          apiFetch('/planilha/campanha/ultimo'),
          apiFetch('/planilha/pesquisa/ultimo'),
          podeVerFinanceiro
            ? apiFetch('/planilha/financeiro/ultimo')
            : Promise.resolve(null),
        ]);

      const [dadosConfirmados, dadosProvaveis, dadosDemandas, dadosRecentes,
             dadosPlano, dadosPesquisa, dadosFinanceiro] = await Promise.all([
        lerRespostaApi(resConfirmados),
        lerRespostaApi(resProvaveis),
        lerRespostaApi(resDemandas),
        lerRespostaApi(resRecentes),
        lerRespostaApi(resPlano, true),
        lerRespostaApi(resPesquisa, true),
        resFinanceiro ? lerRespostaApi(resFinanceiro, true) : Promise.resolve(null),
      ]);

      const total       = dadosRecentes.paginacao?.total ?? 0;
      const confirmados = dadosConfirmados.paginacao?.total ?? 0;
      const provaveis   = dadosProvaveis.paginacao?.total ?? 0;
      const demandas    = dadosDemandas.paginacao?.total ?? 0;
      const recentes    = dadosRecentes.dados ?? [];

      setKpis({ total, confirmados, provaveis, demandas });
      setUltimosCadastros(recentes);

      setPlanoCampanha(dadosPlano);
      setPesquisa(dadosPesquisa);
      setFinanceiro(dadosFinanceiro);

    } catch (_) {
      setErro('Nao foi possivel carregar os dados do painel.');
    } finally {
      setCarregando(false);
    }
  }, [podeVerFinanceiro]);

  useEffect(function() { buscarDados(); }, [buscarDados]);

  const pctMeta = kpis && kpis.total > 0
    ? Math.min(100, Math.round((kpis.confirmados / kpis.total) * 100)) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <p className="section-eyebrow mb-1">{config.tituloPainel}</p>
          <h1 className="page-title">Painel de Campanha</h1>
          <p className="page-subtitle">
            {usuario?.nome_candidato
              ? `${usuario.nome_candidato} · ${usuario.municipio || ''}–${usuario.uf || ''}`
              : config.subtituloPainel}
          </p>
        </div>
        {podeImportar && <button type="button" className="btn-primary flex-shrink-0"
          onClick={function() { setModalImport(true); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          Importar planilha
        </button>}
      </header>

      {erro && (
        <div role="alert" className="alert-error mb-6">
          {erro}{' '}
          <button type="button" className="font-semibold underline" onClick={buscarDados}>Tentar novamente</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard titulo={config.kpiEleitores.titulo}
          valor={carregando ? '–' : kpis?.total?.toLocaleString('pt-BR') ?? '–'}
          subtitulo={config.kpiEleitores.subtitulo} carregando={carregando} />
        <KpiCard titulo={config.kpiConfirmados.titulo}
          valor={carregando ? '–' : kpis?.confirmados?.toLocaleString('pt-BR') ?? '–'}
          subtitulo={config.kpiConfirmados.subtitulo + (kpis ? ` · ${pctMeta}% da base` : '')}
          carregando={carregando} />
        <KpiCard titulo="Votos prováveis"
          valor={carregando ? '–' : kpis?.provaveis?.toLocaleString('pt-BR') ?? '–'}
          subtitulo="Em processo de confirmação" carregando={carregando} />
        <KpiCard titulo={config.kpiDemandas.titulo}
          valor={carregando ? '–' : kpis?.demandas?.toLocaleString('pt-BR') ?? '–'}
          subtitulo={config.kpiDemandas.subtitulo} carregando={carregando} />
      </div>

      {!carregando && kpis && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Progresso de votos confirmados</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {kpis.confirmados.toLocaleString('pt-BR')} de {kpis.total.toLocaleString('pt-BR')} cadastrados
              </p>
            </div>
            <span className="text-xl font-semibold text-slate-900 tabular-nums">{pctMeta}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden"
            role="progressbar" aria-valuenow={pctMeta} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-indigo-600 rounded-sm transition-all duration-700"
              style={{ width: `${pctMeta}%` }} />
          </div>
        </div>
      )}

      <SecaoPlanoCampanha dados={planoCampanha} />
      <SecaoPesquisa      dados={pesquisa} />
      <SecaoFinanceiro    dados={financeiro} />

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="card-title">Últimos cadastros</p>
            <p className="text-xs text-slate-400 mt-0.5">Dados isolados por instância · CPF mascarado para operadores</p>
          </div>
          <Link to="/eleitores" className="btn-secondary text-xs px-3 py-1.5">Ver todos</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="gov-table" aria-label="Últimos eleitores cadastrados">
            <caption className="sr-only">Últimos eleitores cadastrados</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th><th scope="col">Bairro</th>
                <th scope="col">Zona / Seção</th><th scope="col">Status</th>
                <th scope="col">Contato</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                Array.from({ length: 6 }).map(function(_, i) {
                  return <tr key={i}>{Array.from({ length: 5 }).map(function(_, j) {
                    return <td key={j}><div className="h-3.5 bg-slate-100 rounded animate-pulse"
                      style={{ width: `${60 + j * 7}%` }} /></td>;
                  })}</tr>;
                })
              ) : ultimosCadastros.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12">
                  <p className="text-sm text-slate-400">Nenhum eleitor cadastrado ainda.</p>
                  {podeImportar && (
                    <button type="button" className="mt-2 text-sm text-indigo-600 font-medium hover:underline"
                      onClick={function() { setModalImport(true); }}>
                      Importe uma planilha para começar →
                    </button>
                  )}
                </td></tr>
              ) : (
                ultimosCadastros.map(function(e) {
                  return (
                    <tr key={e.id}>
                      <td className="font-medium text-slate-900">{e.nome}</td>
                      <td className="text-slate-500">{e.bairro || '—'}</td>
                      <td>{e.zona_eleitoral
                        ? <span className="mono-data">{String(e.zona_eleitoral).padStart(3,'0')} / {String(e.secao_eleitoral||0).padStart(4,'0')}</span>
                        : <span className="text-slate-300">—</span>}
                      </td>
                      <td><BadgeStatus status={e.status_voto} /></td>
                      <td className="mono-data">{e.whatsapp || e.telefone || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {podeImportar && (
        <ImportarPlanilha aberto={modalImport} onFechar={function() { setModalImport(false); buscarDados(); }} />
      )}
    </div>
  );
}

export default Dashboard;
