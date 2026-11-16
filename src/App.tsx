import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { PosView } from './components/PosView';
import { MenuView } from './components/MenuView';

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
      return (
        <div className="min-h-screen bg-[#0a0a0b] text-[#f0e6d3] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#16191f] border border-[#d4af37]/40 rounded-2xl p-6 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#e05252]/20 text-[#e05252] flex items-center justify-center text-2xl font-bold">
              !
            </div>
            <h2 className="font-serif font-bold text-xl text-white">Barbachu POS · Recuperación</h2>
            <p className="text-xs text-[#8b92a0]">
              Se detectó una interrupción temporal en la interfaz (por ejemplo, traducción automática del navegador o recarga de nodo).
            </p>
            <div className="p-3 bg-[#1e222b] rounded-xl text-left font-mono text-[11px] text-[#eed889] truncate">
              {this.state.error?.message || 'Error de sincronización'}
            </div>
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
  // Check URL query param or hash for initial view
  const [activeView, setActiveView] = useState<'pos' | 'menu'>(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('view') === 'menu') return 'menu';
      if (window.location.pathname.startsWith('/menu')) return 'menu';
    }
    return 'pos';
  });

  // Keep URL updated smoothly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeView === 'menu') {
      params.set('view', 'menu');
    } else {
      params.delete('view');
    }
    const newRelativePathQuery = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState(null, '', newRelativePathQuery);
  }, [activeView]);

  return (
    <ErrorBoundary>
      <div className="w-full min-h-screen">
        {activeView === 'pos' ? (
          <PosView onSwitchToMenu={() => setActiveView('menu')} />
        ) : (
          <MenuView onSwitchToPos={() => setActiveView('pos')} />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
