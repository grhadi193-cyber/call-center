import { timingSafeEqual } from 'node:crypto';

export function isAllowedCaller(from: string | undefined, allowedCallers: ReadonlySet<string>): boolean {
  return typeof from === 'string' && allowedCallers.has(from.trim());
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
