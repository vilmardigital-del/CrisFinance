import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { LogOut } from 'lucide-react';
import { DateListPage } from './components/DateListPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LaunchPage } from './components/LaunchPage';
import { ReportsPage } from './components/ReportsPage';
import { auth, googleProvider } from './firebase';
import {
  createTransactionWithSavedDescription,
  removeSavedDescription,
  removeTransaction,
  subscribeSavedDescriptions,
  subscribeTransactions,
} from './services/financeService';
import {
  AppPage,
  PaymentMethod,
  SavedDescriptionRecord,
  TransactionRecord,
  TransactionType,
} from './types';

function CrisFinanceApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [activePage, setActivePage] = useState<AppPage>('lancamento');
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [savedDescriptions, setSavedDescriptions] = useState<SavedDescriptionRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setTransactions([]);
        setSavedDescriptions([]);
        setLoadingData(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    setLoadingData(true);
    let txLoaded = false;
    let descLoaded = false;

    const markLoaded = () => {
      if (txLoaded && descLoaded) {
        setLoadingData(false);
      }
    };

    const unsubTx = subscribeTransactions(user.uid, (items) => {
      setTransactions(items);
      txLoaded = true;
      markLoaded();
    });

    const unsubDesc = subscribeSavedDescriptions(user.uid, (items) => {
      setSavedDescriptions(items);
      descLoaded = true;
      markLoaded();
    });

    return () => {
      unsubTx();
      unsubDesc();
    };
  }, [authReady, user]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Não foi possível entrar.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleSaveTransaction = async (payload: {
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    type: TransactionType;
  }) => {
    if (!user) return;
    await createTransactionWithSavedDescription({
      userId: user.uid,
      ...payload,
    });
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!user) return;
    await removeTransaction(user.uid, id);
  };

  const handleDeleteSavedDescription = async (id: string) => {
    if (!user) return;
    await removeSavedDescription(user.uid, id);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-8 space-y-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            CrisFinance
          </h1>

          <button
            type="button"
            disabled={signingIn}
            onClick={() => void handleGoogleSignIn()}
            className="w-full min-h-[48px] px-5 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            {signingIn ? 'Entrando...' : 'Entrar com Google'}
          </button>

          {authError && (
            <p role="alert" className="text-xs text-rose-700 break-words">
              {authError}
            </p>
          )}
        </div>
      </div>
    );
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
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            CrisFinance
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

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Navegação móvel compacta */}
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
