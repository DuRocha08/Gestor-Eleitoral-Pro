module.exports = {
  apps: [{
    name: 'gestor-eleitoral-api',
    cwd: './Backend',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '700M',
    kill_timeout: 10000,
    env: {
      NODE_ENV: 'production',
      ALLOW_PUBLIC_REGISTRATION: 'true',
    },
  }],
};
