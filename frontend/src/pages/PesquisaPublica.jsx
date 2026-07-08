import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../config/appConfig.js';

const INICIAL = { anonimo: true, idade: '', genero: '', escolaridade: '', renda: '', religiao: '', ocupacao: '', cidade: '', bairro: '', regiao_administrativa: '', intencao_voto: '', segunda_opcao: '', rejeicao: '', avaliacao_governo: '', problemas_prioritarios: '', probabilidade_voto: '', interesse_voluntario: false };

export default function PesquisaPublica() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [questionario, setQuestionario] = useState(null);
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState({ ...INICIAL, origem_resposta: params.get('origem') || 'link_publico', link_usado: window.location.href });
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(function() {
    fetch(API_BASE + '/surveys/public/' + slug).then(r => r.json()).then(d => {
      if (d.erro) setErro(d.erro);
      else { setQuestionario(d.questionario); setAviso(d.aviso_legal); }
    }).catch(() => setErro('Nao foi possivel carregar a pesquisa.'));
  }, [slug]);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    const resp = await fetch(API_BASE + '/surveys/public/' + slug + '/respostas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) return setErro(dados.erro || 'Nao foi possivel enviar.');
    setOk(true);
  }

  if (ok) return <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center"><div className="card p-8 max-w-lg text-center"><h1 className="page-title">Resposta enviada</h1><p className="page-subtitle">Obrigado por participar desta consulta popular.</p></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <main className="max-w-3xl mx-auto card p-6">
        <h1 className="page-title">{questionario?.titulo || 'Consulta popular'}</h1>
        <p className="page-subtitle mb-4">{questionario?.descricao}</p>
        {aviso && <div className="alert-warning mb-5">{aviso}</div>}
        {erro && <div className="alert-error mb-5">{erro}</div>}
        {questionario && <form onSubmit={enviar} className="grid md:grid-cols-2 gap-3"><input className="input" placeholder="Idade" type="number" value={form.idade} onChange={e => setForm({ ...form, idade: e.target.value })} /><input className="input" placeholder="Genero" value={form.genero} onChange={e => setForm({ ...form, genero: e.target.value })} /><input className="input" placeholder="Escolaridade" value={form.escolaridade} onChange={e => setForm({ ...form, escolaridade: e.target.value })} /><input className="input" placeholder="Renda" value={form.renda} onChange={e => setForm({ ...form, renda: e.target.value })} /><input className="input" placeholder="Religiao" value={form.religiao} onChange={e => setForm({ ...form, religiao: e.target.value })} /><input className="input" placeholder="Ocupacao" value={form.ocupacao} onChange={e => setForm({ ...form, ocupacao: e.target.value })} /><input className="input" placeholder="Cidade" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /><input className="input" placeholder="Bairro" value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} /><input className="input" placeholder="RA" value={form.regiao_administrativa} onChange={e => setForm({ ...form, regiao_administrativa: e.target.value, ra_divulgacao: e.target.value })} /><input className="input" placeholder="Intencao de voto" value={form.intencao_voto} onChange={e => setForm({ ...form, intencao_voto: e.target.value })} /><input className="input" placeholder="Segunda opcao" value={form.segunda_opcao} onChange={e => setForm({ ...form, segunda_opcao: e.target.value })} /><input className="input" placeholder="Candidato rejeitado" value={form.rejeicao} onChange={e => setForm({ ...form, rejeicao: e.target.value })} /><input className="input" placeholder="Avaliacao do governo" value={form.avaliacao_governo} onChange={e => setForm({ ...form, avaliacao_governo: e.target.value })} /><input className="input" placeholder="Probabilidade de votar (0 a 10)" type="number" min="0" max="10" value={form.probabilidade_voto} onChange={e => setForm({ ...form, probabilidade_voto: e.target.value })} /><textarea className="input md:col-span-2" placeholder="Problemas prioritarios da sua regiao" value={form.problemas_prioritarios} onChange={e => setForm({ ...form, problemas_prioritarios: e.target.value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.interesse_voluntario} onChange={e => setForm({ ...form, interesse_voluntario: e.target.checked })} /> Tenho interesse em ajudar como voluntario</label><div className="md:col-span-2 flex justify-end"><button className="btn-primary">Enviar resposta</button></div></form>}
      </main>
    </div>
  );
}
