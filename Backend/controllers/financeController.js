// financeController.js - saldo e listagem de movimentacoes financeiras
const { query } = require('../config/db');

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

    return res.status(200).json({
      saldo_consolidado: saldo,
      total_receitas: receitas,
      total_despesas: despesas,
      total_pendente_aprovacao: parseFloat(row.total_pendente),
      campanha_id: campanhaId,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/finance - lista movimentacoes com paginacao
async function listar(req, res, next) {
  try {
    const pagina = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (pagina - 1) * limite;
    const campanhaId = req.usuario.campanha_id;

    const resultadoCount = await query(
      `SELECT COUNT(*) AS total FROM movimentacoes_financeiras WHERE campanha_id = $1`,
      [campanhaId]
    );

    const total = parseInt(resultadoCount.rows[0].total, 10);

    const resultado = await query(
      `SELECT
         m.id, m.campanha_id, m.categoria_id, m.registrado_por,
         m.aprovado_por, m.tipo, m.descricao, m.valor,
         m.data_movimentacao, m.forma_pagamento, m.numero_documento,
         m.comprovante_url, m.contraparte, m.status_aprovacao,
         m.observacoes, m.created_at, m.updated_at,
         c.nome AS categoria_nome
       FROM movimentacoes_financeiras m
       LEFT JOIN categorias_financeiras c ON m.categoria_id = c.id
       WHERE m.campanha_id = $1
       ORDER BY m.data_movimentacao DESC
       LIMIT $2 OFFSET $3`,
      [campanhaId, limite, offset]
    );

    return res.status(200).json({
      dados: resultado.rows,
      paginacao: { pagina, limite, total, total_paginas: Math.ceil(total / limite) },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { obterSaldo, listar };
