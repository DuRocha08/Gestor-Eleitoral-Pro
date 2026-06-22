-- Migração: tabelas para importação de planilhas eleitorais
-- Execute no banco PostgreSQL antes de reiniciar o servidor.

CREATE TABLE IF NOT EXISTS planos_campanha (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  importado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  arquivo_nome  VARCHAR(255),
  configuracao  JSONB,
  cronograma    JSONB,
  metas         JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planos_campanha ON planos_campanha(campanha_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pesquisas_voto (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  importado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  arquivo_nome  VARCHAR(255),
  entrevistas   JSONB,
  por_candidato JSONB,
  por_tema      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pesquisas_voto ON pesquisas_voto(campanha_id, created_at DESC);

CREATE TABLE IF NOT EXISTS importacoes_financeiro (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  importado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  arquivo_nome  VARCHAR(255),
  receitas      JSONB,
  despesas      JSONB,
  prestacao     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_importacoes_financeiro ON importacoes_financeiro(campanha_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auditoria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID REFERENCES campanhas(id) ON DELETE CASCADE,
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  acao        VARCHAR(100) NOT NULL,
  entidade    VARCHAR(100),
  entidade_id VARCHAR(255),
  ip          VARCHAR(45),
  antes       JSONB,
  depois      JSONB,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_campanha ON auditoria(campanha_id, criado_em DESC);
