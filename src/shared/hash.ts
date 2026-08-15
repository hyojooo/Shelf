import { createHash } from 'node:crypto';

const TEXT_SALT = '\u0000t';
const IMAGE_SALT = '\u0000i';

export function computeTextHash(text: string): string {
  return createHash('sha256')
    .update(text, 'utf8')
    .update(TEXT_SALT)
    .digest('hex');
}

export function computeImageHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).update(IMAGE_SALT).digest('hex');
}

export function makeId(hash: string, now: number): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${hash.slice(0, 12)}-${now.toString(36)}-${rnd}`;
}
