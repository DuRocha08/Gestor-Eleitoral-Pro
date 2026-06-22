// Configuração de KPIs do painel conforme cargo político (multi-tenant)

const CONFIG_POR_CARGO = {
  governador: {
    tituloPainel: 'Consolidado Estadual',
    subtituloPainel: 'Visão macro do estado — metas e cobertura territorial',
    kpiEleitores: { titulo: 'Eleitores no Estado', subtitulo: 'Base cadastral consolidada' },
    kpiConfirmados: { titulo: 'Votos confirmados', subtitulo: 'Projeção estadual de intenção' },
    kpiDemandas: { titulo: 'Demandas estaduais', subtitulo: 'Ouvidoria — prioridade regional' },
    kpiFinanceiro: { titulo: 'Balanço da campanha', subtitulo: 'Fluxo financeiro estadual' },
    biTerritorial: 'Mapa estadual por macrorregião',
  },
  senador: {
    tituloPainel: 'Painel Senadoria',
    subtituloPainel: 'Cobertura estadual para mandato no Senado Federal',
    kpiEleitores: { titulo: 'Eleitores cadastrados', subtitulo: 'Rede estadual de apoio' },
    kpiConfirmados: { titulo: 'Apoio confirmado', subtitulo: 'Meta de votos no estado' },
    kpiDemandas: { titulo: 'Demandas pendentes', subtitulo: 'Solicitações por município' },
    kpiFinanceiro: { titulo: 'Saldo de campanha', subtitulo: 'Receitas e despesas aprovadas' },
    biTerritorial: 'Distribuição por município-chave',
  },
  deputado_federal: {
    tituloPainel: 'Painel Deputado Federal',
    subtituloPainel: 'Metas regionais e cinturão eleitoral federal',
    kpiEleitores: { titulo: 'Base eleitoral', subtitulo: 'Cadastros na circunscrição' },
    kpiConfirmados: { titulo: 'Votos confirmados', subtitulo: 'Meta federal por região' },
    kpiDemandas: { titulo: 'Demandas em aberto', subtitulo: 'Ouvidoria do mandato' },
    kpiFinanceiro: { titulo: 'Balanço financeiro', subtitulo: 'Controle de caixa do mandato' },
    biTerritorial: 'Ranking de bairros por conversão',
  },
  deputado_estadual: {
    tituloPainel: 'Painel Deputado Estadual',
    subtituloPainel: 'Metas regionais — assembleia legislativa',
    kpiEleitores: { titulo: 'Eleitores na região', subtitulo: 'Cobertura territorial' },
    kpiConfirmados: { titulo: 'Votos confirmados', subtitulo: 'Meta regional atingida' },
    kpiDemandas: { titulo: 'Demandas pendentes', subtitulo: 'Prioridade por bairro' },
    kpiFinanceiro: { titulo: 'Saldo consolidado', subtitulo: 'Finanças do mandato' },
    biTerritorial: 'Intenção de voto por zona eleitoral',
  },
  prefeito: {
    tituloPainel: 'Painel Municipal',
    subtituloPainel: 'Gestão da campanha prefeitura — visão da cidade',
    kpiEleitores: { titulo: 'Eleitores no município', subtitulo: 'Cadastro municipal' },
    kpiConfirmados: { titulo: 'Votos confirmados', subtitulo: 'Meta municipal' },
    kpiDemandas: { titulo: 'Demandas comunitárias', subtitulo: 'Ouvidoria municipal' },
    kpiFinanceiro: { titulo: 'Balanço de campanha', subtitulo: 'Caixa municipal' },
    biTerritorial: 'Mapa por bairro da cidade',
  },
  vereador: {
    tituloPainel: 'Painel Vereador',
    subtituloPainel: 'Cobertura por bairros e zonas — câmara municipal',
    kpiEleitores: { titulo: 'Eleitores cadastrados', subtitulo: 'Base local de apoio' },
    kpiConfirmados: { titulo: 'Votos confirmados', subtitulo: 'Meta de cadeira' },
    kpiDemandas: { titulo: 'Demandas locais', subtitulo: 'Prioridade de bairro' },
    kpiFinanceiro: { titulo: 'Saldo financeiro', subtitulo: 'Controle de despesas' },
    biTerritorial: 'Concentração por seção eleitoral',
  },
};

const CONFIG_PADRAO = {
  tituloPainel: 'Painel Executivo',
  subtituloPainel: 'Métricas consolidadas da sua instância',
  kpiEleitores: { titulo: 'Eleitores cadastrados', subtitulo: 'Base territorial' },
  kpiConfirmados: { titulo: 'Votos confirmados', subtitulo: 'Conversão da base' },
  kpiDemandas: { titulo: 'Demandas pendentes', subtitulo: 'Ouvidoria' },
  kpiFinanceiro: { titulo: 'Balanço financeiro', subtitulo: 'Receitas − despesas' },
  biTerritorial: 'Análise territorial',
};

export function obterConfigDashboard(cargoPolitico, modoSistema) {
  const base = CONFIG_POR_CARGO[cargoPolitico] || CONFIG_PADRAO;
  if (modoSistema === 'gabinete') {
    return {
      ...base,
      tituloPainel: base.tituloPainel.replace('Campanha', 'Gabinete').replace('Painel', 'Gabinete'),
      subtituloPainel: 'Modo Gestão de Gabinete — pós-eleição',
    };
  }
  return base;
}
