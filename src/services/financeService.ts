import {
  AuthUser,
  getLocalDateKey,
  PaymentMethod,
  SavedDescriptionRecord,
  TransactionRecord,
  TransactionType,
} from '../types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface StoredUser {
  id: string;
  email: string;
  mxDomain: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

interface StoredResetCode {
  userId: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

interface StoredSession {
  token: string;
  user: AuthUser;
}

const USERS_KEY = 'crisfinance_users_v1';
const SESSION_KEY = 'crisfinance_session_v1';
const RESETS_KEY = 'crisfinance_resets_v1';

const BLOCKED_DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'throwawaymail.com',
  'trashmail.com',
  'fake.com',
  'teste.com',
  'test.com',
  'example.com',
  'example.org',
  'example.net',
  'invalid.com',
  'localhost',
]);

const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function generateSalt(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const input = `${salt}:${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getUsers(): StoredUser[] {
  return readJson<StoredUser[]>(USERS_KEY, []);
}

function saveUsers(users: StoredUser[]): void {
  writeJson(USERS_KEY, users);
}

function getResets(): Record<string, StoredResetCode> {
  return readJson<Record<string, StoredResetCode>>(RESETS_KEY, {});
}

function saveResets(resets: Record<string, StoredResetCode>): void {
  writeJson(RESETS_KEY, resets);
}

function createSessionForUser(stored: StoredUser): StoredSession {
  const user: AuthUser = {
    id: stored.id,
    email: stored.email,
    mxDomain: stored.mxDomain,
  };
  const session: StoredSession = {
    token: `${stored.id}.${generateId()}`,
    user,
  };
  writeJson(SESSION_KEY, session);
  return session;
}

function requireUserByToken(token: string): AuthUser {
  const session = readJson<StoredSession | null>(SESSION_KEY, null);
  if (!session || session.token !== token || !session.user?.id) {
    throw new ApiError('Sessão inválida ou expirada.', 401);
  }
  return session.user;
}

function txStorageKey(userId: string): string {
  return `crisfinance_tx_${userId}_v1`;
}

function descStorageKey(userId: string): string {
  return `crisfinance_desc_${userId}_v1`;
}

export function restoreSessionApi(): { token: string; user: AuthUser } | null {
  const session = readJson<StoredSession | null>(SESSION_KEY, null);
  if (!session?.token || !session?.user?.id) {
    return null;
  }
  return session;
}

export function logoutSessionApi(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

export async function verifyEmailVirtuallyApi(rawEmail: string): Promise<{
  valid: boolean;
  email?: string;
  domain?: string;
  mxHost?: string;
  error?: string;
}> {
  const email = normalizeLogin(rawEmail);
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return {
      valid: false,
      error: 'Formato de e-mail inválido.',
    };
  }

  const domain = email.split('@')[1] ?? '';
  if (!domain || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) {
    return {
      valid: false,
      error: 'Domínio de e-mail inválido.',
    };
  }

  if (BLOCKED_DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      error: 'E-mails temporários ou fictícios não são permitidos.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2000);
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { signal: controller.signal }
    );
    window.clearTimeout(timeoutId);
    if (response.ok) {
      const dnsData = (await response.json()) as {
        Status?: number;
        Answer?: Array<{ data?: string }>;
      };
      if (dnsData.Status === 3) {
        return {
          valid: false,
          error: 'Domínio de e-mail inexistente.',
        };
      }
      const firstMx = dnsData.Answer?.[0]?.data?.split(' ').pop()?.replace(/\.$/, '');
      return {
        valid: true,
        email,
        domain,
        mxHost: firstMx || domain,
      };
    }
  } catch {
    // Graceful fallback when offline or blocked in sandbox
  }

  return {
    valid: true,
    email,
    domain,
    mxHost: domain,
  };
}

export async function registerUserApi(
  rawLogin: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  const login = normalizeLogin(rawLogin);
  if (!login) {
    throw new ApiError('Informe um login ou e-mail.', 400);
  }
  if (!password) {
    throw new ApiError('Informe uma senha.', 400);
  }

  let mxDomain = 'local';
  if (login.includes('@')) {
    const check = await verifyEmailVirtuallyApi(login);
    if (!check.valid) {
      throw new ApiError(check.error || 'E-mail inválido.', 400);
    }
    mxDomain = check.domain || 'local';
  }

  const users = getUsers();
  if (users.some((u) => u.email === login)) {
    throw new ApiError('Este login ou e-mail já está cadastrado.', 409);
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const newUser: StoredUser = {
    id: generateId(),
    email: login,
    mxDomain,
    salt,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  saveUsers([...users, newUser]);
  return createSessionForUser(newUser);
}

export async function loginUserApi(
  rawLogin: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  const login = normalizeLogin(rawLogin);
  if (!login || !password) {
    throw new ApiError('Informe login/e-mail e senha.', 400);
  }

  const users = getUsers();
  const existing = users.find((u) => u.email === login);
  if (!existing) {
    throw new ApiError('Conta não encontrada. Clique em "Criar conta" para cadastrar.', 401);
  }

  const candidateHash = await hashPassword(password, existing.salt);
  if (candidateHash !== existing.passwordHash) {
    throw new ApiError('Senha incorreta.', 401);
  }

  return createSessionForUser(existing);
}

export async function requestPasswordResetApi(rawLogin: string): Promise<{
  ok: boolean;
  delivery: 'email' | 'virtual';
  email: string;
  virtualCode?: string;
}> {
  const login = normalizeLogin(rawLogin);
  if (!login) {
    throw new ApiError('Informe o e-mail ou login cadastrado.', 400);
  }

  const users = getUsers();
  const existing = users.find((u) => u.email === login);
  if (!existing) {
    throw new ApiError('Conta não encontrada.', 404);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const resets = getResets();
  resets[existing.email] = {
    userId: existing.id,
    code,
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0,
  };
  saveResets(resets);

  return {
    ok: true,
    delivery: 'virtual',
    email: existing.email,
    virtualCode: code,
  };
}

export async function resetPasswordApi(params: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ ok: boolean; token: string; user: AuthUser }> {
  const login = normalizeLogin(params.email);
  const code = params.code.trim();
  const newPassword = params.newPassword;

  if (!login || !/^\d{6}$/.test(code)) {
    throw new ApiError('Informe o login/e-mail e o código de 6 dígitos.', 400);
  }
  if (!newPassword) {
    throw new ApiError('Informe a nova senha.', 400);
  }

  const resets = getResets();
  const resetEntry = resets[login];
  if (!resetEntry || resetEntry.expiresAt < Date.now() || resetEntry.attempts >= 5) {
    throw new ApiError('Código inválido ou expirado.', 400);
  }

  if (resetEntry.code !== code) {
    resetEntry.attempts += 1;
    resets[login] = resetEntry;
    saveResets(resets);
    throw new ApiError('Código incorreto.', 400);
  }

  const users = getUsers();
  const userIdx = users.findIndex((u) => u.id === resetEntry.userId);
  if (userIdx === -1) {
    throw new ApiError('Conta não encontrada.', 404);
  }

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);
  users[userIdx] = {
    ...users[userIdx],
    salt: newSalt,
    passwordHash: newHash,
  };
  saveUsers(users);

  delete resets[login];
  saveResets(resets);

  const session = createSessionForUser(users[userIdx]);
  return {
    ok: true,
    token: session.token,
    user: session.user,
  };
}

export async function fetchTransactionsApi(token: string): Promise<TransactionRecord[]> {
  const user = requireUserByToken(token);
  const items = readJson<TransactionRecord[]>(txStorageKey(user.id), []);
  return [...items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function fetchSavedDescriptionsApi(
  token: string
): Promise<SavedDescriptionRecord[]> {
  const user = requireUserByToken(token);
  const items = readJson<SavedDescriptionRecord[]>(descStorageKey(user.id), []);
  return [...items].sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''));
}

export async function createTransactionApi(
  token: string,
  payload: {
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    type: TransactionType;
  }
): Promise<TransactionRecord> {
  const user = requireUserByToken(token);
  const cleanDescription = payload.description.trim();
  const roundedAmount = Math.round(payload.amount * 100) / 100;
  const createdAt = new Date().toISOString();
  const dateKey = getLocalDateKey(new Date());

  if (!cleanDescription || cleanDescription.length > 120) {
    throw new ApiError('Descrição inválida.', 400);
  }
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    throw new ApiError('Valor inválido.', 400);
  }

  const newTx: TransactionRecord = {
    id: generateId(),
    userId: user.id,
    description: cleanDescription,
    amount: roundedAmount,
    paymentMethod: payload.paymentMethod,
    type: payload.type,
    dateKey,
    createdAt,
  };

  const existingTxs = readJson<TransactionRecord[]>(txStorageKey(user.id), []);
  writeJson(txStorageKey(user.id), [newTx, ...existingTxs]);

  const existingDescs = readJson<SavedDescriptionRecord[]>(descStorageKey(user.id), []);
  const descIdx = existingDescs.findIndex((d) => d.text === cleanDescription);
  if (descIdx >= 0) {
    existingDescs[descIdx] = {
      ...existingDescs[descIdx],
      lastUsedAt: createdAt,
      usageCount: existingDescs[descIdx].usageCount + 1,
    };
  } else {
    existingDescs.unshift({
      id: generateId(),
      userId: user.id,
      text: cleanDescription,
      lastUsedAt: createdAt,
      usageCount: 1,
    });
  }
  writeJson(descStorageKey(user.id), existingDescs);

  return newTx;
}

export async function deleteTransactionApi(token: string, id: string): Promise<void> {
  const user = requireUserByToken(token);
  const existingTxs = readJson<TransactionRecord[]>(txStorageKey(user.id), []);
  writeJson(
    txStorageKey(user.id),
    existingTxs.filter((tx) => tx.id !== id)
  );
}

export async function deleteSavedDescriptionApi(token: string, id: string): Promise<void> {
  const user = requireUserByToken(token);
  const existingDescs = readJson<SavedDescriptionRecord[]>(descStorageKey(user.id), []);
  writeJson(
    descStorageKey(user.id),
    existingDescs.filter((desc) => desc.id !== id)
  );
}
