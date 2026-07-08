import React, { useCallback, useEffect, useState } from 'react';
import { apiPost, apiRequest } from '../utils/api.js';
import { obterUsuario } from '../utils/authStorage.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

const INICIAL = {
  titulo: '', tipo: 'evento', prioridade: 'media', status: 'agendado',
  data_inicio: '', data_fim: '', local: '', bairro: '', cidade: '', observacoes: '',
};

function dataLocal(valor) {
  if (!valor) return '-';
  return new Date(valor).toLocaleString('pt-BR');
}

export default function Agenda() {
  const usuario = obterUsuario();
  const podeEditar = usuario?.nivel !== 'visualizador';
  const [dados, setDados] = useState([]);
  const [form, setForm] = useState(INICIAL);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async function() {
    try {
      setCarregando(true);
      const qs = filtro ? '?status=' + encodeURIComponent(filtro) : '';
      const resp = await apiRequest('/agenda' + qs);
      setDados(resp.dados || []);
      setErro('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(function() { carregar(); }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    try {
      await apiPost('/agenda', form);
      setForm(INICIAL);
      setAberto(false);
      carregar();
    } catch (err) { setErro(err.message); }
  }

  async function alterarStatus(id, status) {
    try {
      await apiRequest('/agenda/' + id, { method: 'PUT', body: JSON.stringify({ status }) });
      carregar();
    } catch (err) { setErro(err.message); }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <p className="section-eyebrow mb-1">Agenda</p>
          <h1 className="page-title">Compromissos da campanha</h1>
          <p className="page-subtitle">Reunioes, visitas, eventos e lembretes.</p>
        </div>
        {podeEditar && <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setAberto(!aberto)}>Novo compromisso</button>}
      </header>

      {erro && <AlertBox tipo="erro">{erro}</AlertBox>}

      {aberto && (
        <form onSubmit={salvar} className="card p-5 grid md:grid-cols-3 gap-3 mb-6">
          <div className="md:col-span-2"><label className="label">Titulo</label><input className="input" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} required /></div>
          <div><label className="label">Tipo</label><select className="input" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option value="reuniao">Reuniao</option><option value="visita">Visita</option><option value="evento">Evento</option><option value="lembrete">Lembrete</option></select></div>
          <div><label className="label">Inicio</label><input type="datetime-local" className="input" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} required /></div>
          <div><label className="label">Fim</label><input type="datetime-local" className="input" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></div>
          <div><label className="label">Prioridade</label><select className="input" value={form.prioridade} onChange={e => setForm({ ...form, prioridade: e.target.value })}><option value="baixa">Baixa</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>
          <div><label className="label">Local</label><input className="input" value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} /></div>
          <div><label className="label">Bairro</label><input className="input" value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} /></div>
          <div><label className="label">Cidade</label><input className="input" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div>
          <div className="md:col-span-3"><label className="label">Observacoes</label><textarea className="input" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
          <div className="md:col-span-3 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAberto(false)}>Cancelar</button><button className="btn-primary">Salvar</button></div>
        </form>
      )}

      <div className="card p-4 mb-4 max-w-sm"><label className="label">Filtrar por status</label><select className="input" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="">Todos</option><option value="agendado">Agendado</option><option value="confirmado">Confirmado</option><option value="realizado">Realizado</option><option value="cancelado">Cancelado</option></select></div>

      <div className="card overflow-x-auto"><table className="gov-table"><thead><tr><th>Titulo</th><th>Data</th><th>Tipo</th><th>Local</th><th>Prioridade</th><th>Status</th></tr></thead><tbody>{carregando ? <tr><td colSpan="6" className="text-center py-10 text-slate-400">Carregando agenda...</td></tr> : dados.map(item => <tr key={item.id}><td><strong>{item.titulo}</strong><div className="text-xs text-slate-400">{item.observacoes}</div></td><td>{dataLocal(item.data_inicio)}</td><td>{item.tipo}</td><td>{item.local || item.bairro || '-'}</td><td>{item.prioridade}</td><td>{podeEditar ? <select className="input min-w-36" value={item.status} onChange={e => alterarStatus(item.id, e.target.value)}><option value="agendado">Agendado</option><option value="confirmado">Confirmado</option><option value="realizado">Realizado</option><option value="cancelado">Cancelado</option></select> : item.status}</td></tr>)}{!carregando && !dados.length && <tr><td colSpan="6" className="text-center py-10 text-slate-400">Nenhum compromisso cadastrado.</td></tr>}</tbody></table></div>
    </div>
  );
}
