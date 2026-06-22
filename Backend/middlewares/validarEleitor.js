const { body, validationResult } = require('express-validator');
const { cpfValido } = require('../utils/validacao');

// Mantém os mesmos valores usados pelo ENUM do banco.
const STATUS_VOTO_VALIDOS = [
  'nao_identificado', 'indeciso', 'provavel', 'confirmado', 'oposicao', 'abstencao',
];

const regrasEleitor = [
  body('nome')
    .trim()
    .notEmpty().withMessage('O campo nome e obrigatorio.')
    .isLength({ max: 255 }).withMessage('Nome muito longo (max 255 caracteres).')
    .escape(),

  body('cpf')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/)
    .withMessage('CPF invalido. Use o formato 000.000.000-00.')
    .custom(cpfValido)
    .withMessage('CPF invalido.'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail().withMessage('E-mail invalido.')
    .normalizeEmail()
    .isLength({ max: 255 }),

  body('titulo_eleitor')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Titulo eleitoral muito longo.'),

  body('data_nascimento')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('Data de nascimento invalida.'),

  body('telefone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Telefone muito longo (max 20 caracteres).'),

  body('whatsapp')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('WhatsApp muito longo (max 20 caracteres).'),

  body('endereco')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .escape(),

  body('bairro')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .escape(),

  body('cidade')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .escape(),

  body('observacoes')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Observacoes muito longas (max 2000 caracteres).')
    .escape(),

  body('uf')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^[A-Za-z]{2}$/).withMessage('UF invalida.'),

  body('cep')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^\d{5}-?\d{3}$/).withMessage('CEP invalido.'),

  body('zona_eleitoral')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0, max: 9999 }).withMessage('Zona eleitoral invalida.')
    .toInt(),

  body('secao_eleitoral')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0, max: 9999 }).withMessage('Secao eleitoral invalida.')
    .toInt(),

  body('apoiador_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Identificador de apoiador invalido.'),

  body('status_voto')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(STATUS_VOTO_VALIDOS)
    .withMessage('Status de voto invalido.'),
];

function verificarValidacao(req, res, next) {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(422).json({
      erro: 'Dados invalidos na requisicao.',
      campos: erros.array().map(function (e) {
        return { campo: e.path, mensagem: e.msg };
      }),
    });
  }
  next();
}

module.exports = { regrasEleitor, verificarValidacao };
