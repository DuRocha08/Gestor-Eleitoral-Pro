import React, { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import { estaAutenticado, obterUsuario } from './utils/authStorage.js';
import { ROUTER_BASENAME } from './config/appConfig.js';

const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const VotersList = lazy(() => import('./pages/VotersList.jsx'));
const Financeiro = lazy(() => import('./pages/Financeiro.jsx'));
const Demandas = lazy(() => import('./pages/Demandas.jsx'));
const Integracoes = lazy(() => import('./pages/Integracoes.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Security = lazy(() => import('./pages/Security.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const PlatformAdmin = lazy(() => import('./pages/PlatformAdmin.jsx'));

const TITULOS = {
  '/login': 'Entrar',
  '/register': 'Criar conta',
  '/dashboard': 'Painel',
  '/eleitores': 'Eleitores',
  '/financeiro': 'Financeiro',
  '/demandas': 'Demandas',
  '/integracoes': 'Integrações',
  '/admin': 'Administração',
  '/seguranca': 'Segurança',
  '/plataforma': 'Administração da plataforma',
};

function AtualizarTituloPagina() {
  const location = useLocation();
  useEffect(function() {
    document.title = `${TITULOS[location.pathname] || 'Gestão'} | Gestor Eleitoral`;
  }, [location.pathname]);
  return null;
}

function CarregandoRota() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50" role="status" aria-live="polite">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto" aria-hidden="true" />
        <p className="text-sm text-slate-500 mt-3">Carregando...</p>
      </div>
    </div>
  );
}

class LimiteDeErro extends React.Component {
  constructor(props) {
    super(props);
    this.state = { falhou: false };
  }

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  render() {
    if (!this.state.falhou) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="section-eyebrow mb-2">Algo saiu do esperado</p>
          <h1 className="page-title">Não foi possível exibir esta tela</h1>
          <p className="page-subtitle mb-5">Recarregue a página. Seus dados permanecem salvos no servidor.</p>
          <button type="button" className="btn-primary" onClick={function() { window.location.reload(); }}>
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}

function RotaProtegida() {
  const [, atualizar] = React.useState(0);
  React.useEffect(function() {
    function sessaoExpirada() { atualizar(valor => valor + 1); }
    window.addEventListener('gestor:sessao-expirada', sessaoExpirada);
    return function() { window.removeEventListener('gestor:sessao-expirada', sessaoExpirada); };
  }, []);
  return estaAutenticado() ? <Outlet /> : <Navigate to="/login" replace />;
}

function RotaPublica({ children }) {
  return estaAutenticado() ? <Navigate to="/dashboard" replace /> : children;
}

function RotaPorNivel({ niveis, children }) {
  const usuario = obterUsuario();
  return niveis.includes(usuario?.nivel)
    ? children
    : <Navigate to="/dashboard" replace />;
}

function RotaAdministradorGlobal({ children }) {
  const usuario = obterUsuario();
  return usuario?.administrador_global ? children : <Navigate to="/dashboard" replace />;
}

function LayoutPrincipal() {
  const usuario = obterUsuario();
  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#conteudo-principal" className="skip-link">Ir para o conteúdo principal</a>
      <Navbar usuario={usuario} />
      <main id="conteudo-principal" tabIndex={-1} className="min-h-screen overflow-auto lg:ml-60">
        <Outlet />
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AtualizarTituloPagina />
      <LimiteDeErro>
        <Suspense fallback={<CarregandoRota />}>
          <Routes>
            <Route path="/login" element={<RotaPublica><Login /></RotaPublica>} />
            <Route path="/register" element={<RotaPublica><Register /></RotaPublica>} />
            <Route path="/forgot-password" element={<RotaPublica><ForgotPassword /></RotaPublica>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<RotaProtegida />}>
              <Route element={<LayoutPrincipal />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/eleitores" element={<VotersList />} />
                <Route path="/financeiro" element={
                  <RotaPorNivel niveis={['admin', 'coordenador']}>
                    <Financeiro />
                  </RotaPorNivel>
                } />
                <Route path="/demandas" element={<Demandas />} />
                <Route path="/integracoes" element={<RotaPorNivel niveis={['admin','coordenador','operador']}><Integracoes /></RotaPorNivel>} />
                <Route path="/seguranca" element={<Security />} />
                <Route path="/admin" element={<RotaPorNivel niveis={['admin','coordenador']}><Admin /></RotaPorNivel>} />
                <Route path="/plataforma" element={<RotaAdministradorGlobal><PlatformAdmin /></RotaAdministradorGlobal>} />
              </Route>
            </Route>
            <Route path="/" element={<Navigate to={estaAutenticado() ? '/dashboard' : '/login'} replace />} />
            <Route path="*" element={<Navigate to={estaAutenticado() ? '/dashboard' : '/login'} replace />} />
          </Routes>
        </Suspense>
      </LimiteDeErro>
    </BrowserRouter>
  );
}

export default App;
