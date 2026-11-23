import React, { useEffect } from 'react';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import {
  formatCurrency,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
  TransactionType,
} from '../types';

interface LaunchPopupsProps {
  step: 'payment' | 'type' | null;
  description: string;
  amount: number;
  selectedPayment: PaymentMethod | null;
  isSaving: boolean;
  onSelectPayment: (method: PaymentMethod) => void;
  onBackToPayment: () => void;
  onSelectTypeAndSave: (type: TransactionType) => void;
  onClose: () => void;
}

export const LaunchPopups: React.FC<LaunchPopupsProps> = ({
  step,
  description,
  amount,
  selectedPayment,
  isSaving,
  onSelectPayment,
  onBackToPayment,
  onSelectTypeAndSave,
  onClose,
}) => {
  useEffect(() => {
    if (!step) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, isSaving, onClose]);

  if (!step) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h2 id="popup-title" className="text-base font-semibold text-slate-900">
              {step === 'payment' ? 'Forma de pagamento' : 'Entrada ou Saída?'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {description} · <span className="font-mono tabular-nums font-medium text-slate-800">{formatCurrency(amount)}</span>
              {step === 'type' && selectedPayment ? ` · ${PAYMENT_METHOD_LABELS[selectedPayment]}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Fechar"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'payment' && (
          <div className="p-6 space-y-2.5">
            {PAYMENT_METHODS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelectPayment(option.value)}
                className="w-full min-h-[48px] px-4 py-3 text-left text-sm font-medium text-slate-900 bg-slate-50 hover:bg-slate-900 hover:text-white border border-slate-200 hover:border-slate-900 rounded-lg transition-colors duration-150 flex items-center justify-between cursor-pointer"
              >
                <span>{option.label}</span>
              </button>
            ))}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {step === 'type' && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onSelectTypeAndSave('entrada')}
                className="min-h-[72px] px-4 py-4 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-emerald-800 font-semibold text-base transition-colors duration-150 flex flex-col items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowDownLeft className="w-5 h-5" />
                <span>Entrada</span>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => onSelectTypeAndSave('saida')}
                className="min-h-[72px] px-4 py-4 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-600 hover:text-white hover:border-rose-600 text-rose-800 font-semibold text-base transition-colors duration-150 flex flex-col items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowUpRight className="w-5 h-5" />
                <span>Saída</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={onBackToPayment}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
