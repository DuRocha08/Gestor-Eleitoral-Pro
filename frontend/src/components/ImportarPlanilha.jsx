import React, { useState, useRef } from 'react';
import { apiFetch } from '../utils/api.js';
import { useImportPolling } from '../hooks/useImportPolling.js';
import { AlertBox } from './ui/ExecutiveUI.jsx';

const TIPO_INFO = {
  PLANO_CAMPANHA: {
    label: 'Plano de Campanha', icon: '📅', cor: 'text-blue-700',
    bg: 'bg-blue-50', borda: 'border-blue-200',
    descricao: 'Cronograma de 90 dias, metas por fase e configurações da campanha.',
  },
  PESQUISA_VOTO: {
    label: 'Pesquisa de Intenção de Voto', icon: '🗳️', cor: 'text-purple-700',
    bg: 'bg-purple-50', borda: 'border-purple-200',
    descricao: 'Entrevistas, intenção de voto por candidato e temas prioritários.',
  },
  FINANCEIRO: {
    label: 'Financeiro Eleitoral (TSE)', icon: '💰', cor: 'text-emerald-700',
    bg: 'bg-emerald-50', borda: 'border-emerald-200',
    descricao: 'Receitas, despesas e prestação de contas conforme normas do TSE.',
  },
};

const TIPOS_ESPECIAIS = ['PLANO_CAMPANHA', 'PESQUISA_VOTO', 'FINANCEIRO'];
const TIPO_INFO_EXTRA = {
  ELEITORES: { label: 'Planilha de Eleitores', icon: '👥', cor: 'text-teal-700', bg: 'bg-teal-50', borda: 'border-teal-200', descricao: 'Lista de eleitores com nome, CPF, telefone e dados eleitorais.' },
};

function ImportarPlanilha({ aberto, onFechar }) {
  const [tela, setTela] = useState(1);
  const [arquivo, setArquivo] = useState(null);
  const [deteccao, setDeteccao] = useState(null);
  const [detectando, setDetectando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [resultadoEspecial, setResultadoEspecial] = useState(null);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const fecharRef = useRef(null);
  const { statusJob, erroPolling } = useImportPolling(jobId);

  React.useEffect(function() {
    if (!aberto) return;
    const elementoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus();

    function controlarTeclado(evento) {
      if (evento.key === 'Escape') {
        fechar();
        return;
      }
      if (evento.key !== 'Tab' || !dialogRef.current) return;
      const focaveis = dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener('keydown', controlarTeclado);
    return function() {
      document.removeEventListener('keydown', controlarTeclado);
      document.body.style.overflow = overflowAnterior;
      elementoAnterior?.focus?.();
    };
  }, [aberto]);

  React.useEffect(function () {
    if (statusJob && (statusJob.status === 'concluido' || statusJob.status === 'erro')) {
      setTela(4);
    }
    if (statusJob && statusJob.status === 'processando' && tela !== 3) {
      setTela(3);
    }
  }, [statusJob]);

  function validarArquivo(file) {
    if (!file) return 'Nenhum arquivo selecionado.';
    if (!file.name.toLowerCase().endsWith('.xlsx')) return 'Apenas arquivos .xlsx são aceitos.';
    if (file.size > 10 * 1024 * 1024) return 'Arquivo muito grande. Limite: 10MB.';
    return null;
  }

  async function handleArquivo(file) {
    setErro('');
    const erroVal = validarArquivo(file);
    if (erroVal) { setErro(erroVal); return; }
    setArquivo(file);
    setDetectando(true);
    setTela(2);
    try {
      const formData = new FormData();
      formData.append('planilha', file);
      const resposta = await apiFetch('/planilha/detectar', {
        method: 'POST',
        body: formData,
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro || 'Erro ao analisar o arquivo.');
        setDetectando(false);
        return;
      }
      if (!dados.tipo) {
        const primeiraAba = dados.todasAbas?.[0];
        setDeteccao({
          tipo: 'ELEITORES',
          pontuacao: 100,
          abaIdentificada: primeiraAba?.nome || 'Planilha',
          cabecalhosEncontrados: dados.cabecalhosEncontrados || primeiraAba?.cabecalhos || [],
        });
      } else {
        setDeteccao(dados);
      }
    } catch (_) {
      setErro('Falha de conexão ao analisar o arquivo.');
    } finally {
      setDetectando(false);
    }
  }

  async function confirmarImportacao() {
    if (!arquivo || !deteccao) return;
    setErro('');
    setEnviando(true);
    setTela(3);

    const formData = new FormData();
    formData.append('planilha', arquivo);

    try {
      if (TIPOS_ESPECIAIS.includes(deteccao.tipo)) {
        const resposta = await apiFetch('/planilha/importar', {
          method: 'POST',
          body: formData,
        });
        const dados = await resposta.json();
        if (!resposta.ok) {
          setErro(dados.erro || 'Erro ao importar planilha.');
          setTela(2);
          return;
        }
        setResultadoEspecial(dados);
        setTela(4);
        return;
      }

      const mapeamentoAuto = construirMapeamentoAuto(deteccao);
      formData.append('mapeamento', JSON.stringify(mapeamentoAuto));
      const resposta = await apiFetch('/voters/import', {
        method: 'POST',
        body: formData,
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro || 'Erro ao enviar arquivo.');
        setTela(2);
        return;
      }
      setJobId(dados.jobId);

    } catch (_) {
      setErro('Falha de conexão ao enviar arquivo.');
      setTela(2);
    } finally {
      setEnviando(false);
    }
  }

  function construirMapeamentoAuto(result) {
    const mapa = {};
    const cabecalhos = result.cabecalhosEncontrados || [];
    const sinonimos = {
      nome: 'nome', 'nome completo': 'nome', eleitor: 'nome', name: 'nome', cpf: 'cpf', documento: 'cpf',
      'cpf do eleitor': 'cpf', 'numero do cpf': 'cpf', 'numero cpf': 'cpf', 'n cpf': 'cpf',
      titulo: 'titulo_eleitor', 'titulo eleitor': 'titulo_eleitor', 'titulo eleitoral': 'titulo_eleitor', 'numero titulo': 'titulo_eleitor',
      nascimento: 'data_nascimento', 'data nascimento': 'data_nascimento', 'data de nascimento': 'data_nascimento',
      telefone: 'telefone', fone: 'telefone', contato: 'telefone', whatsapp: 'whatsapp', celular: 'whatsapp',
      email: 'email', 'e mail': 'email', endereco: 'endereco', logradouro: 'endereco', rua: 'endereco',
      bairro: 'bairro', cidade: 'cidade', municipio: 'cidade', uf: 'uf', estado: 'uf', cep: 'cep',
      zona: 'zona_eleitoral', 'zona eleitoral': 'zona_eleitoral', secao: 'secao_eleitoral', 'secao eleitoral': 'secao_eleitoral',
      observacoes: 'observacoes', observacao: 'observacoes', notas: 'observacoes',
    };
    cabecalhos.forEach(function (cab) {
      const norm = cab.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[_-]+/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      const campo = sinonimos[norm];
      if (campo && !Object.values(mapa).includes(campo)) mapa[cab] = campo;
    });
    if (!Object.values(mapa).includes('nome') && cabecalhos.length > 0) {
      mapa[cabecalhos[0]] = 'nome';
    }
    if (!Object.values(mapa).includes('nome')) {
      ['nome','cpf','telefone','whatsapp','email','endereco','bairro','cidade','uf','zona_eleitoral','secao_eleitoral','observacoes'].forEach(function(c) { mapa[c] = c; });
    }
    return mapa;
  }

  function onDragOver(e) { e.preventDefault(); setArrastando(true); }
  function onDragLeave() { setArrastando(false); }
  function onDrop(e) {
    e.preventDefault(); setArrastando(false);
    const file = e.dataTransfer.files[0];
    if (file) handleArquivo(file);
  }
  function onInputChange(e) {
    const file = e.target.files[0];
    if (file) handleArquivo(file);
    e.target.value = '';
  }
  function voltarParaUpload() {
    setTela(1);
    setArquivo(null);
    setDeteccao(null);
    setJobId(null);
    setResultadoEspecial(null);
    setErro('');
    setEnviando(false);
  }
  function fechar() {
    setTela(1); setArquivo(null); setDeteccao(null);
    setJobId(null); setResultadoEspecial(null); setErro(''); setEnviando(false);
    onFechar();
  }

  if (!aberto) return null;

  const progresso = statusJob ? statusJob.progress : 0;
  const tipoInfo = deteccao?.tipo ? (TIPO_INFO[deteccao.tipo] || TIPO_INFO_EXTRA[deteccao.tipo]) : null;
  const ehEspecial = deteccao?.tipo && TIPOS_ESPECIAIS.includes(deteccao.tipo);
  const importacaoFalhou = statusJob?.status === 'erro';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={function (e) { if (e.target === e.currentTarget) fechar(); }}
      role="dialog" aria-modal="true" aria-labelledby="modal-import-titulo" aria-describedby="modal-import-descricao"
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 id="modal-import-titulo" className="text-base font-semibold text-slate-900">
              Importar planilha eleitoral
            </h2>
            <p id="modal-import-descricao" className="text-xs text-slate-500 mt-0.5">
              Detecção automática do tipo · apenas .xlsx · máximo 10MB
            </p>
          </div>
          <button ref={fecharRef} type="button" onClick={fechar}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none ml-4" aria-label="Fechar modal">
            ✕
          </button>
        </div>

        <div className="flex items-center px-6 pt-5 pb-2 gap-0">
          {['Arquivo', 'Detecção', 'Processando', 'Relatório'].map(function (label, idx) {
            const num = idx + 1;
            const concluida = tela > num;
            const ativa = tela === num;
            return (
              <React.Fragment key={label}>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ' +
                    (concluida ? 'bg-green-500 text-white' : ativa ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500')
                  }>
                    {concluida ? '✓' : num}
                  </div>
                  <span className={
                    'text-[10px] mt-1 font-medium uppercase tracking-wide ' +
                    (ativa ? 'text-slate-800' : concluida ? 'text-green-600' : 'text-slate-400')
                  }>{label}</span>
                </div>
                {idx < 3 && (
                  <div className={'flex-1 h-0.5 mx-1 mb-4 ' + (tela > num ? 'bg-green-400' : 'bg-slate-200')} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="px-6 pb-6 pt-2">

          {tela === 1 && (
            <div>
              {erro && <AlertBox tipo="erro">{erro}</AlertBox>}
              <div
                className={'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ' +
                  (arrastando ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400')}
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onClick={function () { inputRef.current?.click(); }}
                role="button" tabIndex={0}
                onKeyDown={function (e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
              >
                <div className="text-3xl mb-2">📊</div>
                <p className="text-sm font-semibold text-slate-700">
                  {arrastando ? 'Solte o arquivo aqui!' : 'Clique para selecionar ou arraste o arquivo aqui'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Plano de Campanha · Pesquisa de Voto · Financeiro TSE · Máx: 10MB</p>
                <p className="text-xs text-teal-600 font-medium mt-2">✨ O sistema identifica o tipo automaticamente</p>
                <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={onInputChange} />
              </div>
            </div>
          )}

          {tela === 2 && (
            <div>
              {detectando && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-sm font-semibold text-slate-700">Analisando cabeçalhos das abas...</p>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-4 mx-auto max-w-xs">
                    <div className="h-full bg-teal-500 rounded-full animate-pulse w-2/3" />
                  </div>
                </div>
              )}
              {!detectando && erro && (
                <div>
                  <AlertBox tipo="erro">{erro}</AlertBox>
                  <button type="button" className="mt-4 text-xs text-teal-600 hover:underline font-medium" onClick={voltarParaUpload}>
                    ← Escolher outro arquivo
                  </button>
                </div>
              )}
              {!detectando && !erro && deteccao && tipoInfo && (
                <div>
                  <div className={'rounded-lg border p-4 mb-4 ' + tipoInfo.bg + ' ' + tipoInfo.borda}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{tipoInfo.icon}</span>
                      <div>
                        <p className={'text-sm font-bold ' + tipoInfo.cor}>{tipoInfo.label}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{tipoInfo.descricao}</p>
                        <p className="text-xs text-slate-400 mt-1">Confiança: {deteccao.pontuacao}% · Aba: "{deteccao.abaIdentificada}"</p>
                      </div>
                    </div>
                  </div>

                  {ehEspecial && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
                      ℹ️ Esta planilha será salva no banco para visualização e relatórios.
                    </div>
                  )}

                  <div className="flex gap-3 mt-4">
                    <button type="button" onClick={voltarParaUpload}
                      className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                      ← Trocar arquivo
                    </button>
                    <button type="button" onClick={confirmarImportacao} disabled={enviando}
                      className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                      {enviando ? 'Enviando...' : '✓ Confirmar importação'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tela === 3 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">⏳</div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Processando arquivo em segundo plano...</p>
              <p className="text-xs text-slate-500 mb-4">Você pode fechar esta janela — o processamento continuará no servidor.</p>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: progresso + '%' }} />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{statusJob ? statusJob.inseridos + ' inseridos' : 'Aguardando...'}</span>
                <span>{progresso}%</span>
              </div>
              {erroPolling && <AlertBox tipo="erro" className="mt-4">{erroPolling}</AlertBox>}
            </div>
          )}

          {tela === 4 && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">{importacaoFalhou ? '⚠️' : '✅'}</div>
              <p className={
                'text-lg font-bold mb-1 ' + (importacaoFalhou ? 'text-red-700' : 'text-green-700')
              }>
                {importacaoFalhou ? 'Importação não concluída' : 'Importação concluída!'}
              </p>

              {importacaoFalhou && (
                <AlertBox tipo="erro">
                  {statusJob?.erro_fatal || 'Não foi possível processar o arquivo enviado.'}
                </AlertBox>
              )}

              {resultadoEspecial && (
                <div>
                  <p className="text-sm text-slate-600 mb-4">{resultadoEspecial.mensagem}</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {Object.entries(resultadoEspecial.totais || {}).map(([k, v]) => (
                      <div key={k} className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-slate-800">{v}</p>
                        <p className="text-xs text-slate-500 mt-1">{k.replace(/_/g, ' ')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {statusJob && !importacaoFalhou && (
                <div>
                  <p className="text-sm text-slate-600 mb-4">{statusJob.total} linhas processadas</p>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{statusJob.inseridos}</p>
                      <p className="text-xs text-slate-500 mt-1">Inseridos</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-600">{statusJob.duplicados}</p>
                      <p className="text-xs text-slate-500 mt-1">Duplicados (CPF)</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-red-600">{statusJob.total_erros}</p>
                      <p className="text-xs text-slate-500 mt-1">Erros</p>
                    </div>
                  </div>
                  {statusJob.erros?.length > 0 && (
                    <div className="text-left">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Linhas com erro ({statusJob.total_erros}):</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {statusJob.erros.map(function (e, i) {
                          return (
                            <div key={i} className="text-xs bg-red-50 border border-red-100 rounded px-3 py-1.5">
                              <span className="font-semibold text-red-600">Linha {e.linha}</span> {e.erro}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={voltarParaUpload}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                  Importar outra
                </button>
                <button type="button" onClick={fechar}
                  className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700">
                  ✓ Concluir
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default ImportarPlanilha;
