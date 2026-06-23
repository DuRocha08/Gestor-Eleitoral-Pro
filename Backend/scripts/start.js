// Inicio usado pelo Render. Em producao, cria/atualiza as tabelas antes da API subir.

const { spawnSync } = require('child_process');

function rodar(comando, argumentos) {
  const resultado = spawnSync(comando, argumentos, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (resultado.error) {
    console.error('[START] falha ao executar:', resultado.error.message);
    process.exit(1);
  }

  if (resultado.status !== 0) {
    process.exit(resultado.status || 1);
  }
}

if (process.env.NODE_ENV === 'production' && process.env.RUN_MIGRATIONS_ON_START !== 'false') {
  console.log('[START] rodando migrations antes de iniciar...');
  rodar('npm', ['run', 'migrate']);
}

require('../server');
