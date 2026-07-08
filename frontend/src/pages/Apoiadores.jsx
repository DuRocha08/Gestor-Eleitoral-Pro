import React, { useCallback, useEffect, useState } from 'react';
import { apiPost, apiRequest } from '../utils/api.js';
import { obterUsuario } from '../utils/authStorage.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

const INICIAL = { nome: '', whatsapp: '', telefone: '', email: '', endereco: '', bairro: '', cidade: '', uf: '', ra: '', votos_estimados: 0, nivel_influencia: 'medio', status: 'ativo', observacoes: '', lider_politico: false };

export default function Apoiadores() {
  const usuario = obterUsuario();
  const podeEditar = usuario?.nivel !== 'visualizador';
  const [dados, setDados] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [form, setForm] = useState(INICIAL);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async function() {
    try {
      const [lista, dash] = await Promise.all([
        apiRequest('/supporters' + (busca ? '?busca=' + encodeURIComponent(busca) : '')),
        apiRequest('/supporters/dashboard'),
      ]);
      setDados(lista.dados || []);
      setResumo(dash.resumo || null);
      setErro('');
    } catch (e) { setErro(e.message); }
  }, [busca]);

  useEffect(function() { carregar(); }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    try {
      await apiPost('/supporters', form);
      setForm(INICIAL);
      setAberto(false);
      carregar();
    } catch (err) { setErro(err.message); }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex justify-between gap-4 mb-6"><div><p className="section-eyebrow mb-1">Base politica</p><h1 className="page-title">Apoiadores e liderancas</h1><p className="page-subtitle">Cadastro, territorio, votos estimados e historico.</p></div>{podeEditar && <button className="btn-primary" onClick={() => setAberto(!aberto)}>Novo apoiador</button>}</header>
      {erro && <AlertBox tipo="erro">{erro}</AlertBox>}
      {resumo && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"><div className="card p-4"><p className="text-xs text-slate-400">Apoiadores</p><p className="text-2xl font-bold">{resumo.total}</p></div><div className="card p-4"><p className="text-xs text-slate-400">Liderancas</p><p className="text-2xl font-bold">{resumo.lideres}</p></div><div className="card p-4"><p className="text-xs text-slate-400">Votos estimados</p><p className="text-2xl font-bold">{resumo.votos_estimados}</p></div><div className="card p-4"><p className="text-xs text-slate-400">Confirmados</p><p className="text-2xl font-bold">{resumo.votos_confirmados}</p></div></div>}
      {aberto && <form onSubmit={salvar} className="card p-5 grid md:grid-cols-3 gap-3 mb-6"><div><label className="label">Nome</label><input className="input" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required /></div><div><label className="label">WhatsApp</label><input className="input" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} /></div><div><label className="label">Telefone</label><input className="input" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div><div><label className="label">E-mail</label><input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div><div><label className="label">Endereco</label><input className="input" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} /></div><div><label className="label">Bairro</label><input className="input" value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} /></div><div><label className="label">Cidade</label><input className="input" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div><div><label className="label">UF</label><input className="input" value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div><div><label className="label">RA</label><input className="input" value={form.ra} onChange={e => setForm({ ...form, ra: e.target.value })} /></div><div><label className="label">Votos estimados</label><input type="number" min="0" className="input" value={form.votos_estimados} onChange={e => setForm({ ...form, votos_estimados: e.target.value })} /></div><div><label className="label">Influencia</label><select className="input" value={form.nivel_influencia} onChange={e => setForm({ ...form, nivel_influencia: e.target.value })}><option value="baixo">Baixo</option><option value="medio">Medio</option><option value="alto">Alto</option></select></div><div><label className="label">Status</label><select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="ativo">Ativo</option><option value="pendente">Pendente</option><option value="inativo">Inativo</option></select></div><label className="flex items-center gap-2 mt-7 text-sm"><input type="checkbox" checked={form.lider_politico} onChange={e => setForm({ ...form, lider_politico: e.target.checked })} /> Lider politico</label><div className="md:col-span-3"><label className="label">Observacoes</label><textarea className="input" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div><div className="md:col-span-3 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAberto(false)}>Cancelar</button><button className="btn-primary">Salvar</button></div></form>}
      <div className="card p-4 mb-4 max-w-md"><label className="label">Buscar</label><input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, bairro ou cidade" /></div>
      <div className="card overflow-x-auto"><table className="gov-table"><thead><tr><th>Nome</th><th>Contato</th><th>RA / Bairro</th><th>Cidade</th><th>Votos</th><th>Influencia</th><th>Status</th></tr></thead><tbody>{dados.map(a => <tr key={a.id}><td><strong>{a.nome}</strong><div className="text-xs text-slate-400">{a.observacoes}</div></td><td>{a.whatsapp || a.telefone || a.email || '-'}</td><td>{a.ra || '-'} / {a.bairro || '-'}</td><td>{a.cidade || '-'} {a.uf || ''}</td><td>{a.votos_estimados}</td><td>{a.nivel_influencia}</td><td>{a.status}</td></tr>)}{!dados.length && <tr><td colSpan="7" className="text-center py-10 text-slate-400">Nenhum apoiador cadastrado.</td></tr>}</tbody></table></div>
    </div>
  );
}
