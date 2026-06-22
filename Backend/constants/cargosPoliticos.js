// lista de cargos politicos que o sistema aceita — tem que bater com o ENUM no PostgreSQL
const CARGOS_POLITICOS = [
  'governador',
  'senador',
  'deputado_federal',
  'deputado_estadual',
  'prefeito',
  'vereador',
];

// aqui eu mapeio o valor interno pro rotulo que aparece na tela
const ROTULOS_CARGO = {
  governador:        'Governador',
  senador:           'Senador',
  deputado_federal:  'Deputado Federal',
  deputado_estadual: 'Deputado Estadual/Distrital',
  prefeito:          'Prefeito',
  vereador:          'Vereador',
};

// escopo de cada cargo — uso isso pra ajustar os textos do painel
const ESCOPO_CARGO = {
  governador:        'estadual',
  senador:           'estadual',
  deputado_federal:  'federal',
  deputado_estadual: 'regional',
  prefeito:          'municipal',
  vereador:          'municipal',
};

// verifica se o cargo informado e valido
function cargoValido(cargo) {
  return CARGOS_POLITICOS.includes(cargo);
}

// retorna o rotulo legivel do cargo, ou o proprio valor se nao achar
function rotuloCargo(cargo) {
  return ROTULOS_CARGO[cargo] || cargo;
}

module.exports = {
  CARGOS_POLITICOS,
  ROTULOS_CARGO,
  ESCOPO_CARGO,
  cargoValido,
  rotuloCargo,
};
