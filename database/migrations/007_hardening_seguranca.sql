-- Migracao 007: protecoes de autenticacao e imutabilidade da auditoria.

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

-- Reinstala o trigger de historico com tipos compativeis e autoria da sessao.
CREATE OR REPLACE FUNCTION registrar_historico_status_voto()
RETURNS TRIGGER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  IF OLD.status_voto IS DISTINCT FROM NEW.status_voto THEN
    BEGIN
      v_usuario_id := current_setting('app.usuario_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_usuario_id := NULL;
    END;
    INSERT INTO historico_status_voto
      (eleitor_id, alterado_por, status_anterior, status_novo)
    VALUES (NEW.id, v_usuario_id, OLD.status_voto, NEW.status_voto);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eleitores_historico_voto ON eleitores;
DROP TRIGGER IF EXISTS trg_historico_status_voto ON eleitores;
CREATE TRIGGER trg_historico_status_voto
  AFTER UPDATE OF status_voto ON eleitores
  FOR EACH ROW EXECUTE FUNCTION registrar_historico_status_voto();

-- A auditoria e somente de acrescimo. Ate o dono do banco precisa remover
-- explicitamente estes triggers antes de adulterar ou apagar um registro.
CREATE OR REPLACE FUNCTION impedir_alteracao_auditoria()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria sao imutaveis.'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auditoria_imutavel ON auditoria;
CREATE TRIGGER trg_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_auditoria();

DROP TRIGGER IF EXISTS trg_log_auditoria_imutavel ON log_auditoria;
CREATE TRIGGER trg_log_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON log_auditoria
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_auditoria();

COMMENT ON COLUMN usuarios.tentativas_login_falhas IS
  'Contador de falhas consecutivas usado na protecao contra forca bruta.';
COMMENT ON COLUMN usuarios.bloqueado_ate IS
  'Bloqueio temporario da autenticacao apos falhas consecutivas.';
COMMENT ON COLUMN usuarios.token_versao IS
  'Versao usada para revogar todos os JWTs emitidos anteriormente.';
