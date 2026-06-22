-- migrations/003_seguranca_lgpd.sql
-- Campos e registros usados na auditoria e no controle de consentimento.

-- =============================================================================
-- 1. TABELA LOG_AUDITORIA
-- Registra quem fez o quê e quando. Imutável: sem UPDATE nem DELETE.
-- LGPD Art. 37: o controlador deve manter registro das operações de tratamento.
-- =============================================================================
CREATE TABLE IF NOT EXISTS log_auditoria (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id  UUID REFERENCES campanhas(id) ON DELETE SET NULL,
  usuario_id   UUID REFERENCES usuarios(id)  ON DELETE SET NULL,
  acao         VARCHAR(100)  NOT NULL,    -- ex: 'eleitor.criado', 'auth.login.falha'
  entidade     VARCHAR(50),               -- ex: 'eleitor', 'usuario', 'import'
  entidade_id  UUID,                      -- ID do registro afetado
  ip_origem    INET,                      -- IP do cliente para rastreabilidade
  dados_antes  JSONB,                     -- snapshot antes da operação (para DELETE/UPDATE)
  dados_depois JSONB,                     -- snapshot depois da operação (para INSERT/UPDATE)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- índice para consultas de auditoria por campanha e data
CREATE INDEX IF NOT EXISTS idx_log_auditoria_campanha_data
  ON log_auditoria(campanha_id, created_at DESC);

-- índice para consultas por usuário (ex: "o que este usuário fez?")
CREATE INDEX IF NOT EXISTS idx_log_auditoria_usuario
  ON log_auditoria(usuario_id, created_at DESC);

-- =============================================================================
-- 2. CONSENTIMENTO LGPD NA TABELA ELEITORES
-- LGPD Art. 7 e 11: dado político (status_voto) é categoria especial —
-- exige base legal explícita para tratamento.
-- =============================================================================
ALTER TABLE eleitores
  ADD COLUMN IF NOT EXISTS consentimento_lgpd    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_consentimento     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origem_cadastro        VARCHAR(50) DEFAULT 'manual';
  -- origem_cadastro: 'manual' | 'importacao' | 'formulario_web'

-- índice para relatórios de consentimentos vencendo
CREATE INDEX IF NOT EXISTS idx_eleitores_consentimento
  ON eleitores(campanha_id, consentimento_lgpd, data_consentimento)
  WHERE consentimento_lgpd = TRUE;

-- =============================================================================
-- 3. ÍNDICES DE PERFORMANCE NA TABELA ELEITORES
-- Consultas comuns precisam de índices — sem eles o PostgreSQL faz full scan.
-- =============================================================================

-- filtro por status_voto (usado no GET /voters?status_voto=confirmado)
CREATE INDEX IF NOT EXISTS idx_eleitores_status_voto
  ON eleitores(campanha_id, status_voto);

-- busca por bairro com ILIKE — índice de texto
CREATE INDEX IF NOT EXISTS idx_eleitores_bairro
  ON eleitores(campanha_id, bairro);

-- filtro por zona/seção eleitoral
CREATE INDEX IF NOT EXISTS idx_eleitores_zona_secao
  ON eleitores(campanha_id, zona_eleitoral, secao_eleitoral);

-- =============================================================================
-- 4. TRIGGER: RASTREAR QUEM ALTEROU O STATUS DE VOTO
-- Usado em conjunto com SET LOCAL app.usuario_id = '...' (definido no backend).
-- =============================================================================

-- tabela de histórico (pode já existir — usa IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS historico_status_voto (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eleitor_id     UUID NOT NULL REFERENCES eleitores(id) ON DELETE CASCADE,
  alterado_por   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  status_anterior VARCHAR(30),
  status_novo     VARCHAR(30),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_status_eleitor
  ON historico_status_voto(eleitor_id, created_at DESC);

-- recria a função do trigger capturando o usuario_id da variável de sessão
CREATE OR REPLACE FUNCTION registrar_historico_status_voto()
RETURNS TRIGGER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  -- só grava se o status_voto realmente mudou
  IF OLD.status_voto IS DISTINCT FROM NEW.status_voto THEN
    -- tenta ler o usuário definido pelo backend com SET LOCAL app.usuario_id = '...'
    BEGIN
      v_usuario_id := current_setting('app.usuario_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_usuario_id := NULL; -- nenhum usuário definido na sessão
    END;

    INSERT INTO historico_status_voto (eleitor_id, alterado_por, status_anterior, status_novo)
    VALUES (NEW.id, v_usuario_id, OLD.status_voto, NEW.status_voto);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- recria o trigger (DROP IF EXISTS + CREATE para idempotência)
DROP TRIGGER IF EXISTS trg_eleitores_historico_voto ON eleitores;
DROP TRIGGER IF EXISTS trg_historico_status_voto ON eleitores;
CREATE TRIGGER trg_historico_status_voto
  AFTER UPDATE ON eleitores
  FOR EACH ROW EXECUTE FUNCTION registrar_historico_status_voto();

-- =============================================================================
-- 5. COMENTÁRIOS NAS COLUNAS SENSÍVEIS (documentação no próprio banco)
-- Boa prática de DBA — facilita auditorias externas e onboarding de devs.
-- =============================================================================
COMMENT ON COLUMN eleitores.cpf IS
  'Dado pessoal — exibe mascarado para nível operador/visualizador (LGPD Art. 5)';

COMMENT ON COLUMN eleitores.status_voto IS
  'Dado político — categoria especial LGPD Art. 11. Exige base legal explícita.';

COMMENT ON COLUMN eleitores.consentimento_lgpd IS
  'True = titular foi informado e consentiu com o tratamento dos seus dados políticos.';

COMMENT ON TABLE log_auditoria IS
  'Registro imutável de operações sensíveis. LGPD Art. 37. Sem UPDATE/DELETE.';
