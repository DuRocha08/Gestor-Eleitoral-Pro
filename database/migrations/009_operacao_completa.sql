-- Recursos operacionais: MFA, recuperação de senha e fila persistente de importação.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS mfa_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_segredo_criptografado TEXT,
  ADD COLUMN IF NOT EXISTS mfa_codigos_reserva JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS tokens_recuperacao_senha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_recuperacao_usuario
  ON tokens_recuperacao_senha (usuario_id, expira_em DESC);

CREATE TABLE IF NOT EXISTS jobs_importacao (
  id UUID PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'processando', 'concluido', 'erro')),
  progresso SMALLINT NOT NULL DEFAULT 0 CHECK (progresso BETWEEN 0 AND 100),
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  processadas INTEGER NOT NULL DEFAULT 0 CHECK (processadas >= 0),
  inseridos INTEGER NOT NULL DEFAULT 0 CHECK (inseridos >= 0),
  duplicados INTEGER NOT NULL DEFAULT 0 CHECK (duplicados >= 0),
  erros JSONB NOT NULL DEFAULT '[]'::jsonb,
  erro_fatal TEXT,
  nome_arquivo VARCHAR(255) NOT NULL,
  mapeamento JSONB NOT NULL DEFAULT '{}'::jsonb,
  arquivo_dados BYTEA,
  ip_origem INET,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_importacao_campanha_data
  ON jobs_importacao (campanha_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_importacao_pendentes
  ON jobs_importacao (status, criado_em)
  WHERE status IN ('aguardando', 'processando');

COMMENT ON COLUMN usuarios.mfa_segredo_criptografado IS
  'Segredo TOTP cifrado com AES-256-GCM; nunca armazenado em texto puro.';
COMMENT ON TABLE tokens_recuperacao_senha IS
  'Tokens de uso único armazenados somente como hash SHA-256.';
COMMENT ON TABLE jobs_importacao IS
  'Fila persistente de importação para retomada após reinício do servidor.';
