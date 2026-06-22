import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiPost } from '../utils/api.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [linkDev, setLinkDev] = useState('');
  const [carregando, setCarregando] = useState(false);
  async function enviar(e) {
    e.preventDefault(); setCarregando(true); setMensagem('');
    try {
      const dados = await apiPost('/auth/password/forgot', { email });
      setMensagem(dados.mensagem);
      if (dados.token_desenvolvimento) setLinkDev(`/reset-password?token=${encodeURIComponent(dados.token_desenvolvimento)}`);
    } catch (err) { setMensagem(err.message); }
    finally { setCarregando(false); }
  }
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <div className="card p-8 w-full max-w-md">
      <h1 className="page-title">Recuperar senha</h1>
      <p className="page-subtitle mb-5">Enviaremos um link de uso único, válido por 30 minutos.</p>
      {mensagem && <AlertBox tipo="sucesso">{mensagem}</AlertBox>}
      {linkDev && <Link className="btn-secondary block text-center mb-4" to={linkDev}>Abrir link local de recuperação</Link>}
      <form onSubmit={enviar} className="space-y-4">
        <div><label className="label" htmlFor="emailRecuperacao">E-mail</label>
          <input id="emailRecuperacao" type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <button className="btn-primary w-full" disabled={carregando}>{carregando ? 'Enviando...' : 'Enviar instruções'}</button>
      </form>
      <Link to="/login" className="block text-center text-sm text-indigo-600 mt-5">Voltar ao login</Link>
    </div>
  </div>;
}
