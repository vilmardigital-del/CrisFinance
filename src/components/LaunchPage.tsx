import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Trash2, X } from 'lucide-react';
import {
  formatAutoDateNow,
  formatCurrency,
  formatDateKeyPtBr,
  formatTimeFromTimestamp,
  MAX_AMOUNT_VALUE,
  MAX_DESCRIPTION_LENGTH,
  parseAmountInput,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  SavedDescriptionRecord,
  TransactionRecord,
  TransactionType,
} from '../types';
import { LaunchPopups } from './LaunchPopups';

interface LaunchPageProps {
  transactions: TransactionRecord[];
  savedDescriptions: SavedDescriptionRecord[];
  loading: boolean;
  onSaveTransaction: (payload: {
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    type: TransactionType;
  }) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onDeleteSavedDescription: (id: string) => Promise<void>;
}

export const LaunchPage: React.FC<LaunchPageProps> = ({
  transactions,
  savedDescriptions,
  loading,
  onSaveTransaction,
  onDeleteTransaction,
  onDeleteSavedDescription,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<TransactionType>('entrada');

  const [popupStep, setPopupStep] = useState<'payment' | 'type' | null>(null);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const descriptionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredSavedDescriptions = useMemo(() => {
    const query = description.trim().toLowerCase();
    if (!query) return savedDescriptions;
    return savedDescriptions.filter((item) =>
      item.text.toLowerCase().includes(query)
    );
  }, [savedDescriptions, description]);

  const entradas = useMemo(
    () => transactions.filter((tx) => tx.type === 'entrada'),
    [transactions]
  );

  const saidas = useMemo(
    () => transactions.filter((tx) => tx.type === 'saida'),
    [transactions]
  );

  const totalEntradas = useMemo(
    () => entradas.reduce((sum, tx) => sum + tx.amount, 0),
    [entradas]
  );

  const totalSaidas = useMemo(
    () => saidas.reduce((sum, tx) => sum + tx.amount, 0),
    [saidas]
  );

  const visibleTransactions = activeView === 'entrada' ? entradas : saidas;

  const handleOpenPopups = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanDescription = description.trim();
    if (!cleanDescription) {
      setFormError('Informe a descrição do serviço.');
      descriptionInputRef.current?.focus();
      return;
    }

    const parsedAmount = parseAmountInput(amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > MAX_AMOUNT_VALUE) {
      setFormError('Informe um valor válido maior que zero.');
      return;
    }

    setPendingAmount(parsedAmount);
    setSelectedPayment(null);
    setPopupStep('payment');
  };

  const handleSelectPayment = (method: PaymentMethod) => {
    setSelectedPayment(method);
    setPopupStep('type');
  };

  const handleSelectTypeAndSave = async (type: TransactionType) => {
    if (!selectedPayment || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveTransaction({
        description: description.trim(),
        amount: pendingAmount,
        paymentMethod: selectedPayment,
        type,
      });
      setDescription('');
      setAmountInput('');
      setPendingAmount(0);
      setSelectedPayment(null);
      setPopupStep(null);
      setActiveView(type);
      setNow(new Date());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar lançamento.');
      setPopupStep(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClosePopups = () => {
    if (isSaving) return;
    setPopupStep(null);
    setSelectedPayment(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Formulário de Lançamento */}
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-baseline justify-between gap-4 pb-5 border-b border-slate-200">
          <h1 className="text-lg font-semibold text-slate-900">Novo Lançamento</h1>
          <span className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
            {formatAutoDateNow(now)}
          </span>
        </div>

        <form onSubmit={handleOpenPopups} className="mt-5 space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="service-description"
              className="block text-sm font-medium text-slate-700"
            >
              Descrição do serviço
            </label>
            <input
              ref={descriptionInputRef}
              id="service-description"
              type="text"
              maxLength={MAX_DESCRIPTION_LENGTH}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="Ex.: Mercado, Venda, Energia"
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors"
            />

            {filteredSavedDescriptions.length > 0 && (
              <div className="pt-1 flex flex-wrap gap-2">
                {filteredSavedDescriptions.map((item) => (
                  <div
                    key={item.id}
                    className="inline-flex items-center border border-slate-200 bg-slate-50 rounded-lg overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setDescription(item.text);
                        if (formError) setFormError(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {item.text}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover ${item.text}`}
                      onClick={() => void onDeleteSavedDescription(item.id)}
                      className="px-1.5 py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="transaction-amount"
              className="block text-sm font-medium text-slate-700"
            >
              Valor (R$)
            </label>
            <div className="flex gap-2">
              <input
                id="transaction-amount"
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="0,00"
                className="flex-1 min-h-[48px] px-3.5 py-2.5 text-lg font-mono tabular-nums font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors"
              />
              <button
                type="submit"
                className="min-h-[48px] px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Lançar
              </button>
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-sm font-medium text-rose-700">
              {formError}
            </p>
          )}
        </form>
      </section>

      {/* Duas opções de visualização: Entrada e Saída */}
      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveView('entrada')}
            className={`px-6 py-4 text-left transition-colors cursor-pointer border-r border-slate-200 ${
              activeView === 'entrada'
                ? 'bg-emerald-50/60'
                : 'bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                <ArrowDownLeft className="w-4 h-4" />
                Entradas
              </span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {entradas.length}
              </span>
            </div>
            <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-emerald-700">
              {formatCurrency(totalEntradas)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('saida')}
            className={`px-6 py-4 text-left transition-colors cursor-pointer ${
              activeView === 'saida'
                ? 'bg-rose-50/60'
                : 'bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-800">
                <ArrowUpRight className="w-4 h-4" />
                Saídas
              </span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {saidas.length}
              </span>
            </div>
            <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-rose-700">
              {formatCurrency(totalSaidas)}
            </div>
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-10 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : visibleTransactions.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              {activeView === 'entrada'
                ? 'Nenhuma entrada registrada.'
                : 'Nenhuma saída registrada.'}
            </div>
          ) : (
            visibleTransactions.map((tx) => (
              <div
                key={tx.id}
                className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {tx.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <span className="font-mono tabular-nums">
                      {formatDateKeyPtBr(tx.dateKey)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatTimeFromTimestamp(tx.createdAt)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{PAYMENT_METHOD_LABELS[tx.paymentMethod]}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-sm font-semibold font-mono tabular-nums ${
                      tx.type === 'entrada' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {tx.type === 'entrada' ? '+' : '-'} {formatCurrency(tx.amount)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Excluir ${tx.description}`}
                    onClick={() => void onDeleteTransaction(tx.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <LaunchPopups
        step={popupStep}
        description={description.trim()}
        amount={pendingAmount}
        selectedPayment={selectedPayment}
        isSaving={isSaving}
        onSelectPayment={handleSelectPayment}
        onBackToPayment={() => setPopupStep('payment')}
        onSelectTypeAndSave={(type) => void handleSelectTypeAndSave(type)}
        onClose={handleClosePopups}
      />
    </div>
  );
};
