import React, { useState, useEffect, Component, ErrorInfo, ReactNode, lazy, Suspense } from 'react';

const PosView = lazy(() => import('./components/PosView').then(m => ({ default: m.PosView })));
const MenuView = lazy(() => import('./components/MenuView').then(m => ({ default: m.MenuView })));

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      let parsedFsError: {
        error?: string;
        operationType?: string;
        path?: string | null;
        authInfo?: { email?: string | null };
      } | null = null;
      const rawMsg = this.state.error?.message || '';
      if (rawMsg.startsWith('{') && rawMsg.includes('"operationType"')) {
        try {
          parsedFsError = JSON.parse(rawMsg);
        } catch {
          parsedFsError = null;
        }
      }

      return (
        <div className="min-h-dvh bg-[#0a0a0b] text-[#f0e6d3] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#16191f] border border-[#d4af37]/40 rounded-2xl p-6 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#e05252]/20 text-[#e05252] flex items-center justify-center text-2xl font-bold">
              !
            </div>
            <h2 className="font-serif font-bold text-xl text-white">Barbachu POS · Recuperación</h2>
            {parsedFsError ? (
              <div className="space-y-2 text-left bg-[#1e222b] border border-[#2a2f3a] rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-[#8b92a0]">
                  <span>Error de Permisos / Sincronización</span>
                  <span className="font-mono text-[#d4af37]">{parsedFsError.operationType || 'read/write'}</span>
                </div>
                {parsedFsError.path && (
                  <p className="text-xs font-mono text-gray-300 break-all">
                    Ruta: {parsedFsError.path}
                  </p>
                )}
                {parsedFsError.authInfo?.email && (
                  <p className="text-xs text-[#8b92a0] break-all">
                    Cuenta: {parsedFsError.authInfo.email}
                  </p>
                )}
                <p className="text-xs text-[#eed889] break-words">
                  {parsedFsError.error || 'No fue posible completar la operación en Firestore.'}
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-[#8b92a0]">
                  Se detectó una interrupción temporal en la interfaz (por ejemplo, traducción automática del navegador o recarga de nodo).
                </p>
                <div className="p-3 bg-[#1e222b] rounded-xl text-left font-mono text-xs text-[#eed889] break-words max-h-28 overflow-auto">
                  {rawMsg || 'Error de sincronización'}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#eed889] text-black font-bold text-xs uppercase tracking-wider hover:opacity-95 shadow-lg"
            >
              Reiniciar Sistema POS
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'pos' | 'menu'>(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('view') === 'pos') return 'pos';
      if (window.location.pathname.startsWith('/pos')) return 'pos';
    }
    return 'menu';
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeView === 'pos') {
      params.set('view', 'pos');
    } else {
      params.delete('view');
    }
    const newRelativePathQuery = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState(null, '', newRelativePathQuery);

    // Rule 6: At /pos, add <meta name="robots" content="noindex, nofollow">
    let metaRobots = document.querySelector('meta[name="robots"]');
    if (activeView === 'pos') {
      if (!metaRobots) {
        metaRobots = document.createElement('meta');
        metaRobots.setAttribute('name', 'robots');
        document.head.appendChild(metaRobots);
      }
      metaRobots.setAttribute('content', 'noindex, nofollow');
    } else if (metaRobots) {
      metaRobots.remove();
    }
  }, [activeView]);

  return (
    <ErrorBoundary>
      <div className="w-full min-h-dvh">
        <Suspense fallback={
          <div className="min-h-dvh bg-[#0a0a0b] text-[#f0e6d3] flex items-center justify-center">
            <div className="text-xs uppercase tracking-widest text-[#c8a84b] font-bold">Cargando Barbachu...</div>
          </div>
        }>
          {activeView === 'pos' ? (
            <PosView onSwitchToMenu={() => setActiveView('menu')} />
          ) : (
            <MenuView onSwitchToPos={() => setActiveView('pos')} />
          )}
        </Suspense>
      </div>
    </ErrorBoundary>
  );
};

export default App;
