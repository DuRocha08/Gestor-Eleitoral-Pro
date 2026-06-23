# Gestor Eleitoral - Projeto ADS

Sistema web de gestao eleitoral desenvolvido como projeto academico de Analise e Desenvolvimento de Sistemas.

## Tecnologias

- Backend: Node.js, Express e PostgreSQL
- Frontend: React, Vite e Tailwind CSS
- Seguranca: JWT, bcrypt, Helmet, CORS e rate limit
- Protecao de conta: MFA TOTP, recuperacao de senha e auditoria
- Operacao: fila persistente de importacao, metricas, alertas e backup

## Organizacao do projeto

- `frontend/`: telas React, componentes, chamadas da API e estilos;
- `Backend/routes/`: define os enderecos da API e os middlewares usados em cada rota;
- `Backend/controllers/`: valida as regras da requisicao e prepara a resposta;
- `Backend/services/`: concentra integracoes e operacoes reutilizadas por mais de um fluxo;
- `Backend/utils/`: funcoes pequenas de validacao, auditoria e arquivos;
- `database/`: estrutura inicial e migrations do PostgreSQL;
- `docs/`: guias de banco, deploy e relatorios de revisao.

O frontend envia requisicoes para `/api`. No backend, a rota verifica autenticacao e permissao antes de chamar o controller. O controller usa os services ou consultas parametrizadas no PostgreSQL e devolve JSON para a tela.

## Como rodar o backend

1. Entre na pasta `Backend/`.
2. Copie `.env.example` para `.env`.
3. Preencha as variaveis do banco e gere uma `JWT_SECRET` aleatoria. Em producao, use pelo menos 64 caracteres.
4. Execute:

```bash
npm install
npm run dev
```

A API roda em `http://localhost:3001`.

## Como rodar o frontend

1. Entre na pasta `frontend/`.
2. Execute:

```bash
npm install
npm run dev
```

O frontend roda em `http://localhost:5173`.

## Banco de dados

Em banco vazio, execute os scripts nesta ordem. Em banco existente, nao execute novamente `schema.sql`; aplique apenas migrations pendentes.

```bash
psql -h localhost -U postgres -d gestor_eleitoral -f database/schema.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/002_multi_tenant_cargos.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/003_seguranca_lgpd.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/004_cpf_por_campanha.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migration_planilhas.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/006_indices_consultas.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/007_hardening_seguranca.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/008_garantir_colunas_autenticacao.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/009_operacao_completa.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/010_administrador_global.sql
psql -h localhost -U postgres -d gestor_eleitoral -f database/migrations/005_permissoes_gestor_app.sql
```
## Testes

``bash
npm test --prefix Backend
npm test --prefix frontend
npm run lint --prefix Backend
npm run lint --prefix frontend
npm run test:e2e --prefix frontend
npm run build --prefix frontend
``
