import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api.js';
import { limparSessao } from '../utils/authStorage.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

export default function Security() {
  const navigate = useNavigate();
  const [ativo, setAtivo] = useState(false);
  const [senha, setSenha] = useState('');
  const [segredo, setSegredo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [reservas, setReservas] = useState([]);
  const [erro, setErro] = useState('');
  useEffect(function() { apiRequest('/auth/mfa').then(d => setAtivo(d.ativo)).catch(e => setErro(e.message)); }, []);
  async function iniciar() { try { const d=await apiRequest('/auth/mfa/setup',{method:'POST',body:JSON.stringify({senha})});setSegredo(d.segredo);setErro(''); } catch(e){setErro(e.message);} }
  async function confirmar() { try { const d=await apiRequest('/auth/mfa/confirm',{method:'POST',body:JSON.stringify({senha,segredo,codigo})});setReservas(d.codigos_reserva);setAtivo(true); } catch(e){setErro(e.message);} }
  async function desativar() { try { await apiRequest('/auth/mfa',{method:'DELETE',body:JSON.stringify({senha,codigo})});limparSessao();navigate('/login',{replace:true}); } catch(e){setErro(e.message);} }
  function sairDepoisDeAtivar() { limparSessao(); navigate('/login',{replace:true}); }
  return <div className="p-6 lg:p-8 max-w-3xl mx-auto"><h1 className="page-title">Segurança da conta</h1><p className="page-subtitle mb-6">Autenticação em dois fatores com aplicativo TOTP.</p>
    {erro && <AlertBox tipo="erro">{erro}</AlertBox>}
    <div className="card p-6 space-y-4"><p className="font-semibold">MFA: {ativo ? 'Ativo' : 'Desativado'}</p>
      {reservas.length > 0 ? <div><AlertBox tipo="sucesso">MFA ativado. Guarde estes códigos em local seguro; eles não serão exibidos novamente.</AlertBox><div className="grid grid-cols-2 gap-2 font-mono">{reservas.map(c=><code key={c}>{c}</code>)}</div><button className="btn-primary mt-4" onClick={sairDepoisDeAtivar}>Entrar novamente</button></div> : <>
      <div><label className="label">Senha atual</label><input type="password" className="input" value={senha} onChange={e=>setSenha(e.target.value)} /></div>
      {!ativo && !segredo && <button className="btn-primary" onClick={iniciar}>Configurar MFA</button>}
      {!ativo && segredo && <><p className="text-sm">No aplicativo autenticador, escolha adicionar chave manual e informe:</p><code className="block p-3 bg-slate-100 rounded break-all">{segredo}</code><div><label className="label">Código de 6 dígitos</label><input className="input" value={codigo} onChange={e=>setCodigo(e.target.value)} inputMode="numeric" /></div><button className="btn-primary" onClick={confirmar}>Confirmar e ativar</button></>}
      {ativo && <><div><label className="label">Código atual</label><input className="input" value={codigo} onChange={e=>setCodigo(e.target.value)} inputMode="numeric" /></div><button className="btn-secondary text-red-700" onClick={desativar}>Desativar MFA</button></>}
      </>}
    </div>
  </div>;
}
