import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../utils/api.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

const FORM_INICIAL = { nome:'',email:'',senha:'',campanha_id:'',nivel:'operador',administrador_global:false };

export default function PlatformAdmin() {
  const [aba,setAba]=useState('resumo');
  const [resumo,setResumo]=useState({}); const [campanhas,setCampanhas]=useState([]);
  const [usuarios,setUsuarios]=useState([]); const [logs,setLogs]=useState([]);
  const [form,setForm]=useState(FORM_INICIAL); const [erro,setErro]=useState('');
  const carregar=useCallback(async function(){
    try {
      const [r,c,u,a]=await Promise.all([
        apiRequest('/platform-admin/summary'),apiRequest('/platform-admin/campaigns'),
        apiRequest('/platform-admin/users'),apiRequest('/platform-admin/audit?limit=100')
      ]);
      setResumo(r.dados);setCampanhas(c.dados);setUsuarios(u.dados);setLogs(a.dados);setErro('');
      setForm(atual=>({...atual,campanha_id:atual.campanha_id||c.dados[0]?.id||''}));
    } catch(e) { setErro(e.message); }
  },[]);
  useEffect(function(){carregar();},[carregar]);

  async function criar(e){
    e.preventDefault();
    try { await apiRequest('/platform-admin/users',{method:'POST',body:JSON.stringify(form)});setForm({...FORM_INICIAL,campanha_id:campanhas[0]?.id||''});await carregar(); }
    catch(err){setErro(err.message);}
  }
  async function alterarUsuario(id,dados){
    try { await apiRequest('/platform-admin/users/'+id,{method:'PATCH',body:JSON.stringify(dados)});await carregar(); }
    catch(err){setErro(err.message);}
  }
  async function removerUsuario(usuario){
    if(!window.confirm(`Remover ${usuario.nome}? A conta sera anonimizada e perdera o acesso.`))return;
    try { await apiRequest('/platform-admin/users/'+usuario.id,{method:'DELETE'});await carregar(); }
    catch(err){setErro(err.message);}
  }
  async function alterarCampanha(id,status){
    try { await apiRequest('/platform-admin/campaigns/'+id,{method:'PATCH',body:JSON.stringify({status})});await carregar(); }
    catch(err){setErro(err.message);}
  }

  const cartoes=[['Campanhas',resumo.campanhas],['Campanhas ativas',resumo.campanhas_ativas],['Usuários ativos',resumo.usuarios_ativos],['Admins globais',resumo.administradores_globais],['Eleitores',resumo.eleitores],['Eventos em 24h',resumo.eventos_24h]];
  return <div className="p-6 lg:p-8 max-w-7xl mx-auto">
    <h1 className="page-title">Administração da plataforma</h1>
    <p className="page-subtitle mb-6">Campanhas, usuários, permissões e auditoria global.</p>
    {erro&&<AlertBox tipo="erro">{erro}</AlertBox>}
    <div className="flex flex-wrap gap-2 mb-5">{['resumo','usuarios','campanhas','auditoria'].map(item=><button key={item} className={aba===item?'btn-primary':'btn-secondary'} onClick={()=>setAba(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div>

    {aba==='resumo'&&<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{cartoes.map(([rotulo,valor])=><div className="card p-5" key={rotulo}><p className="text-sm text-slate-500">{rotulo}</p><p className="text-3xl font-semibold text-slate-900 mt-1">{valor??'—'}</p></div>)}</div>}

    {aba==='usuarios'&&<><form onSubmit={criar} className="card p-5 grid md:grid-cols-3 gap-3 mb-6">
      <div><label className="label">Nome</label><input className="input" required value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/></div>
      <div><label className="label">E-mail</label><input className="input" type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
      <div><label className="label">Senha inicial</label><input className="input" type="password" required minLength="12" value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})}/></div>
      <div><label className="label">Campanha</label><select className="input" required value={form.campanha_id} onChange={e=>setForm({...form,campanha_id:e.target.value})}>{campanhas.map(c=><option key={c.id} value={c.id}>{c.nome_exibicao||c.nome_candidato}</option>)}</select></div>
      <div><label className="label">Nível</label><select className="input" disabled={form.administrador_global} value={form.administrador_global?'admin':form.nivel} onChange={e=>setForm({...form,nivel:e.target.value})}><option value="admin">Administrador</option><option value="coordenador">Coordenador</option><option value="operador">Operador</option><option value="visualizador">Visualizador</option></select></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.administrador_global} onChange={e=>setForm({...form,administrador_global:e.target.checked})}/> Administrador global</label>
      <button className="btn-primary md:col-span-3">Criar usuário</button>
    </form><div className="card overflow-x-auto"><table className="gov-table"><thead><tr><th>Usuário</th><th>Campanha</th><th>Nível</th><th>Global</th><th>MFA</th><th>Status</th><th>Ações</th></tr></thead><tbody>{usuarios.map(u=><tr key={u.id}><td>{u.nome}<span className="block text-xs text-slate-500">{u.email}</span>{u.proprietario&&<span className="block text-xs text-indigo-600">Responsável</span>}</td><td>{u.nome_exibicao||u.nome_candidato}</td><td><select className="input min-w-36" value={u.nivel} disabled={u.administrador_global} onChange={e=>alterarUsuario(u.id,{nivel:e.target.value})}><option value="admin">Administrador</option><option value="coordenador">Coordenador</option><option value="operador">Operador</option><option value="visualizador">Visualizador</option></select></td><td><input type="checkbox" checked={u.administrador_global} onChange={e=>alterarUsuario(u.id,{administrador_global:e.target.checked})} aria-label="Administrador global"/></td><td>{u.mfa_ativo?'Ativo':'Não'}</td><td>{u.ativo?'Ativo':'Inativo'}</td><td><div className="flex gap-2"><button className="btn-secondary text-xs" onClick={()=>alterarUsuario(u.id,{ativo:!u.ativo})}>{u.ativo?'Desativar':'Reativar'}</button><button className="btn-secondary text-xs text-red-700" disabled={u.proprietario} onClick={()=>removerUsuario(u)}>Remover</button></div></td></tr>)}</tbody></table></div></>}

    {aba==='campanhas'&&<div className="card overflow-x-auto"><table className="gov-table"><thead><tr><th>Campanha</th><th>Local</th><th>Ano</th><th>Usuários</th><th>Status</th></tr></thead><tbody>{campanhas.map(c=><tr key={c.id}><td>{c.nome_exibicao||c.nome_candidato}<span className="block text-xs text-slate-500">{c.tenant_slug}</span></td><td>{[c.municipio,c.uf].filter(Boolean).join(' / ')||'—'}</td><td>{c.ano_eleicao}</td><td>{c.usuarios_ativos}/{c.usuarios}</td><td><select className="input min-w-40" value={c.status} onChange={e=>alterarCampanha(c.id,e.target.value)}><option value="planejamento">Planejamento</option><option value="ativa">Ativa</option><option value="encerrada">Encerrada</option><option value="arquivada">Arquivada</option></select></td></tr>)}</tbody></table></div>}

    {aba==='auditoria'&&<div className="card overflow-x-auto"><table className="gov-table"><thead><tr><th>Data</th><th>Campanha</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>IP</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{new Date(l.criado_em).toLocaleString('pt-BR')}</td><td>{l.nome_exibicao||l.nome_candidato||'Sistema'}</td><td>{l.usuario_nome||'Sistema'}</td><td>{l.acao}</td><td>{l.entidade||'—'}</td><td>{l.ip||'—'}</td></tr>)}</tbody></table></div>}
  </div>;
}
