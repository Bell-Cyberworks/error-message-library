import { randomBytes } from 'node:crypto';

// Raw API key generation for ApplicationApiKey/SystemApiKey (prisma/schema.prisma). The raw
// key returned here is only ever computable/visible at creation time — callers must hash it
// immediately (src/lib/services/apiKeys.ts, via @node-rs/argon2's hash(), same library
// prisma/seed.ts already uses for password hashing) and store only the hash + prefix. Never
// store or log the raw key anywhere after generation.

export type ApiKeyKind = 'application' | 'system';

const KIND_TAG: Record<ApiKeyKind, string> = {
  application: 'app',
  system: 'sys',
};

/** Length of the DB-lookup prefix: the "eml_app_"/"eml_sys_" tag (8 chars) plus the first 12
 *  hex chars of the random part — enough to narrow a DB lookup to a small candidate set
 *  without being the whole secret. The full rawKey's hash is still what's actually verified
 *  (see verifyApiKeyForApplication() in src/lib/services/apiKeys.ts, which computes a
 *  candidate raw key's prefix the same way, via this exact constant). */
export const KEY_PREFIX_LENGTH = 20;

export function generateApiKey(kind: ApiKeyKind): { rawKey: string; keyPrefix: string } {
  const randomPart = randomBytes(24).toString('hex'); // 48 hex chars, 24 bytes of entropy
  const rawKey = `eml_${KIND_TAG[kind]}_${randomPart}`;
  const keyPrefix = rawKey.slice(0, KEY_PREFIX_LENGTH);
  return { rawKey, keyPrefix };
}
