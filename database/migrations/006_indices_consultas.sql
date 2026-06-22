-- Indices compostos alinhados com as listagens e relatorios mais frequentes.

CREATE INDEX IF NOT EXISTS idx_eleitores_campanha_created
  ON eleitores (campanha_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eleitores_campanha_zona_secao
  ON eleitores (campanha_id, zona_eleitoral, secao_eleitoral);

CREATE INDEX IF NOT EXISTS idx_demandas_campanha_created
  ON demandas_comunidade (campanha_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_campanha_data
  ON movimentacoes_financeiras (campanha_id, data_movimentacao DESC);
