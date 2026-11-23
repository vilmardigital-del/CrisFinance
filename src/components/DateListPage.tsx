import React, { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import {
  formatCurrency,
  formatDateKeyWithWeekday,
  formatTimeFromTimestamp,
  PAYMENT_METHOD_LABELS,
  TransactionRecord,
} from '../types';

interface DateListPageProps {
  transactions: TransactionRecord[];
  loading: boolean;
  onDeleteTransaction: (id: string) => Promise<void>;
}

interface DateGroup {
  dateKey: string;
  items: TransactionRecord[];
  totalEntradas: number;
  totalSaidas: number;
}

export const DateListPage: React.FC<DateListPageProps> = ({
  transactions,
  loading,
  onDeleteTransaction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const groupedByDate = useMemo<DateGroup[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = transactions.filter((tx) => {
      if (selectedDate && tx.dateKey !== selectedDate) return false;
      if (query && !tx.description.toLowerCase().includes(query)) return false;
      return true;
    });

    const groupsMap = new Map<string, DateGroup>();
    for (const tx of filtered) {
      const existing = groupsMap.get(tx.dateKey);
      if (existing) {
        existing.items.push(tx);
        if (tx.type === 'entrada') existing.totalEntradas += tx.amount;
        else existing.totalSaidas += tx.amount;
      } else {
        groupsMap.set(tx.dateKey, {
          dateKey: tx.dateKey,
          items: [tx],
          totalEntradas: tx.type === 'entrada' ? tx.amount : 0,
          totalSaidas: tx.type === 'saida' ? tx.amount : 0,
        });
      }
    }

    return Array.from(groupsMap.values()).sort((a, b) =>
      b.dateKey.localeCompare(a.dateKey)
    );
  }, [transactions, searchQuery, selectedDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-slate-900">Lista por Data</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar descrição"
              className="min-h-[40px] pl-9 pr-3 py-1.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </div>

          <input
            type="date"
            aria-label="Filtrar por data"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
          />

          {(searchQuery || selectedDate) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedDate('');
              }}
              className="min-h-[40px] px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-10 bg-slate-100 rounded animate-pulse" />
          <div className="h-10 bg-slate-100 rounded animate-pulse" />
          <div className="h-10 bg-slate-100 rounded animate-pulse" />
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-14 text-center text-sm text-slate-500">
          Nenhum lançamento encontrado.
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByDate.map((group) => {
            const dailyBalance = group.totalEntradas - group.totalSaidas;
            return (
              <section
                key={group.dateKey}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {formatDateKeyWithWeekday(group.dateKey)}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                    <span className="text-emerald-700">
                      Entradas: {formatCurrency(group.totalEntradas)}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-rose-700">
                      Saídas: {formatCurrency(group.totalSaidas)}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-900">
                      Saldo: {formatCurrency(dailyBalance)}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-6 w-24">Hora</th>
                        <th className="py-2.5 px-4">Descrição</th>
                        <th className="py-2.5 px-4">Pagamento</th>
                        <th className="py-2.5 px-4">Tipo</th>
                        <th className="py-2.5 px-4 text-right">Valor</th>
                        <th className="py-2.5 px-6 text-right w-28">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {group.items.map((tx) => (
                        <tr
                          key={tx.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-3 px-6 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                            {formatTimeFromTimestamp(tx.createdAt)}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {tx.description}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {PAYMENT_METHOD_LABELS[tx.paymentMethod]}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`text-xs font-semibold ${
                                tx.type === 'entrada'
                                  ? 'text-emerald-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              {tx.type === 'entrada' ? 'Entrada' : 'Saída'}
                            </span>
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              tx.type === 'entrada'
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {tx.type === 'entrada' ? '+' : '-'}{' '}
                            {formatCurrency(tx.amount)}
                          </td>
                          <td className="py-3 px-6 text-right whitespace-nowrap">
                            {confirmDeleteId === tx.id ? (
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void onDeleteTransaction(tx.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Excluir ${tx.description}`}
                                onClick={() => setConfirmDeleteId(tx.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
