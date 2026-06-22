require('dotenv').config();

// A conta de migration pode ser diferente da conta usada pela API.
if (process.env.DATABASE_MIGRATION_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_MIGRATION_URL;
}

const fs = require('fs');
const path = require('path');
const { getClient, encerrarPool } = require('../config/db');

const MIGRACOES = [
  { id: '001_schema', arquivo: 'schema.sql', estruturaInicial: true },
  { id: '002_multi_tenant_cargos', arquivo: 'migrations/002_multi_tenant_cargos.sql' },
  { id: '003_seguranca_lgpd', arquivo: 'migrations/003_seguranca_lgpd.sql' },
  { id: '004_cpf_por_campanha', arquivo: 'migrations/004_cpf_por_campanha.sql' },
  { id: '005_planilhas', arquivo: 'migration_planilhas.sql' },
  { id: '006_indices_consultas', arquivo: 'migrations/006_indices_consultas.sql' },
  { id: '007_hardening_seguranca', arquivo: 'migrations/007_hardening_seguranca.sql' },
  { id: '008_garantir_colunas_autenticacao', arquivo: 'migrations/008_garantir_colunas_autenticacao.sql' },
  { id: '009_operacao_completa', arquivo: 'migrations/009_operacao_completa.sql' },
  { id: '010_administrador_global', arquivo: 'migrations/010_administrador_global.sql' },
];

async function executar() {
  const client = await getClient();
  try {
    // O bloqueio impede dois deploys de migrarem o mesmo banco simultaneamente.
    await client.query('SELECT pg_advisory_lock($1)', [20260621]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(100) PRIMARY KEY,
        aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migracao of MIGRACOES) {
      const aplicada = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [migracao.id]);
      if (aplicada.rowCount > 0) continue;

      if (migracao.estruturaInicial) {
        const estruturaExiste = await client.query("SELECT to_regclass('public.usuarios') AS tabela");
        if (estruturaExiste.rows[0].tabela) {
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migracao.id]);
          console.log('[MIGRATION] estrutura existente reconhecida:', migracao.id);
          continue;
        }
      }

      const caminho = path.join(__dirname, '..', '..', 'database', migracao.arquivo);
      const sql = fs.readFileSync(caminho, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migracao.id]);
        await client.query('COMMIT');
        console.log('[MIGRATION] aplicada:', migracao.id);
      } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [20260621]).catch(function() {});
    client.release();
    await encerrarPool();
  }
}

executar().catch(function(erro) {
  console.error('[MIGRATION] falha:', process.env.NODE_ENV === 'production' ? (erro.code || erro.name) : erro.message);
  process.exitCode = 1;
});
