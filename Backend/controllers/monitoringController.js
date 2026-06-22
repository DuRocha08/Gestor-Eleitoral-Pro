const { query } = require('../config/db');

async function metricas(req, res, next) {
  try {
    const resultado = await query(
      `SELECT
       (SELECT COUNT(*)::int FROM usuarios WHERE campanha_id=$1 AND ativo=true) AS usuarios_ativos,
       (SELECT COUNT(*)::int FROM eleitores WHERE campanha_id=$1) AS eleitores,
       (SELECT COUNT(*)::int FROM demandas_comunidade WHERE campanha_id=$1 AND status NOT IN ('resolvida','cancelada')) AS demandas_abertas,
       (SELECT COUNT(*)::int FROM jobs_importacao WHERE campanha_id=$1 AND status IN ('aguardando','processando')) AS importacoes_pendentes,
       (SELECT COUNT(*)::int FROM mensagens_whatsapp WHERE campanha_id=$1 AND status_envio='falha' AND created_at>NOW()-INTERVAL '24 hours') AS falhas_whatsapp_24h`,
      [req.usuario.campanha_id]
    );
    return res.json({ status: 'online', metricas: resultado.rows[0], timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
}

module.exports = { metricas };
