import React, { useCallback, useEffect, useState } from 'react';
import { apiPost, apiRequest } from '../utils/api.js';
import { obterUsuario } from '../utils/authStorage.js';
import { AlertBox } from '../components/ui/ExecutiveUI.jsx';

const TIPOS = [
  ['unica', 'Unica escolha'],
  ['multipla', 'Multipla escolha'],
  ['sim_nao', 'Sim/Nao'],
  ['escala', 'Escala'],
  ['numero', 'Numero'],
  ['texto', 'Aberta'],
];

const RESPOSTA_INICIAL = {
  idade: '', genero: '', renda: '', escolaridade: '', religiao: '', ocupacao: '',
  bairro: '', cidade: '', regiao_administrativa: '', zona_eleitoral: '', secao_eleitoral: '',
  intencao_voto: '', segunda_opcao: '', rejeicao: '', avaliacao_governo: '',
  problemas_prioritarios: '', conhece_candidato: false, interesse_voluntario: false,
};

function Barra({ nome, total, base }) {
  const pct = base > 0 ? Math.round((total / base) * 100) : 0;
  return <div className="mb-2"><div className="flex justify-between text-xs mb-1"><span>{nome}</span><span>{total} ({pct}%)</span></div><div className="h-2 bg-slate-100 rounded-sm overflow-hidden"><div className="h-full bg-indigo-600" style={{ width: pct + '%' }} /></div></div>;
}

export default function Pesquisas() {
  const usuario = obterUsuario();
  const podeEditar = usuario?.nivel !== 'visualizador';
  const [questionarios, setQuestionarios] = useState([]);
  const [selecionado, setSelecionado] = useState('');
  const [estat, setEstat] = useState(null);
  const [origens, setOrigens] = useState([]);
  const [respostas, setRespostas] = useState([]);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [formQ, setFormQ] = useState({ titulo: '', descricao: '', perguntas: [{ texto: 'Intencao de voto', tipo: 'unica' }] });
  const [origem, setOrigem] = useState({ nome: '', tipo: 'pagina_local', ra: '', cidade: '' });
  const [resp, setResp] = useState(RESPOSTA_INICIAL);

  const carregar = useCallback(async function() {
    try {
      const dados = await apiRequest('/surveys/questionarios');
      setQuestionarios(dados.dados || []);
      if (!selecionado && dados.dados?.[0]) setSelecionado(dados.dados[0].id);
      setErro('');
    } catch (e) { setErro(e.message); }
  }, [selecionado]);

  const carregarEstat = useCallback(async function() {
    if (!selecionado) return;
    try {
      const dados = await apiRequest('/surveys/questionarios/' + selecionado + '/estatisticas');
      setEstat(dados);
      const listaOrigens = await apiRequest('/surveys/questionarios/' + selecionado + '/origens');
      setOrigens(listaOrigens.dados || []);
      const listaRespostas = await apiRequest('/surveys/questionarios/' + selecionado + '/respostas');
      setRespostas(listaRespostas.dados || []);
    } catch (e) { setErro(e.message); }
  }, [selecionado]);

  useEffect(function() { carregar(); }, [carregar]);
  useEffect(function() { carregarEstat(); }, [carregarEstat]);

  function alterarPergunta(i, campo, valor) {
    const perguntas = formQ.perguntas.slice();
    perguntas[i] = { ...perguntas[i], [campo]: valor };
    setFormQ({ ...formQ, perguntas });
  }

  async function criarQuestionario(e) {
    e.preventDefault();
    try {
      const criado = await apiPost('/surveys/questionarios', formQ);
      setSelecionado(criado.questionario.id);
      setFormQ({ titulo: '', descricao: '', perguntas: [{ texto: 'Intencao de voto', tipo: 'unica' }] });
      carregar();
    } catch (err) { setErro(err.message); }
  }

  async function salvarResposta(e) {
    e.preventDefault();
    try {
      await apiPost('/surveys/questionarios/' + selecionado + '/respostas', resp);
      setResp(RESPOSTA_INICIAL);
      carregarEstat();
    } catch (err) { setErro(err.message); }
  }

  async function criarOrigem(e) {
    e.preventDefault();
    try {
      await apiPost('/surveys/questionarios/' + selecionado + '/origens', origem);
      setOrigem({ nome: '', tipo: 'pagina_local', ra: '', cidade: '' });
      carregarEstat();
    } catch (err) { setErro(err.message); }
  }

  async function copiarLink() {
    if (!linkPublico) return;
    await navigator.clipboard.writeText(linkPublico);
    setCopiado(true);
    setTimeout(function() { setCopiado(false); }, 2000);
  }

  const selecionadoObj = questionarios.find(q => q.id === selecionado);
  const linkPublico = selecionadoObj ? window.location.origin + '/pesquisa-publica/' + selecionadoObj.slug : '';

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-6"><p className="section-eyebrow mb-1">Pesquisa politica</p><h1 className="page-title">Questionarios e entrevistas</h1><p className="page-subtitle">Intencao de voto, rejeicao, dados demograficos e comparativos regionais.</p></header>
      {erro && <AlertBox tipo="erro">{erro}</AlertBox>}

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {podeEditar && <form onSubmit={criarQuestionario} className="card p-5 lg:col-span-1"><p className="card-title mb-3">Novo questionario</p><label className="label">Titulo</label><input className="input mb-3" value={formQ.titulo} onChange={e => setFormQ({ ...formQ, titulo: e.target.value })} required /><label className="label">Descricao</label><textarea className="input mb-3" value={formQ.descricao} onChange={e => setFormQ({ ...formQ, descricao: e.target.value })} />{formQ.perguntas.map((p, i) => <div key={i} className="grid grid-cols-2 gap-2 mb-2"><input className="input" value={p.texto} onChange={e => alterarPergunta(i, 'texto', e.target.value)} placeholder="Pergunta" /><select className="input" value={p.tipo} onChange={e => alterarPergunta(i, 'tipo', e.target.value)}>{TIPOS.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select><input className="input col-span-2" value={(p.opcoes || []).join(', ')} onChange={e => alterarPergunta(i, 'opcoes', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} placeholder="Opcoes separadas por virgula" /></div>)}<button type="button" className="btn-secondary mb-3" onClick={() => setFormQ({ ...formQ, perguntas: formQ.perguntas.concat([{ texto: '', tipo: 'texto', opcoes: [] }]) })}>Adicionar pergunta</button><button className="btn-primary w-full">Salvar questionario</button></form>}

        <div className="card p-5 lg:col-span-2">
          <label className="label">Questionario</label><select className="input mb-3" value={selecionado} onChange={e => setSelecionado(e.target.value)}>{questionarios.map(q => <option key={q.id} value={q.id}>{q.titulo}</option>)}</select>
          {linkPublico && <div className="alert-warning mb-4"><p className="mb-2">{estat?.aviso_legal}</p><p className="text-xs break-all">Link publico: {linkPublico}</p><div className="flex flex-wrap gap-2 mt-3"><button type="button" className="btn-secondary" onClick={copiarLink}>{copiado ? 'Copiado' : 'Copiar link'}</button><a className="btn-secondary" href={'https://api.whatsapp.com/send?text=' + encodeURIComponent('Participe da consulta popular: ' + linkPublico)} target="_blank" rel="noreferrer">Compartilhar no WhatsApp</a></div></div>}
          {!estat ? <p className="text-sm text-slate-400">Selecione ou crie um questionario.</p> : <><div className="grid grid-cols-3 gap-3 mb-5"><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-400">Entrevistas</p><p className="text-2xl font-bold">{estat.total}</p></div><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-400">Conhecem candidato</p><p className="text-2xl font-bold">{estat.indicadores?.conhecem || 0}</p></div><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-400">Voluntarios</p><p className="text-2xl font-bold">{estat.indicadores?.voluntarios || 0}</p></div></div><div className="grid md:grid-cols-2 gap-6"><div><p className="card-title mb-3">Intencao de voto</p>{(estat.intencao || []).map(x => <Barra key={x.nome} nome={x.nome} total={x.total} base={estat.total} />)}</div><div><p className="card-title mb-3">Rejeicao</p>{(estat.rejeicao || []).map(x => <Barra key={x.nome} nome={x.nome} total={x.total} base={estat.total} />)}</div></div><p className="card-title mt-5 mb-3">Relatorio regional</p><div className="overflow-x-auto"><table className="gov-table"><tbody>{(estat.regional || []).map(r => <tr key={r.regiao}><td>{r.regiao}</td><td>{r.total} entrevistas</td><td>{r.voluntarios} voluntarios</td></tr>)}</tbody></table></div></>}
        </div>
      </div>

      {selecionado && <div className="card p-5 mb-6">
        <p className="card-title mb-3">Respostas recebidas</p>
        {respostas.length === 0 ? <p className="text-sm text-slate-400">Nenhuma resposta recebida ainda.</p> : <div className="overflow-x-auto"><table className="gov-table"><thead><tr><th>Data</th><th>Local</th><th>Intencao</th><th>Rejeicao</th><th>Respostas</th></tr></thead><tbody>{respostas.map(r => <tr key={r.id}><td>{new Date(r.created_at).toLocaleString('pt-BR')}</td><td>{[r.bairro, r.cidade, r.regiao_administrativa].filter(Boolean).join(' / ') || '-'}</td><td>{r.intencao_voto || '-'}</td><td>{r.rejeicao || '-'}</td><td>{Object.entries(r.respostas || {}).map(([k, v]) => <span className="block text-xs" key={k}>{k}: {Array.isArray(v) ? v.join(', ') : String(v)}</span>)}</td></tr>)}</tbody></table></div>}
      </div>}

      {podeEditar && selecionado && <form onSubmit={criarOrigem} className="card p-5 grid md:grid-cols-5 gap-3 mb-6"><p className="card-title md:col-span-5">Origem de divulgacao</p><input className="input" placeholder="Pagina/parceiro" value={origem.nome} onChange={e => setOrigem({ ...origem, nome: e.target.value })} /><input className="input" placeholder="Tipo" value={origem.tipo} onChange={e => setOrigem({ ...origem, tipo: e.target.value })} /><input className="input" placeholder="RA" value={origem.ra} onChange={e => setOrigem({ ...origem, ra: e.target.value })} /><input className="input" placeholder="Cidade" value={origem.cidade} onChange={e => setOrigem({ ...origem, cidade: e.target.value })} /><button className="btn-secondary">Gerar origem</button>{origens.length > 0 && <div className="md:col-span-5 text-xs text-slate-500">{origens.map(o => <p key={o.id}>{o.nome} - {o.ra || '-'} - {o.link_gerado}</p>)}</div>}</form>}

      {podeEditar && selecionado && <form onSubmit={salvarResposta} className="card p-5 grid md:grid-cols-4 gap-3"><p className="card-title md:col-span-4">Registrar entrevista</p><input className="input" placeholder="Idade" type="number" value={resp.idade} onChange={e => setResp({ ...resp, idade: e.target.value })} /><input className="input" placeholder="Genero" value={resp.genero} onChange={e => setResp({ ...resp, genero: e.target.value })} /><input className="input" placeholder="Renda" value={resp.renda} onChange={e => setResp({ ...resp, renda: e.target.value })} /><input className="input" placeholder="Escolaridade" value={resp.escolaridade} onChange={e => setResp({ ...resp, escolaridade: e.target.value })} /><input className="input" placeholder="Religiao" value={resp.religiao} onChange={e => setResp({ ...resp, religiao: e.target.value })} /><input className="input" placeholder="Ocupacao" value={resp.ocupacao} onChange={e => setResp({ ...resp, ocupacao: e.target.value })} /><input className="input" placeholder="Bairro" value={resp.bairro} onChange={e => setResp({ ...resp, bairro: e.target.value })} /><input className="input" placeholder="Cidade" value={resp.cidade} onChange={e => setResp({ ...resp, cidade: e.target.value })} /><input className="input" placeholder="RA" value={resp.regiao_administrativa} onChange={e => setResp({ ...resp, regiao_administrativa: e.target.value })} /><input className="input" placeholder="Zona" value={resp.zona_eleitoral} onChange={e => setResp({ ...resp, zona_eleitoral: e.target.value })} /><input className="input" placeholder="Secao" value={resp.secao_eleitoral} onChange={e => setResp({ ...resp, secao_eleitoral: e.target.value })} /><input className="input" placeholder="Intencao de voto" value={resp.intencao_voto} onChange={e => setResp({ ...resp, intencao_voto: e.target.value })} /><input className="input" placeholder="Segunda opcao" value={resp.segunda_opcao} onChange={e => setResp({ ...resp, segunda_opcao: e.target.value })} /><input className="input" placeholder="Rejeicao" value={resp.rejeicao} onChange={e => setResp({ ...resp, rejeicao: e.target.value })} /><input className="input" placeholder="Avaliacao do governo" value={resp.avaliacao_governo} onChange={e => setResp({ ...resp, avaliacao_governo: e.target.value })} /><input className="input" placeholder="Problemas prioritarios" value={resp.problemas_prioritarios} onChange={e => setResp({ ...resp, problemas_prioritarios: e.target.value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resp.conhece_candidato} onChange={e => setResp({ ...resp, conhece_candidato: e.target.checked })} /> Conhece candidato</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resp.interesse_voluntario} onChange={e => setResp({ ...resp, interesse_voluntario: e.target.checked })} /> Quer ser voluntario</label><div className="md:col-span-4 flex justify-end"><button className="btn-primary">Salvar entrevista</button></div></form>}
    </div>
  );
}
