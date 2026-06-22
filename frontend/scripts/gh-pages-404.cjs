const fs = require('fs');
const path = require('path');

const origem = path.join(__dirname, '..', 'dist', 'index.html');
const destino = path.join(__dirname, '..', 'dist', '404.html');

if (!fs.existsSync(origem)) {
  throw new Error('Execute o build do frontend antes de gerar o fallback 404.');
}

// O GitHub Pages usa 404.html como fallback para rotas do React Router.
fs.copyFileSync(origem, destino);
console.log('Fallback 404 do GitHub Pages criado com sucesso.');
