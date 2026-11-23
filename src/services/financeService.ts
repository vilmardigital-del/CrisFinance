import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  getLocalDateKey,
  MAX_AMOUNT_VALUE,
  MAX_DESCRIPTION_LENGTH,
  PaymentMethod,
  SavedDescriptionRecord,
  slugifyDescriptionId,
  TransactionRecord,
  TransactionType,
} from '../types';

export function subscribeTransactions(
  userId: string,
  onData: (items: TransactionRecord[]) => void
): () => void {
  const path = `users/${userId}/transactions`;
  const q = query(
    collection(db, 'users', userId, 'transactions'),
    where('userId', '==', userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records: TransactionRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: String(data.userId ?? userId),
          description: String(data.description ?? ''),
          amount: Number(data.amount ?? 0),
          paymentMethod: data.paymentMethod as PaymentMethod,
          type: data.type as TransactionType,
          dateKey: String(data.dateKey ?? ''),
          createdAt: data.createdAt ?? null,
        };
      });
      records.sort((a, b) => {
        const aMs = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bMs = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return bMs - aMs;
      });
      onData(records);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeSavedDescriptions(
  userId: string,
  onData: (items: SavedDescriptionRecord[]) => void
): () => void {
  const path = `users/${userId}/descriptions`;
  const q = query(
    collection(db, 'users', userId, 'descriptions'),
    where('userId', '==', userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records: SavedDescriptionRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: String(data.userId ?? userId),
          text: String(data.text ?? ''),
          lastUsedAt: data.lastUsedAt ?? null,
          usageCount: Number(data.usageCount ?? 1),
        };
      });
      records.sort((a, b) => {
        const aMs = a.lastUsedAt ? a.lastUsedAt.toMillis() : Date.now();
        const bMs = b.lastUsedAt ? b.lastUsedAt.toMillis() : Date.now();
        return bMs - aMs;
      });
      onData(records);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createTransactionWithSavedDescription(params: {
  userId: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  type: TransactionType;
}): Promise<void> {
  const { userId, description, amount, paymentMethod, type } = params;

  const cleanDescription = description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
  if (!cleanDescription) {
    throw new Error('Descrição obrigatória.');
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_VALUE) {
    throw new Error('Valor inválido.');
  }

  const now = new Date();
  const dateKey = getLocalDateKey(now);
  const roundedAmount = Math.round(amount * 100) / 100;

  const txPath = `users/${userId}/transactions`;
  try {
    await addDoc(collection(db, 'users', userId, 'transactions'), {
      userId,
      description: cleanDescription,
      amount: roundedAmount,
      paymentMethod,
      type,
      dateKey,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, txPath);
  }

  const descId = slugifyDescriptionId(cleanDescription);
  const descPath = `users/${userId}/descriptions/${descId}`;
  const descRef = doc(db, 'users', userId, 'descriptions', descId);

  try {
    const existingSnap = await getDoc(descRef);
    if (existingSnap.exists()) {
      const prevCount = Number(existingSnap.data().usageCount ?? 0);
      await updateDoc(descRef, {
        lastUsedAt: serverTimestamp(),
        usageCount: prevCount + 1,
      });
    } else {
      await setDoc(descRef, {
        userId,
        text: cleanDescription,
        lastUsedAt: serverTimestamp(),
        usageCount: 1,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, descPath);
  }
}

export async function removeTransaction(userId: string, transactionId: string): Promise<void> {
  const path = `users/${userId}/transactions/${transactionId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'transactions', transactionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function removeSavedDescription(userId: string, descriptionId: string): Promise<void> {
  const path = `users/${userId}/descriptions/${descriptionId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'descriptions', descriptionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
