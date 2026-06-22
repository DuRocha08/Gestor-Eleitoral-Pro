-- Permissoes da conta usada pelo backend.
-- Execute este arquivo como postgres, depois de criar ou migrar as tabelas.

-- O dono do banco ignora alguns REVOKEs, entao a aplicacao nao pode ser dona.
ALTER DATABASE gestor_eleitoral OWNER TO postgres;
ALTER SCHEMA public OWNER TO postgres;

GRANT CONNECT ON DATABASE gestor_eleitoral TO gestor_app;
GRANT USAGE ON SCHEMA public TO gestor_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO gestor_app;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO gestor_app;

-- Tabelas e sequencias criadas futuramente pelo usuario postgres tambem
-- ficarao acessiveis para o backend.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestor_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gestor_app;

-- A conta da aplicacao nao precisa criar objetos nem alterar o historico.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM gestor_app;
REVOKE CREATE ON DATABASE gestor_eleitoral FROM gestor_app;
REVOKE UPDATE, DELETE ON TABLE auditoria, log_auditoria FROM gestor_app;
