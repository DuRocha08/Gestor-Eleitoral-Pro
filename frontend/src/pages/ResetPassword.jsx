import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiPost } from '../utils/api.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  async function salvar(e) {
    e.preventDefault(); setErro('');
    if (senha !== confirmacao) return setErro('As senhas não conferem.');
    try { const d = await apiPost('/auth/password/reset', { token: params.get('token'), senha }); setSucesso(d.mensagem); }
    catch (err) { setErro(err.message); }
  }
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="card p-8 w-full max-w-md">
    <h1 className="page-title">Definir nova senha</h1>
    <p className="page-subtitle mb-5">Use 12 ou mais caracteres com letras, número e símbolo.</p>
    {erro && <AlertBox tipo="erro">{erro}</AlertBox>}{sucesso && <AlertBox tipo="sucesso">{sucesso}</AlertBox>}
    {!sucesso && <form onSubmit={salvar} className="space-y-4">
      <div><label className="label" htmlFor="novaSenha">Nova senha</label><input id="novaSenha" type="password" className="input" value={senha} onChange={e=>setSenha(e.target.value)} required /></div>
      <div><label className="label" htmlFor="confirmarNovaSenha">Confirmar senha</label><input id="confirmarNovaSenha" type="password" className="input" value={confirmacao} onChange={e=>setConfirmacao(e.target.value)} required /></div>
      <button className="btn-primary w-full">Redefinir senha</button>
    </form>}
    <Link to="/login" className="block text-center text-sm text-indigo-600 mt-5">Ir para o login</Link>
  </div></div>;
}
