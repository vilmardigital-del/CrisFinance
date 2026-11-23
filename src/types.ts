import { Timestamp } from 'firebase/firestore';

export type PaymentMethod = 'pix' | 'moeda' | 'debito' | 'credito' | 'boleto';
export type TransactionType = 'entrada' | 'saida';
export type AppPage = 'lancamento' | 'lista' | 'relatorios';

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
}

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'moeda', label: 'Moeda' },
  { value: 'debito', label: 'Cartão Débito' },
  { value: 'credito', label: 'Cartão Crédito' },
  { value: 'boleto', label: 'Boleto' },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  moeda: 'Moeda',
  debito: 'Cartão Débito',
  credito: 'Cartão Crédito',
  boleto: 'Boleto',
};

export interface TransactionRecord {
  id: string;
  userId: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  type: TransactionType;
  dateKey: string; // YYYY-MM-DD
  createdAt: Timestamp | null;
}

export interface SavedDescriptionRecord {
  id: string;
  userId: string;
  text: string;
  lastUsedAt: Timestamp | null;
  usageCount: number;
}

export const MAX_DESCRIPTION_LENGTH = 120;
export const MAX_AMOUNT_VALUE = 999999999;

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateKeyPtBr(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatDateKeyWithWeekday(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(year, month - 1, day);
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatTimeFromTimestamp(ts: Timestamp | null): string {
  if (!ts) return '--:--';
  const date = ts.toDate();
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatAutoDateNow(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function parseAmountInput(raw: string): number {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return NaN;
  // Support both "1.250,50" and "1250.50" and "1250,50"
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    return Number(normalized);
  }
  return Number(cleaned);
}

export function slugifyDescriptionId(text: string): string {
  const trimmed = text.trim();
  const normalized = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  let hash = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  return normalized.length > 0 ? `${normalized}_${suffix}` : `desc_${suffix}`;
}
