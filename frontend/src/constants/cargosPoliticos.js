// cargos politicos aceitos no sistema
// o campo "valor" tem que bater com o ENUM do banco
export const CARGOS_POLITICOS = [
  { valor: 'governador',        rotulo: 'Governador' },
  { valor: 'senador',           rotulo: 'Senador' },
  { valor: 'deputado_federal',  rotulo: 'Deputado Federal' },
  { valor: 'deputado_estadual', rotulo: 'Deputado Estadual/Distrital' },
  { valor: 'prefeito',          rotulo: 'Prefeito' },
  { valor: 'vereador',          rotulo: 'Vereador' },
];

export const NOME_SISTEMA = 'Gestor Eleitoral';
export const MARCA_SISTEMA = `${import.meta.env.BASE_URL}brand/gestor-eleitoral-marca.png`;
