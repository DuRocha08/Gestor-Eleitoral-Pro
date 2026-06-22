const path = require('path');

function limparNomeArquivo(nome) {
  return path.basename(String(nome || 'arquivo'))
    // Remove controles que podem adulterar logs, terminais ou cabecalhos.
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .slice(0, 255);
}

function erroArquivo(mensagem) {
  const erro = new Error(mensagem);
  erro.status = 422;
  return erro;
}

// Examina o diretorio central do ZIP antes de entregar o XLSX ao ExcelJS.
// Isso limita arquivos compactados criados para esgotar memoria do servidor.
function validarArquivoXlsx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 ||
      buffer.readUInt32LE(0) !== 0x04034b50) {
    throw erroArquivo('Arquivo XLSX invalido.');
  }

  const assinatura = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const nomes = new Set();
  let posicao = 0;
  let entradas = 0;
  let totalCompactado = 0;
  let totalDescompactado = 0;

  while ((posicao = buffer.indexOf(assinatura, posicao)) !== -1) {
    if (posicao + 46 > buffer.length) throw erroArquivo('Estrutura ZIP truncada.');
    const flags = buffer.readUInt16LE(posicao + 8);
    const compactado = buffer.readUInt32LE(posicao + 20);
    const descompactado = buffer.readUInt32LE(posicao + 24);
    const tamanhoNome = buffer.readUInt16LE(posicao + 28);
    const tamanhoExtra = buffer.readUInt16LE(posicao + 30);
    const tamanhoComentario = buffer.readUInt16LE(posicao + 32);
    const fim = posicao + 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;

    if (fim > buffer.length || compactado === 0xffffffff || descompactado === 0xffffffff) {
      throw erroArquivo('Estrutura ZIP nao suportada.');
    }
    if ((flags & 0x0001) !== 0) throw erroArquivo('Planilhas criptografadas nao sao aceitas.');

    const nome = buffer.subarray(posicao + 46, posicao + 46 + tamanhoNome).toString('utf8');
    nomes.add(nome);
    entradas += 1;
    totalCompactado += compactado;
    totalDescompactado += descompactado;
    posicao = fim;

    if (entradas > 1000 || totalDescompactado > 50 * 1024 * 1024) {
      throw erroArquivo('Planilha excede o limite seguro de conteudo.');
    }
  }

  if (entradas === 0 || !nomes.has('[Content_Types].xml') || !nomes.has('xl/workbook.xml')) {
    throw erroArquivo('O arquivo nao possui uma estrutura XLSX valida.');
  }
  if (totalCompactado > 0 && totalDescompactado / totalCompactado > 200) {
    throw erroArquivo('Taxa de compactacao da planilha excede o limite seguro.');
  }
  for (const nome of nomes) {
    const minusculo = nome.toLowerCase();
    if (minusculo.endsWith('vbaproject.bin') || minusculo.includes('/embeddings/')) {
      throw erroArquivo('Planilhas com macros ou objetos incorporados nao sao aceitas.');
    }
  }

  return true;
}

module.exports = { limparNomeArquivo, validarArquivoXlsx };
