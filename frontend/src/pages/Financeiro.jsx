
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { numeroPlanilha, valorPlanilha } from '../utils/planilhaDados.js';

function fmtMoeda(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function KpiFinanceiro({ titulo, valor, subtitulo, cor }) {
  return (
    <div className={`card p-5 border-t-4 ${cor}`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{titulo}</p>
      <p className="text-2xl font-bold text-slate-900">{valor}</p>
      {subtitulo && <p className="text-xs text-slate-400 mt-1">{subtitulo}</p>}
    </div>
  );
}

function BarraProgresso({ label, valor, total, cor }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>{label}</span>
        <span>{fmtMoeda(valor)} ({pct}%)</span>
      </div>
      <div
        className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-sm transition-all duration-700 ${cor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Financeiro() {
  const [dados,      setDados]      = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro,       setErro]       = useState('');

  const buscar = useCallback(async function() {
    setCarregando(true);
    setErro('');
    try {
      const res = await apiFetch('/planilha/financeiro/ultimo');
      if (res.ok) {
        setDados(await res.json());
      } else if (res.status === 404) {
        setDados(null);
      } else {
        const respostaErro = await res.json().catch(function() { return {}; });
        setErro(respostaErro.erro || 'Erro ao carregar dados financeiros.');
      }
    } catch (_) {
      setErro('Falha de conexao.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(function() { buscar(); }, [buscar]);

  const receitas  = dados?.receitas  || [];
  const despesas  = dados?.despesas  || [];
  const prestacao = dados?.prestacao || [];

  const totalReceitas = receitas.reduce(function(s, r) {
    return s + numeroPlanilha(valorPlanilha(r, 'Valor (R$)', 'Valor'));
  }, 0);
  const totalDespesas = despesas.reduce(function(s, r) {
    return s + numeroPlanilha(valorPlanilha(r, 'Valor (R$)', 'Valor'));
  }, 0);
  const saldo = totalReceitas - totalDespesas;

  const porTipoReceita = {};
  receitas.forEach(function(r) {
    const tipo = valorPlanilha(r, 'Tipo de Receita', 'Tipo') || 'Outros';
    porTipoReceita[tipo] = (porTipoReceita[tipo] || 0) + numeroPlanilha(valorPlanilha(r, 'Valor (R$)', 'Valor'));
  });

  const porCategoria = {};
  despesas.forEach(function(d) {
    const cat = valorPlanilha(d, 'Categoria', 'Descricao', 'Descrição') || 'Outros';
    porCategoria[cat] = (porCategoria[cat] || 0) + numeroPlanilha(valorPlanilha(d, 'Valor (R$)', 'Valor'));
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      <header className="mb-8">
        <p className="section-eyebrow mb-1">Gestor Eleitoral</p>
        <h1 className="page-title">Controle Financeiro</h1>
        <p className="page-subtitle">Receitas, despesas e prestação de contas da campanha</p>
      </header>

      {carregando && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-px bg-slate-200 rounded-md overflow-hidden mb-6">
          {[1,2,3,4].map(function(i) {
            return <div key={i} className="card p-5"><div className="h-8 bg-slate-100 rounded animate-pulse" /></div>;
          })}
        </div>
      )}

      {!carregando && erro && (
        <div role="alert" className="alert-error mb-6">
          {erro}{' '}
          <button type="button" className="font-semibold underline" onClick={buscar}>
            Tentar novamente
          </button>
        </div>
      )}

      {!carregando && !dados && !erro && (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-4">💰</p>
          <p className="text-sm font-semibold text-slate-700 mb-2">Nenhum dado financeiro importado ainda</p>
          <p className="text-xs text-slate-400">Importe uma planilha Financeiro Eleitoral TSE pelo botão "Importar planilha" no Painel.</p>
        </div>
      )}

      {!carregando && dados && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <KpiFinanceiro
              titulo="Total Receitas"
              valor={fmtMoeda(totalReceitas)}
              subtitulo={`${receitas.length} lançamentos`}
              cor="border-green-500"
            />
            <KpiFinanceiro
              titulo="Total Despesas"
              valor={fmtMoeda(totalDespesas)}
              subtitulo={`${despesas.length} lançamentos`}
              cor="border-red-500"
            />
            <KpiFinanceiro
              titulo="Saldo"
              valor={fmtMoeda(saldo)}
              subtitulo={saldo >= 0 ? 'Positivo' : 'Negativo'}
              cor={saldo >= 0 ? 'border-blue-500' : 'border-orange-500'}
            />
            <KpiFinanceiro
              titulo="Itens Prestação"
              valor={prestacao.length}
              subtitulo="Documentos TSE"
              cor="border-purple-500"
            />
          </div>

          <div className="card p-5 mb-6">
            <p className="card-title mb-4">Visão geral — Receitas vs Despesas</p>
            <div
              className="w-full h-6 bg-slate-100 rounded-sm overflow-hidden flex mb-2"
              role="img"
              aria-label={`Receitas ${fmtMoeda(totalReceitas)}; despesas ${fmtMoeda(totalDespesas)}`}
            >
              <div
                className="h-full bg-green-500 transition-all duration-700"
                style={{ width: totalReceitas + totalDespesas > 0 ? `${(totalReceitas / (totalReceitas + totalDespesas)) * 100}%` : '50%' }}
              />
              <div
                className="h-full bg-red-400 transition-all duration-700"
                style={{ width: totalReceitas + totalDespesas > 0 ? `${(totalDespesas / (totalReceitas + totalDespesas)) * 100}%` : '50%' }}
              />
            </div>
            <div className="flex gap-6 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Receitas {fmtMoeda(totalReceitas)}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Despesas {fmtMoeda(totalDespesas)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            <div className="card p-5">
              <p className="card-title mb-4">Receitas por tipo</p>
              {Object.entries(porTipoReceita).sort(function(a,b){return b[1]-a[1]}).map(function([tipo, val]) {
                return <BarraProgresso key={tipo} label={tipo} valor={val} total={totalReceitas} cor="bg-green-500" />;
              })}
              {Object.keys(porTipoReceita).length === 0 && <p className="text-xs text-slate-400">Sem dados</p>}
            </div>

            <div className="card p-5">
              <p className="card-title mb-4">Despesas por categoria</p>
              {Object.entries(porCategoria).sort(function(a,b){return b[1]-a[1]}).map(function([cat, val]) {
                return <BarraProgresso key={cat} label={cat} valor={val} total={totalDespesas} cor="bg-red-400" />;
              })}
              {Object.keys(porCategoria).length === 0 && <p className="text-xs text-slate-400">Sem dados</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="card-title">Receitas</p>
              </div>
              <div className="overflow-x-auto">
                <table className="gov-table">
                  <caption className="sr-only">Receitas importadas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Tipo</th>
                      <th scope="col">Doador / Origem</th>
                      <th scope="col">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receitas.map(function(r, i) {
                      return (
                        <tr key={i}>
                          <td className="text-xs">{valorPlanilha(r, 'Tipo de Receita', 'Tipo') || '—'}</td>
                          <td className="text-xs">{valorPlanilha(r, 'Doador / Origem', 'Doador', 'Origem') || '—'}</td>
                          <td className="text-xs font-semibold text-green-700">{fmtMoeda(numeroPlanilha(valorPlanilha(r, 'Valor (R$)', 'Valor')))}</td>
                        </tr>
                      );
                    })}
                    {receitas.length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-4">Sem receitas</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="card-title">Despesas</p>
              </div>
              <div className="overflow-x-auto">
                <table className="gov-table">
                  <caption className="sr-only">Despesas importadas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Descrição</th>
                      <th scope="col">Categoria</th>
                      <th scope="col">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesas.map(function(d, i) {
                      return (
                        <tr key={i}>
                          <td className="text-xs">{valorPlanilha(d, 'Descrição', 'Descricao', 'Fornecedor/Beneficiario') || '—'}</td>
                          <td className="text-xs">{valorPlanilha(d, 'Categoria') || '—'}</td>
                          <td className="text-xs font-semibold text-red-600">{fmtMoeda(numeroPlanilha(valorPlanilha(d, 'Valor (R$)', 'Valor')))}</td>
                        </tr>
                      );
                    })}
                    {despesas.length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-4">Sem despesas</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {prestacao.length > 0 && (
            <div className="card overflow-hidden mt-6">
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="card-title">Prestação de Contas TSE</p>
              </div>
              <div className="overflow-x-auto">
                <table className="gov-table">
                  <caption className="sr-only">Itens da prestação de contas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Descrição</th>
                      <th scope="col">Valor</th>
                      <th scope="col">Prazo TSE</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prestacao.map(function(p, i) {
                      return (
                        <tr key={i}>
                          <td className="text-xs">{valorPlanilha(p, 'Item') || i+1}</td>
                          <td className="text-xs">{valorPlanilha(p, 'Descrição', 'Descricao') || '—'}</td>
                          <td className="text-xs font-semibold">{fmtMoeda(numeroPlanilha(valorPlanilha(p, 'Valor (R$)', 'Valor')))}</td>
                          <td className="text-xs">{valorPlanilha(p, 'Prazo TSE', 'Prazo') || '—'}</td>
                          <td className="text-xs">{valorPlanilha(p, 'Status', 'Situação') || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400 mt-4">
            Dados importados de: <strong>{dados.arquivo_nome}</strong> em {new Date(dados.created_at).toLocaleDateString('pt-BR')}
          </p>
        </>
      )}
    </div>
  );
}
