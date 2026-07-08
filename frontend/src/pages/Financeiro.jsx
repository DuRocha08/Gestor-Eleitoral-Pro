import React, { useCallback, useEffect, useState } from 'react';
import { apiPost, apiRequest } from '../utils/api.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

const INICIAL = {
  tipo: 'despesa', descricao: '', valor: '', data_movimentacao: '',
  categoria_id: '', fornecedor: '', contraparte: '', forma_pagamento: 'PIX',
  data_vencimento: '', data_pagamento: '', status_pagamento: 'pendente', numero_documento: '',
  comprovante_url: '', observacoes: '',
};

function fmtMoeda(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBr(valor) {
  if (!valor) return '-';
  return new Date(valor + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function Financeiro() {
  const [saldo, setSaldo] = useState(null);
  const [dados, setDados] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [mensal, setMensal] = useState([]);
  const [limite, setLimite] = useState({ ano_eleicao: new Date().getFullYear(), cargo: '', uf: '', municipio: '', valor_limite: '' });
  const [form, setForm] = useState(INICIAL);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState('');

  const carregar = useCallback(async function() {
    try {
      const qs = filtro ? '?tipo=' + filtro : '';
      const [s, lista, cats, rel] = await Promise.all([
        apiRequest('/finance/balance'),
        apiRequest('/finance' + qs),
        apiRequest('/finance/categories'),
        apiRequest('/finance/reports/monthly'),
      ]);
      setSaldo(s);
      setDados(lista.dados || []);
      setCategorias(cats.dados || []);
      setMensal(rel.dados || []);
      setErro('');
    } catch (e) { setErro(e.message); }
  }, [filtro]);

  useEffect(function() { carregar(); }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    try {
      await apiPost('/finance', form);
      setForm(INICIAL);
      setAberto(false);
      carregar();
    } catch (err) { setErro(err.message); }
  }

  async function salvarLimite(e) {
    e.preventDefault();
    try {
      await apiPost('/finance/spending-limit', limite);
      setLimite({ ano_eleicao: new Date().getFullYear(), cargo: '', uf: '', municipio: '', valor_limite: '' });
      carregar();
    } catch (err) { setErro(err.message); }
  }

  const categoriasFiltradas = categorias.filter(c => c.tipo === form.tipo);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex justify-between gap-4 mb-6">
        <div>
          <p className="section-eyebrow mb-1">Gestor Eleitoral</p>
          <h1 className="page-title">Controle Financeiro</h1>
          <p className="page-subtitle">Receitas, despesas, fornecedores, vencimentos e fluxo de caixa.</p>
        </div>
        <button className="btn-primary" onClick={() => setAberto(!aberto)}>Novo lancamento</button>
      </header>

      {erro && <AlertBox tipo="erro">{erro}</AlertBox>}

      {saldo?.limite_gastos && (
        <div className={
          'card p-5 mb-6 border-l-4 ' +
          (saldo.limite_gastos.status === 'limite_excedido' ? 'border-red-500' :
           saldo.limite_gastos.status === 'proximo_do_limite' ? 'border-amber-500' : 'border-green-500')
        }>
          <p className="card-title mb-3">Limite de gastos da campanha</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
            <div><p className="text-xs text-slate-400">Valor limite permitido</p><strong>{fmtMoeda(saldo.limite_gastos.valor_limite)}</strong></div>
            <div><p className="text-xs text-slate-400">Valor ja gasto</p><strong>{fmtMoeda(saldo.limite_gastos.valor_gasto)}</strong></div>
            <div><p className="text-xs text-slate-400">Valor restante</p><strong>{fmtMoeda(saldo.limite_gastos.valor_restante)}</strong></div>
            <div><p className="text-xs text-slate-400">Percentual utilizado</p><strong>{saldo.limite_gastos.percentual_utilizado}%</strong></div>
            <div><p className="text-xs text-slate-400">Status</p><strong>{saldo.limite_gastos.status.replaceAll('_', ' ')}</strong></div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Base legal configuravel: Lei 13.488/2017 e limites divulgados pelo TSE. Confira o valor oficial antes de salvar.</p>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="card p-5 border-t-4 border-green-500"><p className="text-xs text-slate-500">Receitas</p><p className="text-2xl font-bold">{fmtMoeda(saldo?.total_receitas)}</p></div>
        <div className="card p-5 border-t-4 border-red-500"><p className="text-xs text-slate-500">Despesas</p><p className="text-2xl font-bold">{fmtMoeda(saldo?.total_despesas)}</p></div>
        <div className="card p-5 border-t-4 border-blue-500"><p className="text-xs text-slate-500">Saldo</p><p className="text-2xl font-bold">{fmtMoeda(saldo?.saldo_consolidado)}</p></div>
        <div className="card p-5 border-t-4 border-amber-500"><p className="text-xs text-slate-500">Pendente aprovacao</p><p className="text-2xl font-bold">{fmtMoeda(saldo?.total_pendente_aprovacao)}</p></div>
      </div>

      {aberto && (
        <form onSubmit={salvar} className="card p-5 grid md:grid-cols-4 gap-3 mb-6">
          <div><label className="label">Tipo</label><select className="input" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value, categoria_id: '', status_pagamento: e.target.value === 'receita' ? 'pago' : 'pendente' })}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></div>
          <div className="md:col-span-2"><label className="label">Descricao</label><input className="input" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} required /></div>
          <div><label className="label">Valor</label><input type="number" min="0.01" step="0.01" className="input" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} required /></div>
          <div><label className="label">Data</label><input type="date" className="input" value={form.data_movimentacao} onChange={e => setForm({ ...form, data_movimentacao: e.target.value })} required /></div>
          <div><label className="label">Vencimento</label><input type="date" className="input" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} /></div>
          <div><label className="label">Data paga</label><input type="date" className="input" value={form.data_pagamento} onChange={e => setForm({ ...form, data_pagamento: e.target.value })} /></div>
          <div><label className="label">Categoria</label><select className="input" value={form.categoria_id} onChange={e => setForm({ ...form, categoria_id: e.target.value })}><option value="">Sem categoria</option>{categoriasFiltradas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div><label className="label">Pagamento</label><select className="input" value={form.forma_pagamento} onChange={e => setForm({ ...form, forma_pagamento: e.target.value })}><option>PIX</option><option>Dinheiro</option><option>Transferencia</option><option>Cartao</option><option>Boleto</option></select></div>
          <div><label className="label">Status</label><select className="input" value={form.status_pagamento} onChange={e => setForm({ ...form, status_pagamento: e.target.value })}><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="atrasado">Atrasado</option><option value="cancelado">Cancelado</option></select></div>
          <div><label className="label">Fornecedor</label><input className="input" value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} /></div>
          <div><label className="label">Doador / origem</label><input className="input" value={form.contraparte} onChange={e => setForm({ ...form, contraparte: e.target.value })} /></div>
          <div><label className="label">Recibo</label><input className="input" value={form.numero_documento} onChange={e => setForm({ ...form, numero_documento: e.target.value })} /></div>
          <div><label className="label">Comprovante URL</label><input className="input" value={form.comprovante_url} onChange={e => setForm({ ...form, comprovante_url: e.target.value })} /></div>
          <div className="md:col-span-4"><label className="label">Observacoes</label><textarea className="input" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
          <div className="md:col-span-4 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAberto(false)}>Cancelar</button><button className="btn-primary">Salvar</button></div>
        </form>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="card p-4"><label className="label">Filtrar tipo</label><select className="input" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="">Todos</option><option value="receita">Receitas</option><option value="despesa">Despesas</option></select></div>
        <form onSubmit={salvarLimite} className="card p-4 lg:col-span-2 grid md:grid-cols-5 gap-2"><p className="card-title md:col-span-5">Configurar limite de gastos</p><input className="input" placeholder="Ano" value={limite.ano_eleicao} onChange={e => setLimite({ ...limite, ano_eleicao: e.target.value })} /><input className="input" placeholder="Cargo" value={limite.cargo} onChange={e => setLimite({ ...limite, cargo: e.target.value })} /><input className="input" placeholder="UF" value={limite.uf} onChange={e => setLimite({ ...limite, uf: e.target.value.toUpperCase() })} /><input className="input" placeholder="Municipio" value={limite.municipio} onChange={e => setLimite({ ...limite, municipio: e.target.value })} /><input className="input" placeholder="Valor limite" type="number" min="0" step="0.01" value={limite.valor_limite} onChange={e => setLimite({ ...limite, valor_limite: e.target.value })} /><div className="md:col-span-5 flex justify-end"><button className="btn-secondary">Salvar limite</button></div></form>
      </div>
      <div className="card p-4 mb-6"><p className="card-title mb-3">Relatorio mensal</p>{mensal.slice(0, 6).map(m => <div key={m.mes} className="flex justify-between text-sm border-b border-slate-100 py-2"><span>{m.mes}</span><span>Receitas {fmtMoeda(m.receitas)} | Despesas {fmtMoeda(m.despesas)} | Saldo {fmtMoeda(m.saldo)}</span></div>)}{!mensal.length && <p className="text-sm text-slate-400">Sem dados mensais.</p>}</div>

      <div className="card overflow-x-auto">
        <table className="gov-table">
          <thead><tr><th>Descricao</th><th>Tipo</th><th>Categoria</th><th>Valor</th><th>Data</th><th>Vencimento</th><th>Status</th><th>Fornecedor/origem</th></tr></thead>
          <tbody>{dados.map(m => <tr key={m.id}><td><strong>{m.descricao}</strong><div className="text-xs text-slate-400">{m.numero_documento || m.comprovante_url || m.observacoes}</div></td><td>{m.tipo}</td><td>{m.categoria_nome || '-'}</td><td className={m.tipo === 'receita' ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>{fmtMoeda(m.valor)}</td><td>{dataBr(m.data_movimentacao?.slice(0, 10))}</td><td>{dataBr(m.data_vencimento?.slice(0, 10))}</td><td>{m.status_pagamento}</td><td>{m.fornecedor || m.contraparte || '-'}</td></tr>)}{!dados.length && <tr><td colSpan="8" className="text-center text-slate-400 py-10">Nenhum lancamento cadastrado.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
