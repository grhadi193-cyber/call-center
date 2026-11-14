import type { WebSocket } from 'ws';
import { CodexSession } from './codex.js';
import { GeminiVoiceSession } from './gemini.js';
import type { AppConfig } from './config.js';

export class BrowserVoiceBridge {
  private codex?: CodexSession;
  private gemini?: GeminiVoiceSession;
  private closed = false;

  constructor(private readonly socket: WebSocket, private readonly config: AppConfig) {}

  async start(): Promise<void> {
    this.codex = new CodexSession({ cwd: this.config.CODEX_PROJECT_DIR, writeEnabled: this.config.VOICE_WRITE_ENABLED });
    this.codex.on('diagnostic', (value) => console.warn('[codex]', value.trim()));
    await this.codex.start();
    this.gemini = new GeminiVoiceSession({
      apiKey: this.config.GOOGLE_API_KEY,
      model: this.config.GEMINI_LIVE_MODEL,
      onCodingRequest: (instruction) => this.runCodexTask(instruction)
    });
    this.gemini.on('audio', (audio: Buffer) => this.send({ type: 'audio', data: audio.toString('base64'), sampleRate: 24_000 }));
    this.gemini.on('error', (error) => this.send({ type: 'error', message: String(error) }));
    await this.gemini.connect();
    await this.gemini.greet();
    this.send({ type: 'ready', writeEnabled: this.config.VOICE_WRITE_ENABLED });
  }

  sendAudio(data: string): void { this.gemini?.sendAudio(Buffer.from(data, 'base64')); }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.gemini?.close();
    this.codex?.close();
  }

  private send(value: unknown): void { if (!this.closed) this.socket.send(JSON.stringify(value)); }

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
