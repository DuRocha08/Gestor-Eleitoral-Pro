import React,{useState} from 'react';
import { apiRequest } from '../utils/api.js';
import { obterUsuario } from '../utils/authStorage.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

export default function Integracoes(){
 const usuario=obterUsuario();const amplo=['admin','coordenador'].includes(usuario?.nivel);
 const [telefone,setTelefone]=useState('');const [texto,setTexto]=useState('');const [numeros,setNumeros]=useState('');const [resultado,setResultado]=useState(null);const [erro,setErro]=useState('');
 async function chamar(caminho,opcoes){try{setErro('');setResultado(await apiRequest(caminho,opcoes));}catch(e){setErro(e.message);}}
 return <div className="p-6 lg:p-8 max-w-5xl mx-auto"><h1 className="page-title">Integrações</h1><p className="page-subtitle mb-6">WhatsApp e relatórios territoriais.</p>{erro&&<AlertBox tipo="erro">{erro}</AlertBox>}
 <div className="grid lg:grid-cols-2 gap-5"><form className="card p-5 space-y-3" onSubmit={e=>{e.preventDefault();chamar('/integrations/whatsapp/send',{method:'POST',body:JSON.stringify({telefone,texto})});}}><h2 className="card-title">Mensagem individual</h2><div><label className="label">Telefone</label><input className="input" value={telefone} onChange={e=>setTelefone(e.target.value)} required /></div><div><label className="label">Mensagem</label><textarea className="input min-h-28" value={texto} onChange={e=>setTexto(e.target.value)} maxLength="2000" required /></div><button className="btn-primary">Enviar mensagem</button></form>
 <form className="card p-5 space-y-3" onSubmit={e=>{e.preventDefault();chamar('/integrations/whatsapp/bulk',{method:'POST',body:JSON.stringify({numeros:numeros.split(/[,\n]/).map(n=>n.trim()).filter(Boolean),texto})});}}><h2 className="card-title">Disparo em massa</h2><div><label className="label">Números, um por linha</label><textarea className="input min-h-28" value={numeros} onChange={e=>setNumeros(e.target.value)} required /></div><p className="text-xs text-slate-500">Usa a mesma mensagem do quadro ao lado. Máximo de 100 números.</p><button className="btn-primary">Iniciar disparo</button></form></div>
 {amplo&&<div className="card p-5 mt-5"><h2 className="card-title mb-3">Relatórios TSE</h2><button className="btn-secondary" onClick={()=>chamar('/integrations/tse/report')}>Gerar relatório da campanha</button></div>}
 {resultado&&<div className="card p-5 mt-5"><h2 className="card-title mb-3">Resultado</h2><pre className="text-xs overflow-auto bg-slate-50 p-4 rounded max-h-96">{JSON.stringify(resultado,null,2)}</pre></div>}
 </div>;
}
