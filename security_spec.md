# Security Specification & Payload-First TDD — Barbachu POS Firestore

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every unspecified path in `/databases/{database}/documents` is denied read and write access (`allow read, write: if false;`).
2. **Email Verification, Case Normalization & Identity Integrity**: All write operations require `request.auth != null && request.auth.token.email_verified == true`. Email comparisons normalize `request.auth.token.email.lower()`. Any `ownerUid` or `uid` field set on creation must equal `request.auth.uid` and remain immutable on updates.
3. **Admin Privileges & No Self-Escalation**: Only the bootstrapped verified admin (`maurocazqiez013@gmail.com`) or an admin registered in `/admins/{uid}` can modify catalog products (`/products`), delete sales/orders/inventory, manage `/staff_users`, or edit `/pos_config` permissions. Self-registered `/users/{userId}` profiles cannot escalate `role` to `'admin'`.
4. **Terminal State & Append-Only Audit**: Audit logs (`/audit_logs`) and inventory movements (`/inventory_movements`) are strictly append-only (no client `update` or `delete`). Closed & paid orders (`paid == true && status == 'closed'`) and closed shifts (`isOpen == false`) cannot be modified by non-admin staff.
5. **PII Isolation & Hashed Staff PINs**: `/users/{userId}` (containing `email`) can ONLY be read by the document owner (`request.auth.uid == userId`) or verified Admin (`isAdmin()`). Staff records in `/staff_users` store salted PBKDF2-SHA256 `pinHash` values and masked `pin` (`'****'`) rather than plaintext PINs.
6. **Bounded Payloads, Multi-Item Order Guard & Path Hardening**: Every document ID path variable must satisfy `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, `size() <= 128`). Order/sale `items` validate head (`items[0]`) and tail (`items[size-1]`) element schemas, types, prices, and quantities (`1..99`), bounded to `1..100` lines, keeping multi-document transactions well within Firestore's 1,000-expression evaluation budget.
7. **Server Timestamps**: `createdAt`, `updatedAt`, `grantedAt` on `/users`, `/admins`, `/pos_config`, `/products`, `/orders`, `/inventory` are validated against `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Order Write**: Unauthenticated client attempts `create /orders/ord1` -> Denied (`isSignedIn()` fails).
2. **Unverified Email Spoof**: User with `email: "maurocazqiez013@gmail.com"` and `email_verified: false` attempts admin write -> Denied (`email_verified == true` check fails).
3. **Self-Assigned Admin Escalation**: Non-admin user creates `/users/{uid}` with `role: "admin"` -> Denied (`isValidUserProfile` restricts self-create `role != 'admin'` unless `isAdmin()`).
4. **Ghost Field / Shadow Update**: Authenticated user creates `/products/701` with valid fields plus `"isDiscounted": true` -> Denied (`keys().hasOnly(...)` fails).
5. **Path ID Poisoning**: User attempts `create /orders/../../../admin` or 500-char ID -> Denied (`isValidId` regex & size check fails).
6. **PII Blanket Read**: Non-admin user B attempts `get /users/userA` or `list /users` -> Denied (`isOwner(userId) || isAdmin()` blocks cross-user reads).
7. **Unauthorized Catalog Price Tampering**: Non-admin waiter updates `/products/701` priceCents to `1` -> Denied (only `isAdmin()` can write `/products`).
8. **Order Owner Hijacking on Update**: Waiter updates `/orders/ord1` changing `ownerUid` to another UID -> Denied (`incoming().ownerUid == existing().ownerUid` check fails).
9. **Closed Order Mutability**: Non-admin waiter updates `/orders/ord1` after `existing().paid == true` -> Denied (terminal state lock).
10. **Audit Log Tampering / Deletion**: Waiter attempts `update` or `delete` on `/audit_logs/aud1` -> Denied (`allow update, delete: if false;`).
11. **Oversized Array Denial-of-Wallet**: Client submits an order with 500 items or 100KB note -> Denied (`items.size() <= 100` and `note.size() <= 300` fail).
12. **Client-Delegated List Scraping**: Unauthorized user outside `authorizedEmails` attempts `list /orders` -> Denied (`resource.data` check blocks unauthorized queries).
