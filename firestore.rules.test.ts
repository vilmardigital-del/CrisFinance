export interface DirtyDozenCase {
  id: number;
  name: string;
  expected: 'PERMISSION_DENIED';
  payload: Record<string, unknown>;
  context: {
    authUid: string | null;
    emailVerified: boolean;
    pathUserId: string;
    isUpdate?: boolean;
  };
}

const VALID_PAYMENT_METHODS = ['pix', 'moeda', 'debito', 'credito', 'boleto'] as const;
const VALID_TYPES = ['entrada', 'saida'] as const;
const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const DATE_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function simulateRuleCreateTransaction(caseItem: DirtyDozenCase): 'ALLOWED' | 'PERMISSION_DENIED' {
  const { authUid, emailVerified, pathUserId, isUpdate } = caseItem.context;
  const data = caseItem.payload;

  if (!authUid || !emailVerified || authUid !== pathUserId) return 'PERMISSION_DENIED';
  if (!ID_REGEX.test(pathUserId) || pathUserId.length > 128) return 'PERMISSION_DENIED';
  if (isUpdate && ('userId' in data || 'createdAt' in data)) return 'PERMISSION_DENIED';

  const allowedKeys = ['userId', 'description', 'amount', 'paymentMethod', 'type', 'dateKey', 'createdAt'];
  const keys = Object.keys(data);
  if (keys.length !== allowedKeys.length || !allowedKeys.every((k) => keys.includes(k))) {
    return 'PERMISSION_DENIED';
  }
  if (data.userId !== authUid || data.userId !== pathUserId) return 'PERMISSION_DENIED';
  if (typeof data.description !== 'string' || data.description.length < 1 || data.description.length > 120) {
    return 'PERMISSION_DENIED';
  }
  if (typeof data.amount !== 'number' || !Number.isFinite(data.amount) || data.amount <= 0 || data.amount > 999999999) {
    return 'PERMISSION_DENIED';
  }
  if (!VALID_PAYMENT_METHODS.includes(data.paymentMethod as (typeof VALID_PAYMENT_METHODS)[number])) {
    return 'PERMISSION_DENIED';
  }
  if (!VALID_TYPES.includes(data.type as (typeof VALID_TYPES)[number])) {
    return 'PERMISSION_DENIED';
  }
  if (typeof data.dateKey !== 'string' || !DATE_REGEX.test(data.dateKey)) {
    return 'PERMISSION_DENIED';
  }
  if (data.createdAt !== 'SERVER_TIME') {
    return 'PERMISSION_DENIED';
  }

  return 'ALLOWED';
}

export const dirtyDozenCases: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated write',
    expected: 'PERMISSION_DENIED',
    context: { authUid: null, emailVerified: false, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: 50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 2,
    name: 'Cross-user write',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userB', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: 50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 3,
    name: 'Identity spoofing',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userB', description: 'Mercado', amount: 50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 4,
    name: 'Unverified email',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: false, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: 50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 5,
    name: 'Shadow field injection',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: 50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME', isAdmin: true },
  },
  {
    id: 6,
    name: 'Negative amount',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: -50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 7,
    name: 'Zero amount',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: 0, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 8,
    name: 'Invalid payment method',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: 50, paymentMethod: 'cheque', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 9,
    name: 'Invalid transaction type',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: 50, paymentMethod: 'pix', type: 'transferencia', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 10,
    name: 'Oversized description',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'A'.repeat(200), amount: 50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
  {
    id: 11,
    name: 'Forged client timestamp',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA' },
    payload: { userId: 'userA', description: 'Mercado', amount: 50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 12,
    name: 'Immutable userId mutation on update',
    expected: 'PERMISSION_DENIED',
    context: { authUid: 'userA', emailVerified: true, pathUserId: 'userA', isUpdate: true },
    payload: { userId: 'userB', description: 'Mercado', amount: 50, paymentMethod: 'pix', type: 'saida', dateKey: '2026-11-23', createdAt: 'SERVER_TIME' },
  },
];
