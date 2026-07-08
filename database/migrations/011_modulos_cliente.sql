-- Complementos pedidos pelo cliente: agenda, apoiadores, financeiro e pesquisas.

CREATE TABLE IF NOT EXISTS agenda_compromissos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(30) NOT NULL DEFAULT 'evento'
    CHECK (tipo IN ('reuniao', 'visita', 'evento', 'lembrete')),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'media'
    CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  status VARCHAR(30) NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'confirmado', 'realizado', 'cancelado')),
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ,
  local VARCHAR(255),
  bairro VARCHAR(150),
  cidade VARCHAR(150),
  lembrete_em TIMESTAMPTZ,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_campanha_data
  ON agenda_compromissos (campanha_id, data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_agenda_campanha_status
  ON agenda_compromissos (campanha_id, status, prioridade);

ALTER TABLE apoiadores
  ADD COLUMN IF NOT EXISTS cidade VARCHAR(150),
  ADD COLUMN IF NOT EXISTS uf CHAR(2),
  ADD COLUMN IF NOT EXISTS ra VARCHAR(150),
  ADD COLUMN IF NOT EXISTS votos_estimados INTEGER NOT NULL DEFAULT 0 CHECK (votos_estimados >= 0),
  ADD COLUMN IF NOT EXISTS lider_politico BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nivel_influencia VARCHAR(20) NOT NULL DEFAULT 'medio'
    CHECK (nivel_influencia IN ('baixo', 'medio', 'alto')),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'inativo', 'pendente'));

CREATE TABLE IF NOT EXISTS historico_apoiadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apoiador_id UUID NOT NULL REFERENCES apoiadores(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo VARCHAR(50) NOT NULL DEFAULT 'anotacao',
  descricao TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_apoiadores
  ON historico_apoiadores (apoiador_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apoiadores_bairro_cidade
  ON apoiadores (campanha_id, bairro, cidade);
CREATE INDEX IF NOT EXISTS idx_apoiadores_ra
  ON apoiadores (campanha_id, ra, status);

ALTER TABLE movimentacoes_financeiras
  ADD COLUMN IF NOT EXISTS fornecedor VARCHAR(255),
  ADD COLUMN IF NOT EXISTS data_vencimento DATE,
  ADD COLUMN IF NOT EXISTS data_pagamento DATE,
  ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status_pagamento IN ('pendente', 'pago', 'atrasado', 'cancelado'));

CREATE INDEX IF NOT EXISTS idx_movimentacoes_vencimento
  ON movimentacoes_financeiras (campanha_id, data_vencimento, status_pagamento);

CREATE TABLE IF NOT EXISTS fornecedores_financeiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  documento VARCHAR(30),
  telefone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_financeiros
  ON fornecedores_financeiros (campanha_id, nome);

CREATE TABLE IF NOT EXISTS limites_gastos_campanha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  ano_eleicao SMALLINT NOT NULL,
  cargo VARCHAR(100) NOT NULL,
  uf CHAR(2),
  municipio VARCHAR(150),
  valor_limite NUMERIC(15,2) NOT NULL CHECK (valor_limite > 0),
  fonte VARCHAR(255),
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_limites_gastos_ativos
  ON limites_gastos_campanha (campanha_id, ano_eleicao, cargo, COALESCE(uf, ''), COALESCE(municipio, ''))
  WHERE ativo = true;

CREATE TABLE IF NOT EXISTS plano_campanha_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  fase VARCHAR(100),
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  responsavel_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_nome VARCHAR(255),
  data_inicio DATE,
  data_prazo DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'atrasada', 'cancelada')),
  progresso SMALLINT NOT NULL DEFAULT 0 CHECK (progresso BETWEEN 0 AND 100),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plano_campanha_acoes
  ON plano_campanha_acoes (campanha_id, status, data_prazo);

CREATE TABLE IF NOT EXISTS pesquisa_questionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  slug VARCHAR(80) NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  cargo VARCHAR(100),
  perguntas JSONB NOT NULL DEFAULT '[]'::jsonb,
  permite_anonimo BOOLEAN NOT NULL DEFAULT TRUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pesquisa_questionarios
  ON pesquisa_questionarios (campanha_id, ativo, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pesquisa_questionarios_slug
  ON pesquisa_questionarios (slug);

CREATE TABLE IF NOT EXISTS pesquisa_respostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionario_id UUID NOT NULL REFERENCES pesquisa_questionarios(id) ON DELETE CASCADE,
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  entrevistado_nome VARCHAR(255),
  anonimo BOOLEAN NOT NULL DEFAULT TRUE,
  idade SMALLINT CHECK (idade BETWEEN 16 AND 120),
  genero VARCHAR(50),
  renda VARCHAR(100),
  escolaridade VARCHAR(100),
  religiao VARCHAR(100),
  ocupacao VARCHAR(150),
  bairro VARCHAR(150),
  cidade VARCHAR(150),
  regiao_administrativa VARCHAR(150),
  zona_eleitoral SMALLINT,
  secao_eleitoral SMALLINT,
  intencao_voto VARCHAR(255),
  segunda_opcao VARCHAR(255),
  rejeicao VARCHAR(255),
  avaliacao_governo VARCHAR(100),
  problemas_prioritarios TEXT,
  conhece_candidato BOOLEAN,
  interesse_voluntario BOOLEAN,
  probabilidade_voto SMALLINT CHECK (probabilidade_voto BETWEEN 0 AND 10),
  cargo_pesquisado VARCHAR(100),
  origem_resposta VARCHAR(100),
  pagina_parceira VARCHAR(255),
  campanha_divulgacao VARCHAR(255),
  link_usado VARCHAR(500),
  ra_divulgacao VARCHAR(150),
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  entrevistado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_questionario
  ON pesquisa_respostas (questionario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_regiao
  ON pesquisa_respostas (campanha_id, bairro, cidade, regiao_administrativa);
CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_cargo
  ON pesquisa_respostas (campanha_id, cargo_pesquisado, intencao_voto);

CREATE TABLE IF NOT EXISTS pesquisa_origens_divulgacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionario_id UUID NOT NULL REFERENCES pesquisa_questionarios(id) ON DELETE CASCADE,
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  tipo VARCHAR(50) DEFAULT 'pagina_local',
  ra VARCHAR(150),
  cidade VARCHAR(150),
  link_gerado VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pesquisa_origens
  ON pesquisa_origens_divulgacao (questionario_id, ra, cidade);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agenda_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_agenda_updated_at
      BEFORE UPDATE ON agenda_compromissos
      FOR EACH ROW EXECUTE PROCEDURE atualizar_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pesquisa_questionarios_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_pesquisa_questionarios_updated_at
      BEFORE UPDATE ON pesquisa_questionarios
      FOR EACH ROW EXECUTE PROCEDURE atualizar_updated_at()';
  END IF;
END $$;
