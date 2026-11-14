import { resolve } from 'node:path';
import { z } from 'zod';

const boolean = z.enum(['true', 'false']).default('false').transform((value) => value === 'true');

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default('127.0.0.1'),
  PUBLIC_BASE_URL: z.string().url().optional(),
  GOOGLE_API_KEY: z.string().min(1),
  GEMINI_LIVE_MODEL: z.string().min(1).default('gemini-3.8-live'),
  CODEX_PROJECT_DIR: z.string().min(1).transform((value) => resolve(value)),
  ALLOWED_CALLERS: z.string().default(''),
  VOICE_WRITE_ENABLED: boolean,
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  LOCAL_ACCESS_TOKEN: z.string().min(16)
});

export type AppConfig = Omit<z.infer<typeof schema>, 'ALLOWED_CALLERS'> & { allowedCallers: Set<string> };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(env);
  const allowedCallers = new Set(parsed.ALLOWED_CALLERS.split(',').map((value) => value.trim()).filter(Boolean));
  const { ALLOWED_CALLERS, ...config } = parsed;
  void ALLOWED_CALLERS;
  return { ...config, allowedCallers };
}
