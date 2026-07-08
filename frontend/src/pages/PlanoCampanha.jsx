import React, { useCallback, useEffect, useState } from 'react';
import { apiPost, apiRequest } from '../utils/api.js';
import { obterUsuario } from '../utils/authStorage.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

const INICIAL = { fase: '', titulo: '', responsavel_nome: '', data_inicio: '', data_prazo: '', status: 'pendente', progresso: 0, descricao: '' };

export default function PlanoCampanha() {
  const usuario = obterUsuario();
  const podeEditar = usuario?.nivel !== 'visualizador';
  const [dados, setDados] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [form, setForm] = useState(INICIAL);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async function() {
    try {
      const resp = await apiRequest('/campaign-plan');
      setDados(resp.dados || []);
      setResumo(resp.resumo || null);
      setErro('');
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(function() { carregar(); }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    try {
      await apiPost('/campaign-plan', form);
      setForm(INICIAL);
      setAberto(false);
      carregar();
    } catch (err) { setErro(err.message); }
  }

  async function mudar(id, campo, valor) {
    try {
      await apiRequest('/campaign-plan/' + id, { method: 'PUT', body: JSON.stringify({ [campo]: valor }) });
      carregar();
    } catch (err) { setErro(err.message); }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex justify-between gap-4 mb-6"><div><p className="section-eyebrow mb-1">Plano de 90 dias</p><h1 className="page-title">Plano de Campanha</h1><p className="page-subtitle">Fases, acoes, prazos, responsaveis e progresso.</p></div>{podeEditar && <button className="btn-primary" onClick={() => setAberto(!aberto)}>Nova acao</button>}</header>
      {erro && <AlertBox tipo="erro">{erro}</AlertBox>}
      {resumo && <div className="grid grid-cols-3 gap-4 mb-6"><div className="card p-4"><p className="text-xs text-slate-400">Acoes</p><p className="text-2xl font-bold">{resumo.total || 0}</p></div><div className="card p-4"><p className="text-xs text-slate-400">Concluidas</p><p className="text-2xl font-bold">{resumo.concluidas || 0}</p></div><div className="card p-4"><p className="text-xs text-slate-400">Progresso medio</p><p className="text-2xl font-bold">{resumo.progresso_medio || 0}%</p></div></div>}
      {aberto && <form onSubmit={salvar} className="card p-5 grid md:grid-cols-4 gap-3 mb-6"><input className="input" placeholder="Fase" value={form.fase} onChange={e => setForm({ ...form, fase: e.target.value })} /><input className="input md:col-span-2" placeholder="Titulo" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} required /><input className="input" placeholder="Responsavel" value={form.responsavel_nome} onChange={e => setForm({ ...form, responsavel_nome: e.target.value })} /><input type="date" className="input" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /><input type="date" className="input" value={form.data_prazo} onChange={e => setForm({ ...form, data_prazo: e.target.value })} /><select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluida</option><option value="atrasada">Atrasada</option><option value="cancelada">Cancelada</option></select><input type="number" min="0" max="100" className="input" value={form.progresso} onChange={e => setForm({ ...form, progresso: e.target.value })} /><textarea className="input md:col-span-4" placeholder="Descricao" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /><div className="md:col-span-4 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAberto(false)}>Cancelar</button><button className="btn-primary">Salvar</button></div></form>}
      <div className="card overflow-x-auto"><table className="gov-table"><thead><tr><th>Fase</th><th>Acao</th><th>Responsavel</th><th>Prazo</th><th>Status</th><th>Progresso</th></tr></thead><tbody>{dados.map(a => <tr key={a.id}><td>{a.fase || '-'}</td><td><strong>{a.titulo}</strong><div className="text-xs text-slate-400">{a.descricao}</div></td><td>{a.responsavel_nome || a.responsavel_usuario || '-'}</td><td>{a.data_prazo ? new Date(a.data_prazo).toLocaleDateString('pt-BR') : '-'}</td><td>{podeEditar ? <select className="input min-w-40" value={a.status} onChange={e => mudar(a.id, 'status', e.target.value)}><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluida</option><option value="atrasada">Atrasada</option><option value="cancelada">Cancelada</option></select> : a.status}</td><td>{podeEditar ? <input className="input w-24" type="number" min="0" max="100" value={a.progresso} onChange={e => mudar(a.id, 'progresso', e.target.value)} /> : a.progresso + '%'}</td></tr>)}{!dados.length && <tr><td colSpan="6" className="text-center py-10 text-slate-400">Nenhuma acao cadastrada.</td></tr>}</tbody></table></div>
    </div>
  );
}
