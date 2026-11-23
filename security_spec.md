# Security Specification — CrisFinance

## 1. Data Invariants
1. Every document under `/users/{userId}/transactions/{transactionId}` and `/users/{userId}/descriptions/{descriptionId}` belongs exclusively to `userId` and can only be read, created, updated, or deleted by the authenticated owner (`request.auth.uid == userId` and `request.auth.token.email_verified == true`).
2. `userId` inside document payloads must strictly match `request.auth.uid` and the path `{userId}`, and is immutable on update.
3. Document IDs (`userId`, `transactionId`, `descriptionId`) must satisfy `isValidId()` (`^[a-zA-Z0-9_\\-]+$`, length <= 128).
4. `amount` must be a strictly positive finite number (`> 0` and `<= 999999999`).
5. `paymentMethod` must belong strictly to `['pix', 'moeda', 'debito', 'credito', 'boleto']`.
6. `type` must belong strictly to `['entrada', 'saida']`.
7. `createdAt` (on transactions) and `lastUsedAt` (on descriptions) must equal `request.time`.
8. No ghost/shadow fields are permitted (`keys().hasAll(...) && keys().hasOnly(...)` on create; `affectedKeys().hasOnly(...)` on update).

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read or write to `/users/userA/transactions/tx1`
2. Cross-user read (`userB` reading `/users/userA/transactions/tx1`)
3. Cross-user write (`userB` creating `/users/userA/transactions/tx1` with `userId: "userA"`)
4. Identity spoofing (`userA` creating `/users/userA/transactions/tx1` with `userId: "userB"`)
5. Unverified email (`request.auth.token.email_verified == false`) attempting create
6. Shadow/ghost field injection (`isAdmin: true` in transaction payload)
7. Negative or zero amount (`amount: -50` or `amount: 0`)
8. Invalid paymentMethod (`paymentMethod: "cheque"`)
9. Invalid transaction type (`type: "transferencia"`)
10. Oversized description (`description` of 500 characters, exceeding 120 max)
11. Client-forged timestamp (`createdAt` != `request.time`)
12. Mutating immutable `userId` or `createdAt` on update
