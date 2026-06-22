-- Separa o administrador da plataforma do administrador de uma campanha.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS administrador_global BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS chk_usuarios_administrador_global;

ALTER TABLE usuarios
  ADD CONSTRAINT chk_usuarios_administrador_global
  CHECK (administrador_global = FALSE OR nivel = 'admin');

CREATE INDEX IF NOT EXISTS idx_usuarios_administrador_global
  ON usuarios (administrador_global, ativo)
  WHERE administrador_global = TRUE;

COMMENT ON COLUMN usuarios.administrador_global IS
  'Permite administrar todas as campanhas. Nao substitui o nivel de acesso da campanha.';
