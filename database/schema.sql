-- =============================================================================
-- GESTOR ELEITORAL PRO — Schema Principal do Banco de Dados PostgreSQL
-- =============================================================================
-- Este arquivo define toda a estrutura relacional do sistema de gestao de
-- campanhas eleitorais: usuarios, eleitores, apoiadores, demandas e financas.
-- Execute este script uma unica vez em um banco PostgreSQL vazio ou limpo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EXTENSOES DO POSTGRESQL
-- -----------------------------------------------------------------------------

-- Habilita a extensao pgcrypto para funcoes criptograficas (ex.: gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Habilita a extensao uuid-ossp como alternativa para geracao de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- TIPOS ENUMERADOS (ENUMS) — Valores fixos e validados pelo banco
-- -----------------------------------------------------------------------------

-- Define os possiveis status de uma campanha eleitoral no sistema
CREATE TYPE status_campanha AS ENUM (
    'planejamento',  -- Campanha em fase de organizacao inicial
    'ativa',         -- Campanha em andamento durante o periodo eleitoral
    'encerrada',     -- Campanha finalizada apos as eleicoes
    'arquivada'      -- Campanha arquivada para consulta historica
);

-- Define os niveis hierarquicos de acesso dos usuarios ao sistema
CREATE TYPE nivel_acesso AS ENUM (
    'admin',         -- Acesso total: configuracoes, usuarios e todos os modulos
    'coordenador',   -- Gerencia equipe, metas e relatorios estrategicos
    'operador',      -- Cadastra eleitores, demandas e registra movimentacoes
    'visualizador'   -- Apenas consulta dados, sem permissao de alteracao
);

-- Define o status de intencao ou confirmacao de voto de cada eleitor cadastrado
CREATE TYPE status_voto AS ENUM (
    'nao_identificado',  -- Eleitor ainda nao foi abordado ou classificado
    'indeciso',          -- Eleitor ouvido, mas sem posicao definida
    'provavel',          -- Indicios positivos, mas sem confirmacao formal
    'confirmado',        -- Eleitor confirmou voto no candidato da campanha
    'oposicao',          -- Eleitor declarou apoio a candidato adversario
    'abstencao'          -- Eleitor informou que nao ira votar
);

-- Define os niveis de prioridade das demandas registradas pela comunidade
CREATE TYPE prioridade_demanda AS ENUM (
    'baixa',     -- Demanda pode aguardar resolucao sem urgencia
    'media',     -- Demanda com relevancia moderada para a comunidade
    'alta',      -- Demanda importante que requer atencao prioritária
    'urgente'    -- Demanda critica que exige acao imediata
);

-- Define o fluxo de status de uma demanda da comunidade
CREATE TYPE status_demanda AS ENUM (
    'aberta',         -- Demanda recem-registrada, aguardando triagem
    'em_analise',     -- Demanda sendo avaliada pela equipe da campanha
    'em_andamento',   -- Demanda com acoes em execucao
    'resolvida',      -- Demanda atendida com sucesso
    'cancelada'       -- Demanda encerrada sem resolucao (ex.: duplicada)
);

-- Define se a movimentacao financeira e uma entrada ou saida de recursos
CREATE TYPE tipo_movimentacao AS ENUM (
    'receita',   -- Entrada de recursos na campanha (doacoes, repasses, etc.)
    'despesa'    -- Saida de recursos (material, eventos, equipe, etc.)
);

-- Define o status de aprovacao de uma movimentacao financeira
CREATE TYPE status_aprovacao AS ENUM (
    'pendente',   -- Aguardando revisao e aprovacao de responsavel financeiro
    'aprovada',   -- Movimentacao validada e contabilizada
    'rejeitada'   -- Movimentacao recusada por inconsistencia ou falta de documento
);

-- -----------------------------------------------------------------------------
-- TABELA: campanhas
-- Entidade central que agrupa todos os dados de uma candidatura eleitoral
-- -----------------------------------------------------------------------------

CREATE TABLE campanhas (
    -- Identificador unico da campanha (UUID gerado automaticamente)
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Nome completo do candidato associado a campanha
    nome_candidato  VARCHAR(255) NOT NULL,

    -- Cargo disputado (ex.: Prefeito, Vereador, Deputado Estadual)
    cargo           VARCHAR(100) NOT NULL,

    -- Ano da eleicao correspondente (ex.: 2024, 2026, 2028)
    ano_eleicao     SMALLINT NOT NULL CHECK (ano_eleicao >= 2000 AND ano_eleicao <= 2100),

    -- Sigla do partido politico do candidato (ex.: PT, PSDB, MDB)
    partido         VARCHAR(20),

    -- Numero do candidato na urna eletronica
    numero_candidato SMALLINT CHECK (numero_candidato >= 0 AND numero_candidato <= 99999),

    -- Municipio ou circunscricao eleitoral da campanha
    municipio       VARCHAR(150),

    -- Unidade federativa (estado) da campanha (sigla com 2 letras)
    uf              CHAR(2),

    -- Status atual da campanha no ciclo eleitoral
    status          status_campanha NOT NULL DEFAULT 'planejamento',

    -- Data e hora de criacao do registro da campanha
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Data e hora da ultima atualizacao do registro
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para buscas rapidas por ano e status da campanha
CREATE INDEX idx_campanhas_ano_status ON campanhas (ano_eleicao, status);

-- -----------------------------------------------------------------------------
-- TABELA: usuarios
-- Usuarios do sistema com niveis de acesso vinculados a uma campanha
-- -----------------------------------------------------------------------------

CREATE TABLE usuarios (
    -- Identificador unico do usuario no sistema
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: campanha a qual o usuario pertence
    campanha_id     UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,

    -- Nivel de acesso que define permissoes do usuario (admin, coordenador, etc.)
    nivel           nivel_acesso NOT NULL DEFAULT 'operador',

    -- Nome completo do usuario para exibicao no sistema
    nome            VARCHAR(255) NOT NULL,

    -- E-mail unico usado para login e recuperacao de senha
    email           VARCHAR(255) NOT NULL UNIQUE,

    -- Hash da senha (nunca armazenar senha em texto puro)
    senha_hash      VARCHAR(255) NOT NULL,

    -- Telefone de contato do usuario (opcional)
    telefone        VARCHAR(20),

    -- Flag que indica se o usuario esta ativo e pode acessar o sistema
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,

    -- Data e hora do ultimo login bem-sucedido do usuario
    ultimo_acesso   TIMESTAMPTZ,

    -- Controle de tentativas e revogacao de sessoes
    tentativas_login_falhas SMALLINT NOT NULL DEFAULT 0
        CONSTRAINT chk_usuarios_tentativas_login_falhas
        CHECK (tentativas_login_falhas >= 0 AND tentativas_login_falhas <= 100),
    bloqueado_ate   TIMESTAMPTZ,
    token_versao    INTEGER NOT NULL DEFAULT 0
        CONSTRAINT chk_usuarios_token_versao CHECK (token_versao >= 0),
    mfa_ativo       BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_segredo_criptografado TEXT,
    mfa_codigos_reserva JSONB NOT NULL DEFAULT '[]'::jsonb,
    administrador_global BOOLEAN NOT NULL DEFAULT FALSE
        CONSTRAINT chk_usuarios_administrador_global
        CHECK (administrador_global = FALSE OR nivel = 'admin'),

    -- Data e hora de criacao da conta do usuario
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Data e hora da ultima alteracao nos dados do usuario
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para filtrar usuarios ativos por campanha
CREATE INDEX idx_usuarios_campanha_ativo ON usuarios (campanha_id, ativo);

-- Indice para autenticacao rapida por e-mail
CREATE INDEX idx_usuarios_email ON usuarios (email);

CREATE INDEX idx_usuarios_bloqueado_ate ON usuarios (bloqueado_ate)
WHERE bloqueado_ate IS NOT NULL;

CREATE INDEX idx_usuarios_administrador_global
ON usuarios (administrador_global, ativo)
WHERE administrador_global = TRUE;

CREATE TABLE tokens_recuperacao_senha (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expira_em TIMESTAMPTZ NOT NULL,
    usado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tokens_recuperacao_usuario
    ON tokens_recuperacao_senha (usuario_id, expira_em DESC);

-- -----------------------------------------------------------------------------
-- TABELA: apoiadores
-- Liderancas e colaboradores da campanha com metas de cadastro e votos
-- -----------------------------------------------------------------------------

CREATE TABLE apoiadores (
    -- Identificador unico do apoiador
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: campanha a qual o apoiador esta vinculado
    campanha_id         UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,

    -- Chave estrangeira auto-referenciada: apoiador supervisor (hierarquia)
    supervisor_id       UUID REFERENCES apoiadores(id) ON DELETE SET NULL,

    -- Chave estrangeira opcional: vinculo com conta de usuario do sistema
    usuario_id          UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Nome completo do apoiador ou lideranca comunitaria
    nome                VARCHAR(255) NOT NULL,

    -- CPF do apoiador (opcional, para controle interno)
    cpf                 VARCHAR(14),

    -- Telefone fixo ou celular principal do apoiador
    telefone            VARCHAR(20),

    -- Numero de WhatsApp para comunicacao e automacao de mensagens
    whatsapp            VARCHAR(20),

    -- Endereco de e-mail do apoiador (opcional)
    email               VARCHAR(255),

    -- Logradouro do endereco do apoiador
    endereco            VARCHAR(255),

    -- Bairro onde o apoiador atua ou reside
    bairro              VARCHAR(150),

    -- Meta de quantos eleitores o apoiador deve cadastrar na campanha
    meta_cadastros      INTEGER NOT NULL DEFAULT 0 CHECK (meta_cadastros >= 0),

    -- Meta de quantos votos confirmados o apoiador deve obter
    meta_votos          INTEGER NOT NULL DEFAULT 0 CHECK (meta_votos >= 0),

    -- Contador de cadastros de eleitores ja realizados pelo apoiador
    cadastros_realizados INTEGER NOT NULL DEFAULT 0 CHECK (cadastros_realizados >= 0),

    -- Contador de votos confirmados atribuidos ao apoiador
    votos_confirmados   INTEGER NOT NULL DEFAULT 0 CHECK (votos_confirmados >= 0),

    -- Flag que indica se o apoiador esta ativo na campanha
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,

    -- Observacoes internas sobre o apoiador
    observacoes         TEXT,

    -- Data e hora de criacao do registro do apoiador
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Data e hora da ultima atualizacao do registro
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para listar apoiadores ativos por campanha
CREATE INDEX idx_apoiadores_campanha_ativo ON apoiadores (campanha_id, ativo);

-- Indice para consultar hierarquia de liderancas (supervisor -> subordinados)
CREATE INDEX idx_apoiadores_supervisor ON apoiadores (supervisor_id);

-- -----------------------------------------------------------------------------
-- TABELA: eleitores
-- Cadastro de eleitores com dados eleitorais e status de voto
-- -----------------------------------------------------------------------------

CREATE TABLE eleitores (
    -- Identificador unico do eleitor no sistema
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: campanha a qual o eleitor pertence
    campanha_id         UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,

    -- Chave estrangeira: apoiador que indicou ou cadastrou o eleitor
    apoiador_id         UUID REFERENCES apoiadores(id) ON DELETE SET NULL,

    -- Chave estrangeira: usuario do sistema que realizou o cadastro
    cadastrado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Nome completo do eleitor conforme documento oficial
    nome                VARCHAR(255) NOT NULL,

    -- CPF do eleitor (documento unico de identificacao)
    cpf                 VARCHAR(14),

    -- Numero do titulo de eleitor (identificacao eleitoral TSE)
    titulo_eleitor      VARCHAR(20),

    -- Data de nascimento do eleitor para segmentacao etaria
    data_nascimento     DATE,

    -- Telefone fixo ou celular do eleitor
    telefone            VARCHAR(20),

    -- Numero de WhatsApp do eleitor para contato e automacao de mensagens
    whatsapp            VARCHAR(20),

    -- Endereco de e-mail do eleitor (opcional)
    email               VARCHAR(255),

    -- Logradouro completo do endereco do eleitor
    endereco            VARCHAR(255),

    -- Bairro de residencia do eleitor (importante para mapeamento territorial)
    bairro              VARCHAR(150),

    -- Cidade de residencia do eleitor
    cidade              VARCHAR(150),

    -- Unidade federativa (estado) do eleitor
    uf                  CHAR(2),

    -- Codigo de Enderecamento Postal (CEP) do eleitor
    cep                 VARCHAR(10),

    -- Numero da zona eleitoral conforme dados do TSE
    zona_eleitoral      SMALLINT CHECK (zona_eleitoral >= 0),

    -- Numero da secao eleitoral dentro da zona
    secao_eleitoral     SMALLINT CHECK (secao_eleitoral >= 0),

    -- Status atual de intencao ou confirmacao de voto do eleitor
    status_voto         status_voto NOT NULL DEFAULT 'nao_identificado',

    -- Observacoes livres sobre o eleitor (historico de contatos, preferencias)
    observacoes         TEXT,

    -- Data e hora de criacao do cadastro do eleitor
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Data e hora da ultima atualizacao dos dados do eleitor
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para filtrar eleitores por campanha e status de voto (dashboards)
CREATE INDEX idx_eleitores_campanha_status ON eleitores (campanha_id, status_voto);

-- Indice para buscar eleitores por bairro (mapeamento territorial)
CREATE INDEX idx_eleitores_bairro ON eleitores (campanha_id, bairro);

-- Indice para localizar eleitores por apoiador responsavel
CREATE INDEX idx_eleitores_apoiador ON eleitores (apoiador_id);

-- Indice para consultas por zona e secao eleitoral (integracao TSE)
CREATE INDEX idx_eleitores_zona_secao ON eleitores (zona_eleitoral, secao_eleitoral);

-- -----------------------------------------------------------------------------
-- TABELA: demandas_comunidade
-- Registro de demandas e necessidades levantadas pela comunidade
-- -----------------------------------------------------------------------------

CREATE TABLE demandas_comunidade (
    -- Identificador unico da demanda
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: campanha a qual a demanda pertence
    campanha_id         UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,

    -- Chave estrangeira opcional: eleitor que registrou ou reportou a demanda
    eleitor_id          UUID REFERENCES eleitores(id) ON DELETE SET NULL,

    -- Chave estrangeira: usuario responsavel pelo acompanhamento da demanda
    responsavel_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Titulo resumido da demanda para listagens e notificacoes
    titulo              VARCHAR(255) NOT NULL,

    -- Descricao detalhada da necessidade ou problema reportado
    descricao           TEXT NOT NULL,

    -- Categoria tematica da demanda (ex.: saude, infraestrutura, educacao)
    categoria           VARCHAR(100),

    -- Nivel de prioridade atribuido a demanda pela equipe
    prioridade          prioridade_demanda NOT NULL DEFAULT 'media',

    -- Status atual no fluxo de atendimento da demanda
    status              status_demanda NOT NULL DEFAULT 'aberta',

    -- Bairro ou regiao afetada pela demanda
    bairro              VARCHAR(150),

    -- Endereco ou ponto de referencia relacionado a demanda
    endereco_referencia VARCHAR(255),

    -- Prazo estimado ou desejado para resolucao da demanda
    data_prazo          DATE,

    -- Data em que a demanda foi efetivamente resolvida
    data_resolucao      TIMESTAMPTZ,

    -- Anotacoes internas sobre o andamento e decisoes tomadas
    anotacoes_internas  TEXT,

    -- Data e hora de criacao do registro da demanda
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Data e hora da ultima atualizacao da demanda
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para filtrar demandas por campanha, status e prioridade
CREATE INDEX idx_demandas_campanha_status ON demandas_comunidade (campanha_id, status, prioridade);

-- Indice para listar demandas por responsavel (painel de tarefas)
CREATE INDEX idx_demandas_responsavel ON demandas_comunidade (responsavel_id);

-- Indice para agrupar demandas por bairro (mapa de necessidades)
CREATE INDEX idx_demandas_bairro ON demandas_comunidade (campanha_id, bairro);

-- -----------------------------------------------------------------------------
-- TABELA: categorias_financeiras
-- Categorias padronizadas para classificacao de receitas e despesas
-- -----------------------------------------------------------------------------

CREATE TABLE categorias_financeiras (
    -- Identificador unico da categoria financeira
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: campanha dona desta categoria (null = categoria global)
    campanha_id     UUID REFERENCES campanhas(id) ON DELETE CASCADE,

    -- Nome descritivo da categoria (ex.: Material Grafico, Eventos, Doacoes PF)
    nome            VARCHAR(150) NOT NULL,

    -- Tipo de movimentacao que esta categoria aceita (receita ou despesa)
    tipo            tipo_movimentacao NOT NULL,

    -- Flag que indica se a categoria esta disponivel para uso
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,

    -- Data e hora de criacao da categoria
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para listar categorias ativas por campanha e tipo
CREATE INDEX idx_categorias_campanha_tipo ON categorias_financeiras (campanha_id, tipo);

-- -----------------------------------------------------------------------------
-- TABELA: movimentacoes_financeiras
-- Fluxo financeiro completo: receitas e despesas da campanha
-- -----------------------------------------------------------------------------

CREATE TABLE movimentacoes_financeiras (
    -- Identificador unico da movimentacao financeira
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: campanha a qual a movimentacao pertence
    campanha_id         UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,

    -- Chave estrangeira: categoria financeira da movimentacao
    categoria_id        UUID REFERENCES categorias_financeiras(id) ON DELETE SET NULL,

    -- Chave estrangeira: usuario que registrou a movimentacao no sistema
    registrado_por      UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,

    -- Chave estrangeira opcional: usuario que aprovou a movimentacao
    aprovado_por        UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Tipo da movimentacao: receita (entrada) ou despesa (saida)
    tipo                tipo_movimentacao NOT NULL,

    -- Descricao detalhada da movimentacao financeira
    descricao           VARCHAR(500) NOT NULL,

    -- Valor monetario da movimentacao (sempre positivo; tipo define entrada/saida)
    valor               NUMERIC(15, 2) NOT NULL CHECK (valor > 0),

    -- Data em que a movimentacao ocorreu efetivamente
    data_movimentacao   DATE NOT NULL,

    -- Forma de pagamento utilizada (ex.: PIX, dinheiro, transferencia, cartao)
    forma_pagamento     VARCHAR(50),

    -- Numero do documento fiscal ou comprovante (nota, recibo, boleto)
    numero_documento    VARCHAR(100),

    -- URL ou caminho do arquivo de comprovante anexado
    comprovante_url     VARCHAR(500),

    -- Nome ou CPF/CNPJ do doador ou fornecedor (conforme legislacao eleitoral)
    contraparte         VARCHAR(255),

    -- Status de aprovacao da movimentacao pelo responsavel financeiro
    status_aprovacao    status_aprovacao NOT NULL DEFAULT 'pendente',

    -- Observacoes adicionais sobre a movimentacao
    observacoes         TEXT,

    -- Data e hora de criacao do registro da movimentacao
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Data e hora da ultima atualizacao do registro
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para relatorios financeiros por campanha, tipo e periodo
CREATE INDEX idx_movimentacoes_campanha_tipo_data ON movimentacoes_financeiras (campanha_id, tipo, data_movimentacao);

-- Indice para filtrar movimentacoes pendentes de aprovacao
CREATE INDEX idx_movimentacoes_status ON movimentacoes_financeiras (campanha_id, status_aprovacao);

-- Indice para consultar movimentacoes por categoria
CREATE INDEX idx_movimentacoes_categoria ON movimentacoes_financeiras (categoria_id);

-- -----------------------------------------------------------------------------
-- TABELA: historico_status_voto
-- Auditoria de alteracoes no status de voto dos eleitores ao longo do tempo
-- -----------------------------------------------------------------------------

CREATE TABLE historico_status_voto (
    -- Identificador unico do registro de historico
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: eleitor cujo status foi alterado
    eleitor_id      UUID NOT NULL REFERENCES eleitores(id) ON DELETE CASCADE,

    -- Chave estrangeira: usuario que realizou a alteracao
    alterado_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Status de voto anterior a alteracao
    status_anterior status_voto,

    -- Novo status de voto apos a alteracao
    status_novo     status_voto NOT NULL,

    -- Motivo ou contexto da mudanca de status (opcional)
    motivo          TEXT,

    -- Data e hora em que a alteracao foi registrada
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para consultar historico de um eleitor especifico
CREATE INDEX idx_historico_voto_eleitor ON historico_status_voto (eleitor_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- TABELA: consultas_tse
-- Registro de consultas realizadas aos dados do TSE para inteligencia eleitoral
-- -----------------------------------------------------------------------------

CREATE TABLE consultas_tse (
    -- Identificador unico da consulta ao TSE
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: campanha que solicitou a consulta
    campanha_id     UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,

    -- Chave estrangeira: usuario que executou a consulta
    consultado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Tipo de consulta realizada (ex.: situacao_eleitor, zona_secao, resultado)
    tipo_consulta   VARCHAR(100) NOT NULL,

    -- Parametros enviados na consulta (CPF, titulo, zona, etc.) em formato JSON
    parametros      JSONB,

    -- Resposta retornada pela API ou base do TSE em formato JSON
    resposta        JSONB,

    -- Indica se a consulta foi bem-sucedida ou retornou erro
    sucesso         BOOLEAN NOT NULL DEFAULT TRUE,

    -- Mensagem de erro caso a consulta tenha falhado
    mensagem_erro   TEXT,

    -- Data e hora em que a consulta foi realizada
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para listar consultas TSE por campanha e tipo
CREATE INDEX idx_consultas_tse_campanha ON consultas_tse (campanha_id, tipo_consulta, created_at DESC);

-- -----------------------------------------------------------------------------
-- TABELA: mensagens_whatsapp
-- Registro de mensagens enviadas ou agendadas via integracao WhatsApp
-- -----------------------------------------------------------------------------

CREATE TABLE mensagens_whatsapp (
    -- Identificador unico da mensagem
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chave estrangeira: campanha responsavel pelo envio
    campanha_id     UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,

    -- Chave estrangeira opcional: eleitor destinatario da mensagem
    eleitor_id      UUID REFERENCES eleitores(id) ON DELETE SET NULL,

    -- Chave estrangeira opcional: apoiador destinatario da mensagem
    apoiador_id     UUID REFERENCES apoiadores(id) ON DELETE SET NULL,

    -- Chave estrangeira: usuario que disparou ou agendou o envio
    enviado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Numero de telefone destino no formato internacional (ex.: 5511999999999)
    telefone_destino VARCHAR(20) NOT NULL,

    -- Conteudo textual da mensagem enviada
    conteudo        TEXT NOT NULL,

    -- Status do envio (pendente, enviada, entregue, lida, falha)
    status_envio    VARCHAR(30) NOT NULL DEFAULT 'pendente',

    -- Identificador externo retornado pela API do WhatsApp (para rastreamento)
    id_externo      VARCHAR(100),

    -- Data e hora agendada para envio (null = envio imediato)
    agendado_para   TIMESTAMPTZ,

    -- Data e hora em que a mensagem foi efetivamente enviada
    enviado_em      TIMESTAMPTZ,

    -- Data e hora de criacao do registro da mensagem
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para monitorar fila de mensagens pendentes por campanha
CREATE INDEX idx_mensagens_campanha_status ON mensagens_whatsapp (campanha_id, status_envio);

-- Indice para buscar historico de mensagens de um eleitor
CREATE INDEX idx_mensagens_eleitor ON mensagens_whatsapp (eleitor_id, created_at DESC);

CREATE TABLE jobs_importacao (
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

CREATE INDEX idx_jobs_importacao_campanha_data ON jobs_importacao (campanha_id, criado_em DESC);
CREATE INDEX idx_jobs_importacao_pendentes ON jobs_importacao (status, criado_em)
WHERE status IN ('aguardando', 'processando');

-- -----------------------------------------------------------------------------
-- FUNCAO: atualizar_updated_at
-- Atualiza automaticamente a coluna updated_at antes de cada UPDATE
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION atualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Define o campo updated_at com a data/hora atual do servidor
    NEW.updated_at = NOW();
    -- Retorna o registro modificado para que o UPDATE prossiga normalmente
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- TRIGGERS: updated_at automatico em tabelas com auditoria de alteracao
-- -----------------------------------------------------------------------------

-- Trigger que atualiza updated_at na tabela campanhas a cada UPDATE
CREATE TRIGGER trg_campanhas_updated_at
    BEFORE UPDATE ON campanhas
    FOR EACH ROW EXECUTE PROCEDURE atualizar_updated_at();

-- Trigger que atualiza updated_at na tabela usuarios a cada UPDATE
CREATE TRIGGER trg_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE PROCEDURE atualizar_updated_at();

-- Trigger que atualiza updated_at na tabela apoiadores a cada UPDATE
CREATE TRIGGER trg_apoiadores_updated_at
    BEFORE UPDATE ON apoiadores
    FOR EACH ROW EXECUTE PROCEDURE atualizar_updated_at();

-- Trigger que atualiza updated_at na tabela eleitores a cada UPDATE
CREATE TRIGGER trg_eleitores_updated_at
    BEFORE UPDATE ON eleitores
    FOR EACH ROW EXECUTE PROCEDURE atualizar_updated_at();

-- Trigger que atualiza updated_at na tabela demandas_comunidade a cada UPDATE
CREATE TRIGGER trg_demandas_updated_at
    BEFORE UPDATE ON demandas_comunidade
    FOR EACH ROW EXECUTE PROCEDURE atualizar_updated_at();

-- Trigger que atualiza updated_at na tabela movimentacoes_financeiras a cada UPDATE
CREATE TRIGGER trg_movimentacoes_updated_at
    BEFORE UPDATE ON movimentacoes_financeiras
    FOR EACH ROW EXECUTE PROCEDURE atualizar_updated_at();

-- -----------------------------------------------------------------------------
-- FUNCAO: registrar_historico_status_voto
-- Grava automaticamente no historico quando o status_voto de um eleitor muda
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_historico_status_voto()
RETURNS TRIGGER AS $$
BEGIN
    -- Verifica se o status de voto foi alterado (comparando valor antigo e novo)
    IF OLD.status_voto IS DISTINCT FROM NEW.status_voto THEN
        -- Insere um registro no historico com status anterior e novo
        INSERT INTO historico_status_voto (eleitor_id, status_anterior, status_novo)
        VALUES (NEW.id, OLD.status_voto, NEW.status_voto);
    END IF;
    -- Retorna o registro para concluir o UPDATE na tabela eleitores
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que dispara o registro de historico ao alterar status_voto do eleitor
CREATE TRIGGER trg_eleitores_historico_voto
    AFTER UPDATE OF status_voto ON eleitores
    FOR EACH ROW EXECUTE PROCEDURE registrar_historico_status_voto();

-- -----------------------------------------------------------------------------
-- DADOS INICIAIS: categorias financeiras padrao (sem campanha = globais)
-- -----------------------------------------------------------------------------

-- Categoria global para doacoes de pessoa fisica (receita)
INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
VALUES (NULL, 'Doacoes - Pessoa Fisica', 'receita');

-- Categoria global para doacoes de pessoa juridica (receita)
INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
VALUES (NULL, 'Doacoes - Pessoa Juridica', 'receita');

-- Categoria global para repasses de fundo partidario ou FEFC (receita)
INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
VALUES (NULL, 'Repasses Partidarios / FEFC', 'receita');

-- Categoria global para material de campanha (despesa)
INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
VALUES (NULL, 'Material de Campanha', 'despesa');

-- Categoria global para eventos e comicios (despesa)
INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
VALUES (NULL, 'Eventos e Comicios', 'despesa');

-- Categoria global para equipe e colaboradores (despesa)
INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
VALUES (NULL, 'Equipe e Colaboradores', 'despesa');

-- Categoria global para transporte e logistica (despesa)
INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
VALUES (NULL, 'Transporte e Logistica', 'despesa');

-- Categoria global para midia e publicidade (despesa)
INSERT INTO categorias_financeiras (campanha_id, nome, tipo)
VALUES (NULL, 'Midia e Publicidade', 'despesa');

-- =============================================================================
-- FIM DO SCHEMA — Gestor Eleitoral Pro
-- =============================================================================
