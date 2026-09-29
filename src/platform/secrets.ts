import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env';

/** AES-256-GCM: `iv.tag.ciphertext`, base64url. Only the Cockpit's key opens it. */
export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', env.encryptionKey, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.');
}

export function open(sealed: string): string {
  const [iv, tag, body] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !body) throw new Error('Malformed sealed secret.');
  const decipher = createDecipheriv('aes-256-gcm', env.encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
