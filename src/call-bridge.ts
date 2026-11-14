import type { WebSocket } from 'ws';
import { CodexSession } from './codex.js';
import { GeminiVoiceSession } from './gemini.js';
import { decodeUlaw, encodeUlaw, pcm16ToBuffer, resamplePcm16 } from './audio/ulaw.js';
import type { AppConfig } from './config.js';

type TwilioMessage = { event: 'start' | 'media' | 'stop'; start?: { streamSid?: string }; media?: { payload?: string } };

export class CallBridge {
  private streamSid?: string;
  private gemini?: GeminiVoiceSession;
  private codex?: CodexSession;
  private closed = false;

  constructor(private readonly socket: WebSocket, private readonly config: AppConfig) {}

  async onMessage(raw: Buffer | string): Promise<void> {
    const message = JSON.parse(raw.toString()) as TwilioMessage;
    if (message.event === 'start') await this.start(message);
    if (message.event === 'media' && message.media?.payload) this.forwardInboundAudio(message.media.payload);
    if (message.event === 'stop') this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.gemini?.close();
    this.codex?.close();
    this.socket.close();
  }

  private async start(message: TwilioMessage): Promise<void> {
    if (this.gemini || !message.start?.streamSid) return;
    this.streamSid = message.start.streamSid;
    this.codex = new CodexSession({ cwd: this.config.CODEX_PROJECT_DIR, writeEnabled: this.config.VOICE_WRITE_ENABLED });
    this.codex.on('diagnostic', (value) => console.warn('[codex]', value.trim()));
    await this.codex.start();
    this.gemini = new GeminiVoiceSession({
      apiKey: this.config.GOOGLE_API_KEY,
      model: this.config.GEMINI_LIVE_MODEL,
      onCodingRequest: (instruction) => this.runCodexTask(instruction)
    });
    this.gemini.on('audio', (audio: Buffer) => this.forwardOutboundAudio(audio));
    this.gemini.on('error', (error) => console.error('[gemini]', error));
    await this.gemini.connect();
    await this.gemini.greet();
  }

  private forwardInboundAudio(base64: string): void {
    if (!this.gemini) return;
    const pcm8khz = decodeUlaw(Buffer.from(base64, 'base64'));
    this.gemini.sendAudio(pcm16ToBuffer(resamplePcm16(pcm8khz, 8_000, 16_000)));
  }

  private forwardOutboundAudio(pcm24khz: Buffer): void {
    if (!this.streamSid || this.closed) return;
    const aligned = pcm24khz.subarray(0, pcm24khz.length - (pcm24khz.length % 2));
    const samples = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 2);
    const payload = encodeUlaw(resamplePcm16(samples, 24_000, 8_000)).toString('base64');
    this.socket.send(JSON.stringify({ event: 'media', streamSid: this.streamSid, media: { payload } }));
  }

  private async runCodexTask(instruction: string): Promise<string> {
    if (!this.codex) throw new Error('Codex is not ready.');
    let response = '';
    const onText = (chunk: string) => { response += chunk; };
    const completed = new Promise<void>((resolve) => this.codex!.once('turnCompleted', () => resolve()));
    this.codex.on('text', onText);
    try {
      const scope = this.config.VOICE_WRITE_ENABLED
        ? 'You may make minimal, verified changes inside the project.'
        : 'Read-only mode: inspect and explain; do not change files.';
      await this.codex.prompt(`${scope}\n\nVoice request:\n${instruction}`);
      await completed;
      return response.trim().slice(0, 6_000) || 'Task completed without a spoken summary.';
    } finally {
      this.codex.off('text', onText);
    }
  }
}
