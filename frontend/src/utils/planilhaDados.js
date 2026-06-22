export function normalizarChavePlanilha(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9%]/g, '')
    .toLowerCase();
}

export function valorPlanilha(registro, ...alternativas) {
  if (!registro || typeof registro !== 'object') return null;
  const entradas = Object.entries(registro);
  for (const alternativa of alternativas) {
    const procurada = normalizarChavePlanilha(alternativa);
    const encontrada = entradas.find(([chave]) => normalizarChavePlanilha(chave) === procurada);
    if (encontrada && encontrada[1] !== '' && encontrada[1] != null) return encontrada[1];
  }
  return null;
}

export function numeroPlanilha(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor ?? '').replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!texto) return 0;
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto;
  const numero = Number.parseFloat(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}
