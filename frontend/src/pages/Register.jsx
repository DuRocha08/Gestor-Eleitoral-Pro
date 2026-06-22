import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPost } from '../utils/api.js';
import { AuthBrandPanel, AlertBox } from '../components/ui/ExecutiveUI.jsx';
import { CARGOS_POLITICOS, MARCA_SISTEMA, NOME_SISTEMA } from '../constants/cargosPoliticos.js';

function Register() {
  const navigate = useNavigate();
  const [nome,           setNome]           = useState('');
  const [nomeCandidato,  setNomeCandidato]  = useState('');
  const [email,          setEmail]          = useState('');
  const [senha,          setSenha]          = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [telefone,       setTelefone]       = useState('');
  const [cargoPolitico,  setCargoPolitico]  = useState('deputado_estadual');
  const [municipio,      setMunicipio]      = useState('');
  const [uf,             setUf]             = useState('');
  const [anoEleicao,     setAnoEleicao]     = useState(String(new Date().getFullYear() + 2));
  const [modoSistema,    setModoSistema]    = useState('campanha');
  const [carregando,     setCarregando]     = useState(false);
  const [erro,           setErro]           = useState('');
  const [sucesso,        setSucesso]        = useState('');

  function validarFormulario() {
    if (!nome.trim()) {
      setErro('Informe seu nome.');
      return false;
    }
    if (!nomeCandidato.trim()) {
      setErro('Informe o nome do candidato ou gabinete.');
      return false;
    }
    if (!email.trim()) {
      setErro('Informe o e-mail.');
      return false;
    }
    if (uf.trim() && !/^[A-Za-z]{2}$/.test(uf.trim())) {
      setErro('Informe uma UF valida com duas letras.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErro('Informe um e-mail valido.');
      return false;
    }
    if (!senha || senha.length < 12 || !/[A-Z]/.test(senha) || !/[a-z]/.test(senha) ||
        !/[0-9]/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
      setErro('A senha precisa ter 12 caracteres e incluir maiuscula, minuscula, numero e caractere especial.');
      return false;
    }
    if (new TextEncoder().encode(senha).length > 72) {
      setErro('A senha deve ter no maximo 72 bytes.');
      return false;
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas nao conferem.');
      return false;
    }
    const ano = Number(anoEleicao);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      setErro('Informe um ano de eleicao valido.');
      return false;
    }
    return true;
  }

  async function handleSubmit(evento) {
    evento.preventDefault();
    setErro('');
    setSucesso('');

    if (!validarFormulario()) return;

    setCarregando(true);
    try {
      const resposta = await apiPost('/auth/register', {
        nova_conta:    true,
        nome:          nome.trim(),
        nome_candidato: nomeCandidato.trim(),
        email:         email.trim().toLowerCase(),
        senha,
        telefone:      telefone.trim() || undefined,
        cargo_politico: cargoPolitico,
        municipio:     municipio.trim() || undefined,
        uf:            uf.trim().toUpperCase() || undefined,
        ano_eleicao:   parseInt(anoEleicao, 10) || undefined,
        modo_sistema:  modoSistema,
      });

      setSucesso(resposta.mensagem || 'Conta criada! Redirecionando para o login...');
      setTimeout(function() {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err) {
      if (err.status === 409) {
        setErro('Este e-mail ja esta cadastrado.');
      } else if (err.status === 0) {
        setErro(err.message);
      } else {
        setErro(err.message || 'Nao foi possivel criar a conta.');
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <AuthBrandPanel
        titulo="Criar sua conta"
        descricao="Crie sua conta e comece a importar eleitores, registrar demandas e monitorar o crescimento da sua campanha."
      />

      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-lg py-8">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-6">
            <img
              src={MARCA_SISTEMA}
              alt="Símbolo do Gestor Eleitoral"
              width="36"
              height="36"
              className="w-9 h-9 object-contain"
            />
            <p className="section-eyebrow">{NOME_SISTEMA}</p>
          </div>
          <div className="card p-8">
            <h2 className="text-xl font-semibold text-slate-900">Cadastro</h2>
            <p className="page-subtitle mb-6">{NOME_SISTEMA}</p>

            {erro   && <AlertBox tipo="erro">{erro}</AlertBox>}
            {sucesso && <AlertBox tipo="sucesso">{sucesso}</AlertBox>}

            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label htmlFor="cargo" className="label">Cargo politico</label>
                <select
                  id="cargo"
                  className="input"
                  value={cargoPolitico}
                  onChange={function(e) { setCargoPolitico(e.target.value); }}
                  disabled={carregando}
                  required
                >
                  {CARGOS_POLITICOS.map(function(c) {
                    return <option key={c.valor} value={c.valor}>{c.rotulo}</option>;
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="modoSistema" className="label">Tipo de operação</label>
                  <select
                    id="modoSistema"
                    className="input"
                    value={modoSistema}
                    onChange={function(e) { setModoSistema(e.target.value); }}
                    disabled={carregando}
                  >
                    <option value="campanha">Campanha eleitoral</option>
                    <option value="gabinete">Gestão de gabinete</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="anoEleicao" className="label">Ano de referência</label>
                  <input
                    id="anoEleicao"
                    type="number"
                    min="2000"
                    max="2100"
                    inputMode="numeric"
                    className="input"
                    value={anoEleicao}
                    onChange={function(e) { setAnoEleicao(e.target.value); }}
                    disabled={carregando}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="nomeCandidato" className="label">Nome do candidato / gabinete</label>
                <input
                  id="nomeCandidato"
                  type="text"
                  maxLength={255}
                  className="input"
                  value={nomeCandidato}
                  onChange={function(e) { setNomeCandidato(e.target.value); }}
                  disabled={carregando}
                  autoComplete="organization"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_5rem] gap-3">
                <div>
                  <label htmlFor="municipio" className="label">Municipio</label>
                  <input
                    id="municipio"
                    type="text"
                    maxLength={150}
                    className="input"
                    value={municipio}
                    onChange={function(e) { setMunicipio(e.target.value); }}
                    disabled={carregando}
                    autoComplete="address-level2"
                  />
                </div>
                <div>
                  <label htmlFor="uf" className="label">UF</label>
                  <input
                    id="uf"
                    type="text"
                    maxLength={2}
                    className="input"
                    value={uf}
                    onChange={function(e) { setUf(e.target.value); }}
                    disabled={carregando}
                    autoComplete="address-level1"
                    inputMode="text"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="nome" className="label">Seu nome (responsavel)</label>
                <input
                  id="nome"
                  type="text"
                  maxLength={255}
                  className="input"
                  value={nome}
                  onChange={function(e) { setNome(e.target.value); }}
                  disabled={carregando}
                  autoComplete="name"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="label">E-mail</label>
                <input
                  id="email"
                  type="email"
                  maxLength={255}
                  className="input"
                  value={email}
                  onChange={function(e) { setEmail(e.target.value); }}
                  disabled={carregando}
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label htmlFor="telefone" className="label">Telefone <span className="font-normal text-slate-400">(opcional)</span></label>
                <input
                  id="telefone"
                  type="tel"
                  maxLength={20}
                  className="input"
                  value={telefone}
                  onChange={function(e) { setTelefone(e.target.value); }}
                  disabled={carregando}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div>
                <label htmlFor="senha" className="label">Senha</label>
                <input
                  id="senha"
                  type="password"
                  className="input"
                  value={senha}
                  onChange={function(e) { setSenha(e.target.value); }}
                  disabled={carregando}
                  autoComplete="new-password"
                  aria-describedby="requisitos-senha"
                  required
                />
                <p id="requisitos-senha" className="text-xs text-slate-400 mt-1.5">
                  Mínimo de 12 caracteres, com maiúscula, minúscula, número e caractere especial.
                </p>
              </div>

              <div>
                <label htmlFor="confirmarSenha" className="label">Confirmar senha</label>
                <input
                  id="confirmarSenha"
                  type="password"
                  className="input"
                  value={confirmarSenha}
                  onChange={function(e) { setConfirmarSenha(e.target.value); }}
                  disabled={carregando}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={carregando}>
                {carregando ? 'Salvando...' : 'Criar conta'}
              </button>

            </form>

            <p className="text-center text-sm text-slate-600 mt-6">
              Ja tem conta?{' '}
              <Link to="/login" className="text-blue-600 font-medium hover:underline">
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
