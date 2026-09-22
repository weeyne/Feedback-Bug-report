import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes');
  return key;
}

/** AES-256-GCM. Format: v1:<iv>:<ciphertext>:<tag>, each part base64url. */
export function encryptSecret(plain: string, base64Key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, ciphertext, cipher.getAuthTag()]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join(':');
}

export function decryptSecret(token: string, base64Key: string): string {
  const parts = token.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unsupported secret format');
  const iv = Buffer.from(parts[1]!, 'base64url');
  const ciphertext = Buffer.from(parts[2]!, 'base64url');
  const tag = Buffer.from(parts[3]!, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES)
    throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Constant-time string comparison (sha256 digests, so lengths never leak or throw). */
export function safeEqual(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}
