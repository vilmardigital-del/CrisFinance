import {
  AuthUser,
  getLocalDateKey,
  PaymentMethod,
  SavedDescriptionRecord,
  TransactionRecord,
  TransactionType,
} from '../types';

async function apiRequest<T>(
  url: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error || 'Erro na comunicação com o servidor.');
  }
  return data;
}

export async function verifyGoogleEmailApi(accessToken: string): Promise<{
  email: string;
  domain: string;
  alreadyRegistered: boolean;
  verificationProof: string;
}> {
  return apiRequest('/api/auth/verify-google', {
    method: 'POST',
    body: JSON.stringify({ accessToken }),
  });
}

export async function registerUserApi(
  email: string,
  password: string,
  verificationProof: string
): Promise<{ token: string; user: AuthUser }> {
  return apiRequest<{ token: string; user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, verificationProof }),
  });
}

export async function loginUserApi(
  email: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  return apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function googleLoginApi(
  accessToken: string
): Promise<{ token: string; user: AuthUser }> {
  return apiRequest<{ token: string; user: AuthUser }>('/api/auth/google-login', {
    method: 'POST',
    body: JSON.stringify({ accessToken }),
  });
}

export async function resetPasswordWithGoogleApi(
  accessToken: string,
  newPassword: string
): Promise<{ ok: boolean; token: string; user: AuthUser }> {
  return apiRequest('/api/auth/reset-password-google', {
    method: 'POST',
    body: JSON.stringify({ accessToken, newPassword }),
  });
}

export async function fetchTransactionsApi(token: string): Promise<TransactionRecord[]> {
  const data = await apiRequest<{ items: TransactionRecord[] }>('/api/transactions', {
    method: 'GET',
    token,
  });
  return data.items;
}

export async function fetchSavedDescriptionsApi(
  token: string
): Promise<SavedDescriptionRecord[]> {
  const data = await apiRequest<{ items: SavedDescriptionRecord[] }>('/api/descriptions', {
    method: 'GET',
    token,
  });
  return data.items;
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
  const data = await apiRequest<{ item: TransactionRecord }>('/api/transactions', {
    method: 'POST',
    token,
    body: JSON.stringify({
      ...payload,
      dateKey: getLocalDateKey(new Date()),
    }),
  });
  return data.item;
}

export async function deleteTransactionApi(token: string, id: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

export async function deleteSavedDescriptionApi(token: string, id: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/descriptions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}
