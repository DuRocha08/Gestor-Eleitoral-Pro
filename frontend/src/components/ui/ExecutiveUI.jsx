import { MARCA_SISTEMA, NOME_SISTEMA } from '../../constants/cargosPoliticos.js';

export function BadgeStatus({ status }) {
  const cores = {
    confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    provavel: 'bg-blue-50 text-blue-700 border-blue-200',
    indeciso: 'bg-amber-50 text-amber-700 border-amber-200',
    oposicao: 'bg-red-50 text-red-700 border-red-200',
    abstencao: 'bg-slate-100 text-slate-600 border-slate-200',
    aberta: 'bg-amber-50 text-amber-700 border-amber-200',
    em_analise: 'bg-amber-50 text-amber-700 border-amber-200',
    em_andamento: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  const classe = cores[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  const texto = status ? status.replace(/_/g, ' ') : '-';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium capitalize rounded-full border ${classe}`}>
      {texto}
    </span>
  );
}

export function BadgeNivel({ nivel }) {
  const cores = {
    admin: 'bg-slate-800 text-white border-slate-800',
    coordenador: 'bg-blue-50 text-blue-700 border-blue-200',
    operador: 'bg-slate-100 text-slate-700 border-slate-200',
    visualizador: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  const texto = nivel || 'usuario';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium capitalize rounded-full border ${cores[nivel] || cores.operador}`}>
      {texto}
    </span>
  );
}

export function KpiCard({ titulo, valor, subtitulo, carregando }) {
  return (
    <article className="card relative overflow-hidden p-5 transition-shadow duration-200 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-blue-400" aria-hidden="true" />
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{titulo}</p>
      {carregando ? (
        <div className="h-8 w-24 bg-slate-200 rounded mt-2 animate-pulse" />
      ) : (
        <p className="text-2xl font-semibold text-slate-950 tracking-tight mt-2">{valor}</p>
      )}
      {subtitulo && <p className="text-xs text-slate-500 mt-1">{subtitulo}</p>}
    </article>
  );
}

export function AuthBrandPanel({ titulo, descricao }) {
  return (
    <div className="auth-brand-panel hidden lg:flex lg:w-2/5 text-white flex-col justify-between px-12 py-12">
      <div className="flex items-center gap-3">
        <img
          src={MARCA_SISTEMA}
          alt="Símbolo do Gestor Eleitoral"
          width="44"
          height="44"
          className="w-11 h-11 object-contain"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
          {NOME_SISTEMA}
        </p>
      </div>
      <div>
        <h1 className="text-2xl font-semibold leading-snug">{titulo}</h1>
        <p className="text-sm text-slate-300 mt-4 leading-relaxed max-w-xs">
          {descricao}
        </p>
      </div>
      <p className="text-xs text-slate-400">Gestor Eleitoral - v1.0</p>
    </div>
  );
}

export function AlertBox({ tipo, children, className = '' }) {
  const estilos = {
    erro: 'bg-red-50 border-red-200 text-red-800',
    aviso: 'bg-amber-50 border-amber-200 text-amber-800',
    sucesso: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  return (
    <div
      role={tipo === 'erro' || tipo === 'aviso' ? 'alert' : 'status'}
      aria-live={tipo === 'erro' ? 'assertive' : 'polite'}
      className={`mb-4 px-3.5 py-3 text-sm border rounded-lg ${estilos[tipo] || estilos.info} ${className}`}
    >
      {children}
    </div>
  );
}
