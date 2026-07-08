// financeController.js - saldo, lancamentos e relatorios financeiros
const { query } = require('../config/db');
const { limparTexto, uuidValido } = require('../utils/validacao');

const TIPOS = ['receita', 'despesa'];
const STATUS_APROVACAO = ['pendente', 'aprovada', 'rejeitada'];
const STATUS_PAGAMENTO = ['pendente', 'pago', 'atrasado', 'cancelado'];

// GET /api/finance/balance - calcula o saldo da campanha
async function obterSaldo(req, res, next) {
  try {
    const campanhaId = req.usuario.campanha_id;

    // FILTER calcula receitas e despesas na mesma consulta.
    const resultado = await query(
      `SELECT
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'receita' AND status_aprovacao = 'aprovada'), 0) AS total_receitas,
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'despesa' AND status_aprovacao = 'aprovada'), 0) AS total_despesas,
         COALESCE(SUM(valor) FILTER (WHERE status_aprovacao = 'pendente'), 0) AS total_pendente
       FROM movimentacoes_financeiras
       WHERE campanha_id = $1`,
      [campanhaId]
    );

    const row = resultado.rows[0];
    const receitas = parseFloat(row.total_receitas);
    const despesas = parseFloat(row.total_despesas);
    const saldo = receitas - despesas;

    const limite = await obterLimiteAtual(campanhaId);

    return res.status(200).json({
      saldo_consolidado: saldo,
      total_receitas: receitas,
      total_despesas: despesas,
      total_pendente_aprovacao: parseFloat(row.total_pendente),
      limite_gastos: limite,
      campanha_id: campanhaId,
    });
  } catch (err) {
    next(err);
  }
}

async function obterLimiteAtual(campanhaId) {
  const resultado = await query(
    `SELECT id, ano_eleicao, cargo, uf, municipio, valor_limite, fonte, observacoes
     FROM limites_gastos_campanha
     WHERE campanha_id = $1 AND ativo = true
     ORDER BY ano_eleicao DESC, created_at DESC
     LIMIT 1`,
    [campanhaId]
  );
  const limite = resultado.rows[0];
  if (!limite) return null;

  const gastos = await query(
    `SELECT COALESCE(SUM(valor),0) AS total
     FROM movimentacoes_financeiras
     WHERE campanha_id=$1 AND tipo='despesa' AND status_aprovacao='aprovada'
       AND status_pagamento <> 'cancelado'`,
    [campanhaId]
  );
  const gasto = parseFloat(gastos.rows[0].total);
  const valorLimite = parseFloat(limite.valor_limite);
  const restante = valorLimite - gasto;
  const percentual = valorLimite > 0 ? Math.round((gasto / valorLimite) * 100) : 0;
  let status = 'dentro_do_limite';
  if (gasto > valorLimite) status = 'limite_excedido';
  else if (percentual >= 85) status = 'proximo_do_limite';

  return {
    ...limite,
    valor_limite: valorLimite,
    valor_gasto: gasto,
    valor_restante: restante,
    percentual_utilizado: percentual,
    status,
  };
}

// GET /api/finance - lista movimentacoes com paginacao
async function listar(req, res, next) {
  try {
    const pagina = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (pagina - 1) * limite;
    const campanhaId = req.usuario.campanha_id;

    const condicoes = ['m.campanha_id = $1'];
    const params = [campanhaId];
    let i = 2;

    if (req.query.tipo) {
      condicoes.push(`m.tipo = $${i}::tipo_movimentacao`);
      params.push(req.query.tipo);
      i += 1;
    }
    if (req.query.status_pagamento) {
      condicoes.push(`m.status_pagamento = $${i}`);
      params.push(req.query.status_pagamento);
      i += 1;
    }
    if (req.query.busca) {
      condicoes.push(`(m.descricao ILIKE $${i} OR m.contraparte ILIKE $${i} OR m.fornecedor ILIKE $${i})`);
      params.push('%' + req.query.busca + '%');
      i += 1;
    }

    const where = 'WHERE ' + condicoes.join(' AND ');

    const resultadoCount = await query(
      `SELECT COUNT(*) AS total FROM movimentacoes_financeiras m ${where}`,
      params
    );

    const total = parseInt(resultadoCount.rows[0].total, 10);

    const resultado = await query(
      `SELECT
         m.id, m.campanha_id, m.categoria_id, m.registrado_por,
         m.aprovado_por, m.tipo, m.descricao, m.valor,
         m.data_movimentacao, m.forma_pagamento, m.numero_documento,
         m.comprovante_url, m.contraparte, m.status_aprovacao,
         m.observacoes, m.created_at, m.updated_at,
         m.fornecedor, m.data_vencimento, m.data_pagamento, m.status_pagamento,
         c.nome AS categoria_nome
       FROM movimentacoes_financeiras m
       LEFT JOIN categorias_financeiras c ON m.categoria_id = c.id
       ${where}
       ORDER BY m.data_movimentacao DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      params.concat([limite, offset])
    );

    return res.status(200).json({
      dados: resultado.rows,
      paginacao: { pagina, limite, total, total_paginas: Math.ceil(total / limite) },
    });
  } catch (err) {
    next(err);
  }
}

async function listarCategorias(req, res, next) {
  try {
    const resultado = await query(
      `SELECT id, nome, tipo, ativo
       FROM categorias_financeiras
       WHERE ativo = true AND (campanha_id IS NULL OR campanha_id = $1)
       ORDER BY tipo, nome`,
      [req.usuario.campanha_id]
    );
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function criarCategoria(req, res, next) {
  try {
    const nome = limparTexto(req.body.nome, 150);
    const tipo = req.body.tipo;
    if (!nome) return res.status(400).json({ erro: 'Nome da categoria e obrigatorio.' });
    if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: 'Tipo invalido.' });
    const resultado = await query(
      `INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
       VALUES ($1,$2,$3::tipo_movimentacao) RETURNING *`,
      [req.usuario.campanha_id, nome, tipo]
    );
    return res.status(201).json({ mensagem: 'Categoria criada.', categoria: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function criar(req, res, next) {
  try {
    const tipo = req.body.tipo;
    const valor = Number(req.body.valor);
    const descricao = limparTexto(req.body.descricao, 500);
    const data = limparTexto(req.body.data_movimentacao, 10);
    const statusAprovacao = req.body.status_aprovacao || 'aprovada';
    const statusPagamento = req.body.status_pagamento || (tipo === 'receita' ? 'pago' : 'pendente');

    if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: 'Tipo invalido.' });
    if (!descricao) return res.status(400).json({ erro: 'Descricao e obrigatoria.' });
    if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ erro: 'Valor invalido.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return res.status(400).json({ erro: 'Data invalida.' });
    if (!STATUS_APROVACAO.includes(statusAprovacao)) return res.status(400).json({ erro: 'Status de aprovacao invalido.' });
    if (!STATUS_PAGAMENTO.includes(statusPagamento)) return res.status(400).json({ erro: 'Status de pagamento invalido.' });
    if (req.body.categoria_id && !uuidValido(req.body.categoria_id)) {
      return res.status(400).json({ erro: 'Categoria invalida.' });
    }
    if (req.body.categoria_id) {
      const categoria = await query(
        `SELECT id FROM categorias_financeiras
         WHERE id=$1 AND (campanha_id IS NULL OR campanha_id=$2) AND ativo=true`,
        [req.body.categoria_id, req.usuario.campanha_id]
      );
      if (!categoria.rows[0]) return res.status(403).json({ erro: 'Categoria nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `INSERT INTO movimentacoes_financeiras (
        campanha_id, categoria_id, registrado_por, tipo, descricao, valor, data_movimentacao,
        forma_pagamento, numero_documento, comprovante_url, contraparte, fornecedor,
        data_vencimento, data_pagamento, status_pagamento, status_aprovacao, observacoes
       ) VALUES (
        $1,$2,$3,$4::tipo_movimentacao,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::status_aprovacao,$17
       ) RETURNING *`,
      [
        req.usuario.campanha_id, req.body.categoria_id || null, req.usuario.id,
        tipo, descricao, valor, data, limparTexto(req.body.forma_pagamento, 50),
        limparTexto(req.body.numero_documento, 100), limparTexto(req.body.comprovante_url, 500),
        limparTexto(req.body.contraparte), limparTexto(req.body.fornecedor),
        limparTexto(req.body.data_vencimento, 10), limparTexto(req.body.data_pagamento, 10),
        statusPagamento, statusAprovacao,
        limparTexto(req.body.observacoes, 2000),
      ]
    );
    return res.status(201).json({ mensagem: 'Lancamento financeiro salvo.', movimentacao: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function relatorioMensal(req, res, next) {
  try {
    const resultado = await query(
      `SELECT to_char(date_trunc('month', data_movimentacao), 'YYYY-MM') AS mes,
        COALESCE(SUM(valor) FILTER (WHERE tipo='receita'),0) AS receitas,
        COALESCE(SUM(valor) FILTER (WHERE tipo='despesa'),0) AS despesas,
        COALESCE(SUM(CASE WHEN tipo='receita' THEN valor ELSE -valor END),0) AS saldo
       FROM movimentacoes_financeiras
       WHERE campanha_id=$1 AND status_aprovacao='aprovada'
       GROUP BY date_trunc('month', data_movimentacao)
       ORDER BY mes DESC
       LIMIT 12`,
      [req.usuario.campanha_id]
    );
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function fluxoCaixa(req, res, next) {
  try {
    const resultado = await query(
      `SELECT data_movimentacao AS data, descricao, tipo, valor, status_pagamento
       FROM movimentacoes_financeiras
       WHERE campanha_id=$1
       ORDER BY data_movimentacao DESC, created_at DESC
       LIMIT 100`,
      [req.usuario.campanha_id]
    );
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function salvarLimite(req, res, next) {
  try {
    const valor = Number(req.body.valor_limite);
    const ano = Number(req.body.ano_eleicao);
    const cargo = limparTexto(req.body.cargo, 100);

    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return res.status(400).json({ erro: 'Ano da eleicao invalido.' });
    }
    if (!cargo) return res.status(400).json({ erro: 'Cargo e obrigatorio.' });
    if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ erro: 'Valor limite invalido.' });

    await query(
      `UPDATE limites_gastos_campanha SET ativo=false, updated_at=NOW()
       WHERE campanha_id=$1 AND ativo=true`,
      [req.usuario.campanha_id]
    );

    const resultado = await query(
      `INSERT INTO limites_gastos_campanha
       (campanha_id, ano_eleicao, cargo, uf, municipio, valor_limite, fonte, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.usuario.campanha_id, ano, cargo, limparTexto(req.body.uf, 2),
        limparTexto(req.body.municipio, 150), valor,
        limparTexto(req.body.fonte, 255) || 'Lei 13.488/2017 e limite divulgado pelo TSE',
        limparTexto(req.body.observacoes, 2000),
      ]
    );

    return res.status(201).json({ mensagem: 'Limite de gastos salvo.', limite: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function obterLimite(req, res, next) {
  try {
    const limite = await obterLimiteAtual(req.usuario.campanha_id);
    if (!limite) return res.status(404).json({ erro: 'Nenhum limite configurado.' });
    return res.json({ limite });
  } catch (err) { next(err); }
}

module.exports = {
  obterSaldo,
  listar,
  listarCategorias,
  criarCategoria,
  criar,
  relatorioMensal,
  fluxoCaixa,
  salvarLimite,
  obterLimite,
};
