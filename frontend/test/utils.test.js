import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizarChavePlanilha,
  numeroPlanilha,
  valorPlanilha,
} from '../src/utils/planilhaDados.js';
import { obterConfigDashboard } from '../src/utils/dashboardKpis.js';

test('normaliza cabecalhos de planilha com acentos e simbolos', function() {
  assert.equal(normalizarChavePlanilha('Valor (R$)'), 'valorr');
  assert.equal(normalizarChavePlanilha('Intenção de Voto'), 'intencaodevoto');
});

test('localiza valores por cabecalhos equivalentes', function() {
  const linha = { 'Descrição': 'Material grafico', 'Valor (R$)': '1.234,56' };
  assert.equal(valorPlanilha(linha, 'Descricao'), 'Material grafico');
  assert.equal(valorPlanilha(linha, 'Valor (R$)'), '1.234,56');
});

test('converte valores monetarios brasileiros com seguranca', function() {
  assert.equal(numeroPlanilha('R$ 1.234,56'), 1234.56);
  assert.equal(numeroPlanilha('valor invalido'), 0);
});

test('mantem configuracao de dashboard coerente com cargo e modo', function() {
  assert.equal(obterConfigDashboard('prefeito', 'campanha').tituloPainel, 'Painel Municipal');
  assert.match(obterConfigDashboard('vereador', 'gabinete').subtituloPainel, /Gabinete/);
});
