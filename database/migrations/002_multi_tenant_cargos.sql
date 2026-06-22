-- =============================================================================
-- MIGRAÇÃO 002 — Multi-Tenant, Cargos Políticos e Modo Gabinete
-- Gestor Eleitoral Pro — Execute no pgAdmin (banco gestor_eleitoral)
-- =============================================================================

-- ENUM: cargos políticos / escopo do gabinete
DO $$ BEGIN
  CREATE TYPE cargo_politico AS ENUM (
    'governador',
    'senador',
    'deputado_federal',
    'deputado_estadual',
    'prefeito',
    'vereador'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ENUM: fase do sistema (campanha eleitoral ou gabinete pós-eleição)
DO $$ BEGIN
  CREATE TYPE modo_sistema AS ENUM ('campanha', 'gabinete');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Colunas de isolamento e identidade do tenant (campanha = instância do cliente)
ALTER TABLE campanhas
  ADD COLUMN IF NOT EXISTS cargo_politico cargo_politico,
  ADD COLUMN IF NOT EXISTS modo_sistema modo_sistema NOT NULL DEFAULT 'campanha',
  ADD COLUMN IF NOT EXISTS tenant_slug VARCHAR(80),
  ADD COLUMN IF NOT EXISTS nome_exibicao VARCHAR(255),
  ADD COLUMN IF NOT EXISTS proprietario_usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Sincroniza cargo legado (VARCHAR) para o novo ENUM quando possível
UPDATE campanhas SET cargo_politico = 'governador'
WHERE cargo_politico IS NULL AND (cargo ILIKE '%governador%' AND cargo NOT ILIKE '%vice%');

UPDATE campanhas SET cargo_politico = 'senador'
WHERE cargo_politico IS NULL AND cargo ILIKE '%senador%';

UPDATE campanhas SET cargo_politico = 'deputado_federal'
WHERE cargo_politico IS NULL AND (cargo ILIKE '%deputado%federal%' OR cargo ILIKE '%dep.%fed%');

UPDATE campanhas SET cargo_politico = 'deputado_estadual'
WHERE cargo_politico IS NULL AND (cargo ILIKE '%deputado%estadual%' OR cargo ILIKE '%dep.%est%');

UPDATE campanhas SET cargo_politico = 'prefeito'
WHERE cargo_politico IS NULL AND cargo ILIKE '%prefeito%';

UPDATE campanhas SET cargo_politico = 'vereador'
WHERE cargo_politico IS NULL AND cargo ILIKE '%vereador%';

-- Valor alternativo para registros antigos sem correspondência
UPDATE campanhas SET cargo_politico = 'deputado_estadual'
WHERE cargo_politico IS NULL;

UPDATE campanhas SET nome_exibicao = nome_candidato WHERE nome_exibicao IS NULL;

-- Slug único por tenant (evita colisão entre clientes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_campanhas_tenant_slug
  ON campanhas (tenant_slug)
  WHERE tenant_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campanhas_cargo_politico ON campanhas (cargo_politico);
CREATE INDEX IF NOT EXISTS idx_campanhas_modo ON campanhas (modo_sistema);

COMMENT ON COLUMN campanhas.cargo_politico IS 'Cargo político do titular — define escopo do painel e isolamento comercial';
COMMENT ON COLUMN campanhas.tenant_slug IS 'Identificador único da instância (multi-tenant)';
COMMENT ON COLUMN campanhas.modo_sistema IS 'campanha = período eleitoral; gabinete = gestão pós-eleição';
