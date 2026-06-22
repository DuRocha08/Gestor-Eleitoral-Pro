-- Garante as colunas de seguranca em bancos que ficaram com a migration 007 incompleta.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS tentativas_login_falhas SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_ate TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_versao INTEGER NOT NULL DEFAULT 0;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS chk_usuarios_tentativas_login_falhas,
  ADD CONSTRAINT chk_usuarios_tentativas_login_falhas
    CHECK (tentativas_login_falhas >= 0 AND tentativas_login_falhas <= 100),
  DROP CONSTRAINT IF EXISTS chk_usuarios_token_versao,
  ADD CONSTRAINT chk_usuarios_token_versao CHECK (token_versao >= 0);

CREATE INDEX IF NOT EXISTS idx_usuarios_bloqueado_ate
  ON usuarios (bloqueado_ate)
  WHERE bloqueado_ate IS NOT NULL;

COMMENT ON COLUMN usuarios.tentativas_login_falhas IS
  'Contador de falhas consecutivas usado na protecao contra forca bruta.';
COMMENT ON COLUMN usuarios.bloqueado_ate IS
  'Bloqueio temporario da autenticacao apos falhas consecutivas.';
COMMENT ON COLUMN usuarios.token_versao IS
  'Versao usada para revogar JWTs emitidos anteriormente.';
