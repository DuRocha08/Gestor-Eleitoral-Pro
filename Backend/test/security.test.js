const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { limparNomeArquivo, validarArquivoXlsx } = require('../utils/arquivo');
const { cpfValido, normalizarCpf, emailValido, uuidValido } = require('../utils/validacao');
const { gerarTenantSlug } = require('../utils/tenant');
const { salvarPlanilhaEspecial } = require('../services/planilhaService');
const { lerArquivo } = require('../controllers/importController');
const {
  gerarSegredo, gerarCodigoTotp, verificarCodigoTotp,
  criptografarSegredo, descriptografarSegredo,
} = require('../utils/mfa');
const { autorizarAdministradorGlobal, exigirMfaAdministrador } = require('../middlewares/authMiddleware');

function respostaFalsa() {
  return {
    statusCode: 200,
    corpo: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(dados) { this.corpo = dados; return this; },
  };
}

test('limpa controles e caminhos do nome de arquivo', function() {
  assert.equal(limparNomeArquivo('../../segredo\u0000.xlsx'), 'segredo .xlsx');
});

test('rejeita conteudo que finge ser um arquivo XLSX', function() {
  assert.throws(
    function() { validarArquivoXlsx(Buffer.from('PK\x03\x04arquivo-falso')); },
    /XLSX invalido/
  );
});

test('aceita um XLSX pequeno e estruturalmente valido', async function() {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Eleitores').addRow(['nome', 'cpf']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  assert.equal(validarArquivoXlsx(buffer), true);
});

test('validadores recusam identificadores e e-mails malformados', function() {
  assert.equal(uuidValido('nao-e-uuid'), false);
  assert.equal(uuidValido('5f632f9c-f3c6-4f77-8b62-c251742bb236'), true);
  assert.equal(emailValido('sem-arroba.example'), false);
  assert.equal(emailValido('usuario@example.com'), true);
});

test('valida os digitos verificadores do CPF', function() {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('529.982.247-24'), false);
  assert.equal(cpfValido('000.000.000-00'), false);
  assert.equal(normalizarCpf('52998224725'), '529.982.247-25');
});

test('gera slugs seguros e distintos para campanhas simultaneas', function() {
  const primeiro = gerarTenantSlug('João da Silva', 'vereador');
  const segundo = gerarTenantSlug('João da Silva', 'vereador');
  assert.match(primeiro, /^joao-da-silva-vereador-[a-f0-9]{12}$/);
  assert.notEqual(primeiro, segundo);
});

test('recusa tipo de planilha especial desconhecido', async function() {
  await assert.rejects(
    salvarPlanilhaEspecial({
      tipo: 'desconhecido',
      dados: {},
      campanhaId: 'campanha',
      usuarioId: 'usuario',
      nomeArquivo: 'arquivo.xlsx',
    }),
    /Tipo de planilha nao reconhecido/
  );
});

test('recusa dados extraidos acima do limite seguro', async function() {
  await assert.rejects(
    salvarPlanilhaEspecial({
      tipo: 'campanha',
      dados: { conteudo: 'x'.repeat(5 * 1024 * 1024 + 1) },
      campanhaId: 'campanha',
      usuarioId: 'usuario',
      nomeArquivo: 'arquivo.xlsx',
    }),
    /excedem o limite seguro/
  );
});

test('importa CPF numerico com zeros a esquerda e cabecalhos normalizados', async function() {
  const workbook = new ExcelJS.Workbook();
  const aba = workbook.addWorksheet('Eleitores');
  aba.addRow(['Nome Completo', 'CPF']);
  aba.addRow(['Pessoa com zero', 191]);
  aba.addRow(['Pessoa formatada', '529.982.247-25']);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const linhas = await lerArquivo(buffer, 'eleitores.xlsx', {
    'nome completo': 'nome',
    cpf: 'cpf',
  });

  assert.equal(linhas[0].nome, 'Pessoa com zero');
  assert.equal(linhas[0].cpf, '000.000.001-91');
  assert.equal(cpfValido(linhas[0].cpf), true);
  assert.equal(linhas[1].cpf, '529.982.247-25');
});

test('importa CPF formatado de CSV mesmo com diferenca no cabecalho', async function() {
  const csv = Buffer.from('NOME COMPLETO,CPF\nPessoa CSV,529.982.247-25\n');
  const linhas = await lerArquivo(csv, 'eleitores.csv', {
    'nome completo': 'nome',
    cpf: 'cpf',
  });

  assert.equal(linhas[0].nome, 'Pessoa CSV');
  assert.equal(linhas[0].cpf, '529.982.247-25');
  assert.equal(cpfValido(linhas[0].cpf), true);
});

test('preserva a posicao das colunas quando o XLSX comeca com coluna vazia', async function() {
  const workbook = new ExcelJS.Workbook();
  const aba = workbook.addWorksheet('Eleitores');
  aba.getCell('B1').value = 'Nome';
  aba.getCell('C1').value = 'CPF';
  aba.getCell('B2').value = 'Pessoa deslocada';
  aba.getCell('C2').value = '529.982.247-25';

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const linhas = await lerArquivo(buffer, 'eleitores.xlsx', { nome: 'nome', cpf: 'cpf' });

  assert.equal(linhas[0].nome, 'Pessoa deslocada');
  assert.equal(linhas[0].cpf, '529.982.247-25');
  assert.equal(cpfValido(linhas[0].cpf), true);
});

test('gera e valida codigo TOTP sem aceitar codigo incorreto', function() {
  const segredo = gerarSegredo();
  const codigo = gerarCodigoTotp(segredo);
  assert.equal(verificarCodigoTotp(segredo, codigo), true);
  assert.equal(verificarCodigoTotp(segredo, codigo === '000000' ? '000001' : '000000'), false);
});

test('cifra o segredo MFA sem armazenar o valor em texto puro', function() {
  const anterior = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = 'a'.repeat(64) + 'chave-de-teste-distinta';
  try {
    const segredo = gerarSegredo();
    const cifrado = criptografarSegredo(segredo);
    assert.equal(cifrado.includes(segredo), false);
    assert.equal(descriptografarSegredo(cifrado), segredo);
  } finally {
    if (anterior === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = anterior;
  }
});

test('bloqueia usuario comum nas rotas de administrador global', function() {
  const res = respostaFalsa();
  let passou = false;
  autorizarAdministradorGlobal({ usuario:{ administrador_global:false } }, res, function(){ passou=true; });
  assert.equal(res.statusCode, 403);
  assert.equal(passou, false);
});

test('administrador global precisa ativar MFA para gerenciar a plataforma', function() {
  const res = respostaFalsa();
  let passou = false;
  exigirMfaAdministrador({ usuario:{ administrador_global:true,mfa_ativo:false } }, res, function(){ passou=true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.corpo.codigo, 'MFA_OBRIGATORIO');
  assert.equal(passou, false);
});

test('administrador global com MFA passa pelas duas autorizacoes', function() {
  const req = { usuario:{ administrador_global:true,mfa_ativo:true } };
  const res = respostaFalsa();
  let passouGlobal = false; let passouMfa = false;
  autorizarAdministradorGlobal(req, res, function(){ passouGlobal=true; });
  exigirMfaAdministrador(req, res, function(){ passouMfa=true; });
  assert.equal(passouGlobal, true);
  assert.equal(passouMfa, true);
});
