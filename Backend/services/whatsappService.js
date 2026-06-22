// serviço de integração com WhatsApp via Evolution API
const axios = require('axios');
const { query } = require('../config/db');

// configurações da Evolution API — tudo vem do .env
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_INSTANCE = process.env.EVOLUTION_API_INSTANCE || 'gestor-eleitoral';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

// modo simulação: quando true não faz chamada real pra API — útil pra testar
const SIMULATION_MODE = process.env.WHATSAPP_SIMULATION_MODE !== 'false';

// delay entre envios no disparo em massa — evita rate limit
const BULK_DELAY_MS = parseInt(process.env.WHATSAPP_BULK_DELAY_MS, 10) || 500;

function montarUrlEvolution() {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(EVOLUTION_API_INSTANCE)) {
    throw new Error('EVOLUTION_API_INSTANCE possui formato invalido.');
  }
  const base = new URL(EVOLUTION_API_URL);
  base.pathname = base.pathname.replace(/\/$/, '') + '/message/sendText/' +
    encodeURIComponent(EVOLUTION_API_INSTANCE);
  base.search = '';
  base.hash = '';
  return base.toString();
}

// normaliza o telefone pro formato internacional com DDI 55
function normalizarTelefone(numero) {
  // tiro tudo que não é número — parênteses, traços, espaços etc
  const apenasDigitos = String(numero).replace(/\D/g, '');

  // se já começa com 55 (Brasil) não precisa adicionar
  if (apenasDigitos.startsWith('55')) {
    return apenasDigitos;
  }

  // telefone brasileiro tem 10 (fixo) ou 11 (celular) dígitos com DDD
  if (apenasDigitos.length === 10 || apenasDigitos.length === 11) {
    return `55${apenasDigitos}`;
  }

  return apenasDigitos;
}

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// faz o envio de fato via Evolution API (ou simula se SIMULATION_MODE = true)
async function enviarViaEvolutionAPI(telefone, texto) {
  const url = montarUrlEvolution();

  const corpo = {
    number: telefone,
    text: texto,
  };

  // se modo simulação ativo, retorno uma resposta falsa sem chamar a API
  if (SIMULATION_MODE) {
    const idSimulado = `sim_${Date.now()}_${telefone}`;
    return {
      simulado: true,
      status: 'enviada',
      id_externo: idSimulado,
      telefone_destino: telefone,
      mensagem: 'Envio simulado com sucesso (WHATSAPP_SIMULATION_MODE=true)',
    };
  }

  // faz o POST pra Evolution API com timeout de 15 segundos
  const resposta = await axios.post(url, corpo, {
    timeout: 15000,
    maxRedirects: 0,
    proxy: false,
    maxContentLength: 1024 * 1024,
    maxBodyLength: 64 * 1024,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    },
  });

  return {
    simulado: false,
    status: 'enviada',
    id_externo: String(resposta.data?.key?.id || resposta.data?.messageId || '').slice(0, 100) || null,
  };
}

// salva o registro da mensagem no banco pra ter histórico
async function registrarMensagemNoBanco(dados) {
  const resultado = await query(
    `INSERT INTO mensagens_whatsapp (
       campanha_id, eleitor_id, apoiador_id, enviado_por,
       telefone_destino, conteudo, status_envio, id_externo, enviado_em
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [
      dados.campanha_id,
      dados.eleitor_id || null,
      dados.apoiador_id || null,
      dados.enviado_por || null,
      dados.telefone_destino,
      dados.conteudo,
      dados.status_envio,
      dados.id_externo || null,
    ]
  );

  return resultado.rows[0];
}

// envia mensagem pra um único número
async function enviarMensagemIndividual(telefone, texto, metadados = {}) {
  const telefoneNormalizado = normalizarTelefone(telefone);

  // valida o intervalo aceito pelo padrão internacional E.164
  if (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 15) {
    const erro = new Error('Numero de telefone invalido.');
    erro.status = 400;
    throw erro;
  }

  if (!texto || !String(texto).trim()) {
    const erro = new Error('O texto da mensagem e obrigatorio.');
    erro.status = 400;
    throw erro;
  }

  if (String(texto).trim().length > 2000) {
    const erro = new Error('A mensagem deve ter no maximo 2000 caracteres.');
    erro.status = 400;
    throw erro;
  }

  try {
    // tenta enviar via Evolution API (ou simula)
    const resultadoEnvio = await enviarViaEvolutionAPI(telefoneNormalizado, texto.trim());

    // salva o registro no banco independente de ser simulado ou real
    const mensagemSalva = await registrarMensagemNoBanco({
      campanha_id: metadados.campanha_id,
      eleitor_id: metadados.eleitor_id,
      apoiador_id: metadados.apoiador_id,
      enviado_por: metadados.enviado_por,
      telefone_destino: telefoneNormalizado,
      conteudo: texto.trim(),
      status_envio: resultadoEnvio.status,
      id_externo: resultadoEnvio.id_externo,
    });

    return {
      sucesso: true,
      simulado: resultadoEnvio.simulado,
      mensagem: mensagemSalva,
      detalhes_api: resultadoEnvio,
    };
  } catch (erro) {
    // se falhou, tento registrar com status 'falha' no banco pra ter rastreabilidade
    if (metadados.campanha_id) {
      await registrarMensagemNoBanco({
        campanha_id: metadados.campanha_id,
        eleitor_id: metadados.eleitor_id,
        apoiador_id: metadados.apoiador_id,
        enviado_por: metadados.enviado_por,
        telefone_destino: telefoneNormalizado,
        conteudo: texto.trim(),
        status_envio: 'falha',
        id_externo: null,
      });
    }

    // relança o erro pra ser tratado na rota
    throw erro;
  }
}

// disparo em massa — envia pra uma lista de números sequencialmente
async function enviarDisparoEmMassa(numeros, texto, metadados = {}) {
  if (!Array.isArray(numeros) || numeros.length === 0) {
    const erro = new Error('Informe ao menos um numero para o disparo em massa.');
    erro.status = 400;
    throw erro;
  }

  if (numeros.length > 100) {
    const erro = new Error('Envie no maximo 100 numeros por vez.');
    erro.status = 400;
    throw erro;
  }

  const resultados = [];
  let sucessos = 0;
  let falhas = 0;

  // percorro a lista um por um com delay entre os envios
  for (let i = 0; i < numeros.length; i++) {
    const numero = numeros[i];

    try {
      const resultado = await enviarMensagemIndividual(numero, texto, metadados);
      sucessos += 1;

      resultados.push({
        numero,
        sucesso: true,
        id_mensagem: resultado.mensagem?.id,
        simulado: resultado.simulado,
      });
    } catch (erro) {
      falhas += 1;

      resultados.push({
        numero,
        sucesso: false,
        erro: erro.status && erro.status < 500 ? erro.message : 'Falha ao enviar mensagem.',
      });
    }

    // aguardo entre envios pra não sobrecarregar (exceto no último)
    if (i < numeros.length - 1) {
      await aguardar(BULK_DELAY_MS);
    }
  }

  return {
    total: numeros.length,
    sucessos,
    falhas,
    modo_simulacao: SIMULATION_MODE,
    resultados,
  };
}

module.exports = {
  normalizarTelefone,
  enviarMensagemIndividual,
  enviarDisparoEmMassa,
  SIMULATION_MODE,
};
