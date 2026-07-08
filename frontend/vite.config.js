import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_GITHUB_PAGES = '/Gestor-Eleitoral-Pro/';

function pluginConfigPublica(urlApi) {
  return {
    name: 'configuracao-publica-api',
    writeBundle(opcoes) {
      const caminho = path.join(opcoes.dir || 'dist', 'api-config.js');
      if (!fs.existsSync(caminho)) return;
      const conteudo = fs.readFileSync(caminho, 'utf8');
      const atualizado = conteudo.replace(
        /window\.API_URL\s*=\s*(['"]).*?\1;/,
        'window.API_URL = ' + JSON.stringify(urlApi) + ';'
      );
      fs.writeFileSync(caminho, atualizado, 'utf8');
    },
  };
}

function lerUrlApiDoArquivo() {
  const arquivo = path.join(__dirname, 'ghpages-url.txt');
  try {
    const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i].trim();
      if (!linha || linha.startsWith('#')) {
        continue;
      }
      return linha.replace(/\/$/, '');
    }
  } catch (e) {
    // arquivo opcional
  }
  return '';
}

export default defineConfig(({ mode }) => {
  const isGitHubPages = mode === 'ghpages';
  const env = loadEnv(mode, process.cwd(), '');

  let urlApi = env.VITE_API_URL || '';
  if (isGitHubPages && !urlApi) {
    urlApi = lerUrlApiDoArquivo();
  }

  return {
    plugins: [react(), pluginConfigPublica(urlApi)],
    base: isGitHubPages ? BASE_GITHUB_PAGES : '/',
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(urlApi),
    },
    build: {
      sourcemap: false,
    },
    server: {
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
