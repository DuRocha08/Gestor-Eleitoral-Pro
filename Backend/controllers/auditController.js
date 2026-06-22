const { query } = require('../config/db');

async function listar(req, res, next) {
  try {
    const pagina = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const offset = (pagina - 1) * limite;
    const acao = String(req.query.acao || '').trim().slice(0, 100) || null;
    const parametros = [req.usuario.campanha_id];
    let filtro = '';
    if (acao) { parametros.push(acao); filtro = ' AND a.acao=$2'; }
    const total = await query(
      `SELECT COUNT(*)::int AS total FROM auditoria a WHERE a.campanha_id=$1${filtro}`,
      parametros
    );
    parametros.push(limite, offset);
    const resultado = await query(
      `SELECT a.id,a.acao,a.entidade,a.entidade_id,a.ip,a.antes,a.depois,a.criado_em,
       u.nome AS usuario_nome,u.email AS usuario_email
       FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id
       WHERE a.campanha_id=$1${filtro}
       ORDER BY a.criado_em DESC LIMIT $${parametros.length - 1} OFFSET $${parametros.length}`,
      parametros
    );
    return res.json({
      dados: resultado.rows,
      paginacao: { pagina, limite, total: total.rows[0].total, total_paginas: Math.ceil(total.rows[0].total / limite) },
    });
  } catch (err) { next(err); }
}

module.exports = { listar };
