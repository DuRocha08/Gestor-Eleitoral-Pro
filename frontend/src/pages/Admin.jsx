import React, { useCallback, useEffect, useState } from 'react';
import { apiPost, apiRequest } from '../utils/api.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

const FORM_INICIAL = { nome:'',email:'',telefone:'',senha:'',nivel:'operador' };

export default function Admin() {
  const [usuarios,setUsuarios]=useState([]); const [logs,setLogs]=useState([]);
  const [form,setForm]=useState(FORM_INICIAL); const [erro,setErro]=useState('');
  const [aba,setAba]=useState('equipe');
  const carregar=useCallback(async function(){try{const [u,a]=await Promise.all([apiRequest('/team'),apiRequest('/audit?limit=50')]);setUsuarios(u.dados);setLogs(a.dados);setErro('');}catch(e){setErro(e.message);}},[]);
  useEffect(function(){carregar();},[carregar]);
  async function criar(e){e.preventDefault();try{await apiPost('/auth/register',form);setForm(FORM_INICIAL);await carregar();}catch(err){setErro(err.message);}}
  async function alterar(id,dados){try{await apiRequest('/team/'+id,{method:'PATCH',body:JSON.stringify(dados)});await carregar();}catch(err){setErro(err.message);}}
  async function remover(usuario){if(!window.confirm(`Remover a conta de ${usuario.nome}? Os dados pessoais serao anonimizados e o acesso sera revogado.`))return;try{await apiRequest('/team/'+usuario.id,{method:'DELETE'});await carregar();}catch(err){setErro(err.message);}}
  return <div className="p-6 lg:p-8 max-w-6xl mx-auto"><h1 className="page-title">Administração</h1><p className="page-subtitle mb-6">Equipe, permissões e trilha de auditoria.</p>
    {erro&&<AlertBox tipo="erro">{erro}</AlertBox>}
    <div className="flex gap-2 mb-5"><button className={aba==='equipe'?'btn-primary':'btn-secondary'} onClick={()=>setAba('equipe')}>Equipe</button><button className={aba==='auditoria'?'btn-primary':'btn-secondary'} onClick={()=>setAba('auditoria')}>Auditoria</button></div>
    {aba==='equipe'&&<><div className="mb-4 text-sm text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-3">Estar na equipe não concede acesso administrativo automaticamente. Use o menor nível necessário. Somente o responsável principal pode gerenciar coordenadores.</div><form onSubmit={criar} className="card p-5 grid md:grid-cols-3 gap-3 mb-6">
      <div><label className="label">Nome</label><input className="input" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} required /></div>
      <div><label className="label">E-mail</label><input type="email" className="input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required /></div>
      <div><label className="label">Telefone</label><input className="input" value={form.telefone} onChange={e=>setForm({...form,telefone:e.target.value})} /></div>
      <div><label className="label">Senha inicial</label><input type="password" className="input" value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})} required /></div>
      <div><label className="label">Nível</label><select className="input" value={form.nivel} onChange={e=>setForm({...form,nivel:e.target.value})}><option value="coordenador">Coordenador</option><option value="operador">Operador</option><option value="visualizador">Visualizador</option></select></div>
      <div className="flex items-end"><button className="btn-primary w-full">Adicionar membro</button></div>
    </form><div className="card overflow-x-auto"><table className="gov-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Nível</th><th>MFA</th><th>Status</th><th>Ações</th></tr></thead><tbody>{usuarios.map(u=><tr key={u.id}><td>{u.nome}{u.proprietario&&<span className="block text-xs text-indigo-600">Responsável principal</span>}</td><td>{u.email}</td><td><select className="input min-w-36" value={u.nivel} disabled={u.nivel==='admin'||u.proprietario} onChange={e=>alterar(u.id,{nivel:e.target.value})}><option value="admin">Administrador</option><option value="coordenador">Coordenador</option><option value="operador">Operador</option><option value="visualizador">Visualizador</option></select></td><td>{u.mfa_ativo?'Ativo':'Não'}</td><td>{u.ativo?'Ativo':'Desativado'}</td><td><div className="flex gap-2"><button className="btn-secondary text-xs" disabled={u.proprietario} onClick={()=>alterar(u.id,{ativo:!u.ativo})}>{u.ativo?'Desativar':'Reativar'}</button><button className="btn-secondary text-xs text-red-700" disabled={u.proprietario} onClick={()=>remover(u)}>Remover</button></div></td></tr>)}</tbody></table></div></>}
    {aba==='auditoria'&&<div className="card overflow-x-auto"><table className="gov-table"><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>IP</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{new Date(l.criado_em).toLocaleString('pt-BR')}</td><td>{l.usuario_nome||'Sistema'}</td><td>{l.acao}</td><td>{l.entidade||'—'}</td><td>{l.ip||'—'}</td></tr>)}</tbody></table></div>}
  </div>;
}
