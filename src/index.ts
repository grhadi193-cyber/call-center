import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import { readFile } from 'node:fs/promises';
import websocket from '@fastify/websocket';
import { loadConfig } from './config.js';
import { CallBridge } from './call-bridge.js';
import { BrowserVoiceBridge } from './browser-bridge.js';
import { isAllowedCaller, safeEqual } from './security.js';
import { requestUrl, twimlStream, verifyTwilioSignature } from './twilio.js';

const config = loadConfig();
const app = Fastify({ logger: { level: 'info' } });
const permittedCalls = new Set<string>();
const browserPage = await readFile(new URL('../public/index.html', import.meta.url));
await app.register(websocket);
await app.register(formbody);

app.get('/healthz', async () => ({ status: 'ok', writeEnabled: config.VOICE_WRITE_ENABLED }));
app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(browserPage));

app.get('/voice', { websocket: true }, (socket, request) => {
  const token = new URL(request.raw.url ?? '/', 'http://localhost').searchParams.get('token');
  if (!token || !safeEqual(token, config.LOCAL_ACCESS_TOKEN)) {
    socket.close(1008, 'Unauthorized');
    return;
  }
  const bridge = new BrowserVoiceBridge(socket, config);
  socket.on('message', (raw) => {
    void (async () => {
      const message = JSON.parse(raw.toString()) as { type?: string; data?: string };
      if (message.type === 'start') await bridge.start();
      if (message.type === 'audio' && message.data) bridge.sendAudio(message.data);
    })().catch((error) => { app.log.error(error, 'browser voice failure'); socket.close(1011, 'Bridge failure'); });
  });
  socket.on('close', () => bridge.close());
});

app.post('/twilio/voice', async (request, reply) => {
  if (!config.PUBLIC_BASE_URL || !config.TWILIO_AUTH_TOKEN) return reply.code(503).send({ error: 'Phone adapter is disabled.' });
  const fields = request.body as Record<string, unknown>;
  const signature = request.headers['x-twilio-signature'];
  const receivedSignature = Array.isArray(signature) ? signature[0] : signature;
  if (!verifyTwilioSignature(requestUrl(request, config.PUBLIC_BASE_URL), fields, config.TWILIO_AUTH_TOKEN, receivedSignature)) {
    return reply.code(401).send({ error: 'Invalid telephony signature.' });
  }
  const from = typeof fields.From === 'string' ? fields.From : undefined;
  const callSid = typeof fields.CallSid === 'string' ? fields.CallSid : undefined;
  if (!isAllowedCaller(from, config.allowedCallers) || !callSid) {
    return reply.code(403).send({ error: 'Caller is not authorized.' });
  }
  permittedCalls.add(callSid);
  reply.type('text/xml').send(twimlStream(config.PUBLIC_BASE_URL));
});

app.get('/twilio/media', { websocket: true }, (socket) => {
  let bridge: CallBridge | undefined;
  socket.on('message', (raw) => {
    void (async () => {
      const message = JSON.parse(raw.toString()) as { event?: string; start?: { callSid?: string } };
      if (message.event === 'start') {
        if (!message.start?.callSid || !permittedCalls.delete(message.start.callSid)) {
          socket.close(1008, 'Unauthorized call');
          return;
        }
        bridge = new CallBridge(socket, config);
      }
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      await bridge?.onMessage(buffer);
    })().catch((error) => { app.log.error(error, 'media bridge failure'); socket.close(1011, 'Bridge failure'); });
  });
  socket.on('close', () => bridge?.close());
});

await app.listen({ port: config.PORT, host: config.HOST });
