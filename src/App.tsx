import { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { BrandLogo } from './components/BrandLogo';
import { DateListPage } from './components/DateListPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LaunchPage } from './components/LaunchPage';
import { ReportsPage } from './components/ReportsPage';
import {
  ApiError,
  createTransactionApi,
  deleteSavedDescriptionApi,
  deleteTransactionApi,
  fetchSavedDescriptionsApi,
  fetchTransactionsApi,
  logoutSessionApi,
  restoreSessionApi,
} from './services/financeService';
import {
  AppPage,
  AuthUser,
  PaymentMethod,
  SavedDescriptionRecord,
  TransactionRecord,
  TransactionType,
} from './types';

function CrisFinanceApp() {
  const [initialSession] = useState(() => restoreSessionApi());
  const [token, setToken] = useState<string | null>(initialSession?.token ?? null);
  const [user, setUser] = useState<AuthUser | null>(initialSession?.user ?? null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const [activePage, setActivePage] = useState<AppPage>('lancamento');
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [savedDescriptions, setSavedDescriptions] = useState<SavedDescriptionRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const handleApiFailure = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      logoutSessionApi();
      setToken(null);
      setUser(null);
      setTransactions([]);
      setSavedDescriptions([]);
      setSessionNotice('Sua sessão expirou. Entre novamente.');
      return;
    }
    setDataError(err instanceof Error ? err.message : 'Erro ao processar os dados.');
  }, []);

  const refreshData = useCallback(
    async (authToken: string) => {
      setLoadingData(true);
      setDataError(null);
      try {
        const [txList, descList] = await Promise.all([
          fetchTransactionsApi(authToken),
          fetchSavedDescriptionsApi(authToken),
        ]);
        setTransactions(txList);
        setSavedDescriptions(descList);
      } catch (err) {
        handleApiFailure(err);
      } finally {
        setLoadingData(false);
      }
    },
    [handleApiFailure]
  );

  useEffect(() => {
    if (!token) {
      setTransactions([]);
      setSavedDescriptions([]);
      return;
    }
    void refreshData(token);
  }, [token, refreshData]);

  const handleAuthenticated = (newToken: string, authUser: AuthUser) => {
    setSessionNotice(null);
    setDataError(null);
    setToken(newToken);
    setUser(authUser);
    setActivePage('lancamento');
  };

  const handleSignOut = () => {
    logoutSessionApi();
    setSessionNotice(null);
    setDataError(null);
    setToken(null);
    setUser(null);
    setTransactions([]);
    setSavedDescriptions([]);
  };

  const handleSaveTransaction = async (payload: {
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    type: TransactionType;
  }) => {
    if (!token) return;
    try {
      await createTransactionApi(token, payload);
      await refreshData(token);
    } catch (err) {
      handleApiFailure(err);
      throw err;
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!token) return;
    try {
      await deleteTransactionApi(token, id);
      await refreshData(token);
    } catch (err) {
      handleApiFailure(err);
    }
  };

  const handleDeleteSavedDescription = async (id: string) => {
    if (!token) return;
    try {
      await deleteSavedDescriptionApi(token, id);
      await refreshData(token);
    } catch (err) {
      handleApiFailure(err);
    }
  };

  if (!token || !user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} initialNotice={sessionNotice} />;
  }

  const navItems: { id: AppPage; label: string }[] = [
    { id: 'lancamento', label: 'Lançamento' },
    { id: 'lista', label: 'Lista por Data' },
    { id: 'relatorios', label: 'Relatórios e Gráficos' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActivePage('lancamento')}
            className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BrandLogo size="sm" />
            <span>CrisFinance</span>
          </button>

          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-6"
          >
            {navItems.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePage(item.id)}
                  className={`py-2 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'text-slate-900 border-slate-900'
                      : 'text-slate-500 border-transparent hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              title={user.email}
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="Navegação móvel"
          className="md:hidden border-t border-slate-200 px-4 flex items-center gap-4 overflow-x-auto"
        >
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={`py-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-slate-900 border-slate-900'
                    : 'text-slate-500 border-transparent hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {dataError && (
          <div
            role="alert"
            className="mb-6 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between gap-4 text-sm text-rose-800"
          >
            <span>{dataError}</span>
            <button
              type="button"
              onClick={() => token && void refreshData(token)}
              className="text-xs font-semibold underline shrink-0 cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {activePage === 'lancamento' && (
          <LaunchPage
            transactions={transactions}
            savedDescriptions={savedDescriptions}
            loading={loadingData}
            onSaveTransaction={handleSaveTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onDeleteSavedDescription={handleDeleteSavedDescription}
          />
        )}

        {activePage === 'lista' && (
          <DateListPage
            transactions={transactions}
            loading={loadingData}
            onDeleteTransaction={handleDeleteTransaction}
          />
        )}

        {activePage === 'relatorios' && (
          <ReportsPage transactions={transactions} loading={loadingData} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CrisFinanceApp />
    </ErrorBoundary>
  );
}
