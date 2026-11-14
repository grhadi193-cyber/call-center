import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { safeEqual } from './security.js';

export function verifyTwilioSignature(url: string, params: Record<string, unknown>, token: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const payload = Object.keys(params).sort().reduce((value, key) => `${value}${key}${String(params[key] ?? '')}`, url);
  const expected = createHmac('sha1', token).update(payload).digest('base64');
  return safeEqual(expected, signature);
}

export function requestUrl(request: FastifyRequest, publicBaseUrl: string): string {
  return new URL(request.raw.url ?? '/', publicBaseUrl).toString();
}

export function twimlStream(publicBaseUrl: string): string {
  const endpoint = new URL('/twilio/media', publicBaseUrl);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="fa-IR">به دستیار کدنویسی وصل می‌شوید.</Say><Connect><Stream url="${endpoint.toString()}" /></Connect></Response>`;
}
