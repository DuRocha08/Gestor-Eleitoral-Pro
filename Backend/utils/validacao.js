function limparTexto(valor, tamanhoMaximo = 255) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  return texto.slice(0, tamanhoMaximo);
}

function somenteDigitos(valor) {
  if (!valor) return null;
  const digitos = String(valor).replace(/\D/g, '');
  return digitos || null;
}

function normalizarEmail(email) {
  const texto = limparTexto(email, 255);
  if (!texto) return null;
  return texto.toLowerCase();
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function ufValida(uf) {
  return /^[A-Z]{2}$/.test(uf || '');
}

function normalizarUf(uf) {
  const texto = limparTexto(uf, 2);
  return texto ? texto.toUpperCase() : null;
}

function uuidValido(valor) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor || '');
}

function cpfValido(valor) {
  const cpf = String(valor || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  function calcularDigito(tamanho) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  }

  return calcularDigito(9) === Number(cpf[9]) &&
    calcularDigito(10) === Number(cpf[10]);
}

function normalizarCpf(valor) {
  if (!valor) return null;
  const cpf = String(valor).replace(/\D/g, '');
  if (cpf.length !== 11) return limparTexto(valor, 14);
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

module.exports = {
  limparTexto,
  somenteDigitos,
  normalizarEmail,
  emailValido,
  ufValida,
  normalizarUf,
  uuidValido,
  cpfValido,
  normalizarCpf,
};
