import React, { useMemo, useState } from 'react';
import {
  formatCurrency,
  formatDateKeyPtBr,
  getLocalDateKey,
  PAYMENT_METHODS,
  PaymentMethod,
  TransactionRecord,
} from '../types';

interface ReportsPageProps {
  transactions: TransactionRecord[];
  loading: boolean;
}

type PeriodFilter = 'all' | 'month' | 'today';

interface CategoryRow {
  category: string;
  count: number;
  entradas: number;
  saidas: number;
  totalGross: number;
  sharePercent: number;
}

interface DailyBarPoint {
  dateKey: string;
  label: string;
  entradas: number;
  saidas: number;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  transactions,
  loading,
}) => {
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const filteredTransactions = useMemo(() => {
    if (period === 'all') return transactions;
    const todayKey = getLocalDateKey(new Date());
    if (period === 'today') {
      return transactions.filter((tx) => tx.dateKey === todayKey);
    }
    const monthPrefix = todayKey.slice(0, 7);
    return transactions.filter((tx) => tx.dateKey.startsWith(monthPrefix));
  }, [transactions, period]);

  const grossSummary = useMemo(() => {
    let totalEntradas = 0;
    let totalSaidas = 0;
    const byPayment: Record<
      PaymentMethod,
      { entradas: number; saidas: number; count: number }
    > = {
      pix: { entradas: 0, saidas: 0, count: 0 },
      moeda: { entradas: 0, saidas: 0, count: 0 },
      debito: { entradas: 0, saidas: 0, count: 0 },
      credito: { entradas: 0, saidas: 0, count: 0 },
      boleto: { entradas: 0, saidas: 0, count: 0 },
    };

    for (const tx of filteredTransactions) {
      if (tx.type === 'entrada') {
        totalEntradas += tx.amount;
        byPayment[tx.paymentMethod].entradas += tx.amount;
      } else {
        totalSaidas += tx.amount;
        byPayment[tx.paymentMethod].saidas += tx.amount;
      }
      byPayment[tx.paymentMethod].count += 1;
    }

    return {
      totalEntradas,
      totalSaidas,
      saldoBruto: totalEntradas - totalSaidas,
      volumeBruto: totalEntradas + totalSaidas,
      count: filteredTransactions.length,
      byPayment,
    };
  }, [filteredTransactions]);

  const categoryRows = useMemo<CategoryRow[]>(() => {
    const map = new Map<
      string,
      { category: string; count: number; entradas: number; saidas: number }
    >();

    for (const tx of filteredTransactions) {
      const normalizedKey = tx.description.trim().toLowerCase();
      const existing = map.get(normalizedKey);
      if (existing) {
        existing.count += 1;
        if (tx.type === 'entrada') existing.entradas += tx.amount;
        else existing.saidas += tx.amount;
      } else {
        map.set(normalizedKey, {
          category: tx.description.trim(),
          count: 1,
          entradas: tx.type === 'entrada' ? tx.amount : 0,
          saidas: tx.type === 'saida' ? tx.amount : 0,
        });
      }
    }

    const totalVolume = grossSummary.volumeBruto;
    return Array.from(map.values())
      .map((item) => {
        const totalGross = item.entradas + item.saidas;
        return {
          ...item,
          totalGross,
          sharePercent: totalVolume > 0 ? (totalGross / totalVolume) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalGross - a.totalGross);
  }, [filteredTransactions, grossSummary.volumeBruto]);

  const dailySeries = useMemo<DailyBarPoint[]>(() => {
    const map = new Map<string, DailyBarPoint>();
    for (const tx of filteredTransactions) {
      const existing = map.get(tx.dateKey);
      if (existing) {
        if (tx.type === 'entrada') existing.entradas += tx.amount;
        else existing.saidas += tx.amount;
      } else {
        map.set(tx.dateKey, {
          dateKey: tx.dateKey,
          label: formatDateKeyPtBr(tx.dateKey).slice(0, 5),
          entradas: tx.type === 'entrada' ? tx.amount : 0,
          saidas: tx.type === 'saida' ? tx.amount : 0,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .slice(-14);
  }, [filteredTransactions]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-40 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  const maxDailyValue = Math.max(
    1,
    ...dailySeries.map((d) => Math.max(d.entradas, d.saidas))
  );
  const maxCategoryValue = Math.max(
    1,
    ...categoryRows.map((c) => c.totalGross)
  );
  const maxGrossBar = Math.max(
    1,
    grossSummary.totalEntradas,
    grossSummary.totalSaidas
  );

  const hoveredDay = hoveredDateKey
    ? dailySeries.find((d) => d.dateKey === hoveredDateKey) ?? null
    : null;
  const hoveredCat = hoveredCategory
    ? categoryRows.find((c) => c.category === hoveredCategory) ?? null
    : null;

  return (
    <div className="space-y-8">
      {/* Cabeçalho e filtro de período */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-slate-900">
          Relatórios e Gráficos
        </h1>

        <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-lg self-start">
          {(
            [
              { id: 'all', label: 'Todo o período' },
              { id: 'month', label: 'Este mês' },
              { id: 'today', label: 'Hoje' },
            ] as { id: PeriodFilter; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                period === item.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Relatório Geral Bruto */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Relatório Geral Bruto
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200">
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Total Entradas</p>
            <p className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-emerald-700">
              {formatCurrency(grossSummary.totalEntradas)}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Total Saídas</p>
            <p className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-rose-700">
              {formatCurrency(grossSummary.totalSaidas)}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Saldo Bruto</p>
            <p
              className={`mt-1.5 text-xl font-semibold font-mono tabular-nums ${
                grossSummary.saldoBruto >= 0
                  ? 'text-slate-900'
                  : 'text-rose-700'
              }`}
            >
              {formatCurrency(grossSummary.saldoBruto)}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Lançamentos</p>
            <p className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-slate-900">
              {grossSummary.count}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                <th className="py-2.5 px-6">Forma de Pagamento</th>
                <th className="py-2.5 px-4 text-right">Qtd.</th>
                <th className="py-2.5 px-4 text-right">Entradas</th>
                <th className="py-2.5 px-4 text-right">Saídas</th>
                <th className="py-2.5 px-6 text-right">Total Movimentado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {PAYMENT_METHODS.map((pm) => {
                const stats = grossSummary.byPayment[pm.value];
                const gross = stats.entradas + stats.saidas;
                return (
                  <tr key={pm.value} className="hover:bg-slate-50/60">
                    <td className="py-3 px-6 font-medium text-slate-900">
                      {pm.label}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {stats.count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {formatCurrency(stats.entradas)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700">
                      {formatCurrency(stats.saidas)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(gross)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Gráfico Geral Bruto */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Gráfico Geral Bruto
          </h2>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" />
              Entradas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-600 inline-block" />
              Saídas
            </span>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Sem dados para exibir no gráfico geral bruto.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
            {/* Comparativo Total Bruto */}
            <div className="lg:col-span-4 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-700">Entradas Totais</span>
                  <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                    {formatCurrency(grossSummary.totalEntradas)}
                  </span>
                </div>
                <div className="w-full h-7 bg-slate-100 rounded-md overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-md transition-all duration-200"
                    style={{
                      width: `${(grossSummary.totalEntradas / maxGrossBar) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-700">Saídas Totais</span>
                  <span className="font-mono tabular-nums text-rose-700 font-semibold">
                    {formatCurrency(grossSummary.totalSaidas)}
                  </span>
                </div>
                <div className="w-full h-7 bg-slate-100 rounded-md overflow-hidden">
                  <div
                    className="h-full bg-rose-600 rounded-md transition-all duration-200"
                    style={{
                      width: `${(grossSummary.totalSaidas / maxGrossBar) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Evolução Diária (Entradas vs Saídas por data) */}
            <div className="lg:col-span-8">
              <div className="h-6 text-xs font-mono tabular-nums text-slate-600 mb-2">
                {hoveredDay ? (
                  <span>
                    {formatDateKeyPtBr(hoveredDay.dateKey)} — Entradas:{' '}
                    <strong className="text-emerald-700">
                      {formatCurrency(hoveredDay.entradas)}
                    </strong>{' '}
                    · Saídas:{' '}
                    <strong className="text-rose-700">
                      {formatCurrency(hoveredDay.saidas)}
                    </strong>
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Movimentação por data
                  </span>
                )}
              </div>

              <svg
                viewBox={`0 0 ${Math.max(dailySeries.length * 56, 320)} 190`}
                className="w-full h-48 overflow-visible"
                role="img"
                aria-label="Gráfico geral bruto de entradas e saídas por data"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = 16 + (1 - ratio) * 140;
                  return (
                    <line
                      key={ratio}
                      x1={0}
                      y1={y}
                      x2={Math.max(dailySeries.length * 56, 320)}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeWidth={1}
                    />
                  );
                })}

                {dailySeries.map((day, idx) => {
                  const slotWidth = Math.max(dailySeries.length * 56, 320) / dailySeries.length;
                  const centerX = idx * slotWidth + slotWidth / 2;
                  const barW = Math.min(18, slotWidth * 0.32);
                  const inH = (day.entradas / maxDailyValue) * 140;
                  const outH = (day.saidas / maxDailyValue) * 140;
                  const isHovered = hoveredDateKey === day.dateKey;

                  return (
                    <g
                      key={day.dateKey}
                      onMouseEnter={() => setHoveredDateKey(day.dateKey)}
                      onMouseLeave={() => setHoveredDateKey(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={idx * slotWidth}
                        y={0}
                        width={slotWidth}
                        height={180}
                        fill={isHovered ? '#F1F5F9' : 'transparent'}
                        rx={4}
                      />
                      <rect
                        x={centerX - barW - 2}
                        y={156 - inH}
                        width={barW}
                        height={Math.max(inH, day.entradas > 0 ? 3 : 0)}
                        fill="#059669"
                        rx={3}
                      />
                      <rect
                        x={centerX + 2}
                        y={156 - outH}
                        width={barW}
                        height={Math.max(outH, day.saidas > 0 ? 3 : 0)}
                        fill="#E11D48"
                        rx={3}
                      />
                      <text
                        x={centerX}
                        y={175}
                        textAnchor="middle"
                        className="fill-slate-500 text-[10px] font-mono"
                      >
                        {day.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </section>

      {/* 3. Relatório por Detalhe de Categoria */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Relatório por Detalhe de Categoria
          </h2>
        </div>

        {categoryRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            Nenhuma categoria registrada no período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-6">Categoria (Descrição)</th>
                  <th className="py-2.5 px-4 text-right">Qtd.</th>
                  <th className="py-2.5 px-4 text-right">Entradas</th>
                  <th className="py-2.5 px-4 text-right">Saídas</th>
                  <th className="py-2.5 px-4 text-right">Total Bruto</th>
                  <th className="py-2.5 px-6 text-right">Participação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {categoryRows.map((row) => (
                  <tr key={row.category} className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-medium text-slate-900">
                      {row.category}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {row.count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {formatCurrency(row.entradas)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700">
                      {formatCurrency(row.saidas)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(row.totalGross)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-600">
                      {row.sharePercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Gráfico por Detalhe de Categorias */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            Gráfico por Detalhe de Categorias
          </h2>
          {hoveredCat && (
            <div className="text-xs font-mono tabular-nums text-slate-600">
              {hoveredCat.category} · Entradas:{' '}
              <strong className="text-emerald-700">
                {formatCurrency(hoveredCat.entradas)}
              </strong>{' '}
              · Saídas:{' '}
              <strong className="text-rose-700">
                {formatCurrency(hoveredCat.saidas)}
              </strong>
            </div>
          )}
        </div>

        {categoryRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Sem dados para exibir no gráfico por categorias.
          </p>
        ) : (
          <div className="space-y-3.5">
            {categoryRows.map((row) => {
              const inWidth = (row.entradas / maxCategoryValue) * 100;
              const outWidth = (row.saidas / maxCategoryValue) * 100;

              return (
                <div
                  key={row.category}
                  onMouseEnter={() => setHoveredCategory(row.category)}
                  onMouseLeave={() => setHoveredCategory(null)}
                  className="space-y-1.5 p-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-medium text-slate-900 truncate">
                      {row.category}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-700 shrink-0">
                      {formatCurrency(row.totalGross)}{' '}
                      <span className="text-slate-400">
                        ({row.sharePercent.toFixed(1)}%)
                      </span>
                    </span>
                  </div>

                  <div className="w-full h-5 bg-slate-100 rounded-md overflow-hidden flex">
                    {row.entradas > 0 && (
                      <div
                        className="h-full bg-emerald-600 transition-all duration-200"
                        style={{ width: `${inWidth}%` }}
                        title={`Entradas: ${formatCurrency(row.entradas)}`}
                      />
                    )}
                    {row.saidas > 0 && (
                      <div
                        className="h-full bg-rose-600 transition-all duration-200"
                        style={{ width: `${outWidth}%` }}
                        title={`Saídas: ${formatCurrency(row.saidas)}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
