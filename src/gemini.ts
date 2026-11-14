import { GoogleGenAI, Modality, Type } from '@google/genai';
import { EventEmitter } from 'node:events';

export type GeminiVoiceSessionOptions = {
  apiKey: string;
  model: string;
  onCodingRequest: (instruction: string) => Promise<string>;
};

/** Adapts Gemini Live audio/function events to a provider-neutral voice session. */
export class GeminiVoiceSession extends EventEmitter {
  private connection?: any;
  private readonly ai: GoogleGenAI;

  constructor(private readonly options: GeminiVoiceSessionOptions) {
    super();
    this.ai = new GoogleGenAI({ apiKey: options.apiKey });
  }

  async connect(): Promise<void> {
    this.connection = await this.ai.live.connect({
      model: this.options.model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: [
          'You are a concise Persian voice interface for a local coding agent.',
          'Repeat the requested coding task back before invoking run_coding_task.',
          'Never claim a file was changed unless the tool response says so.',
          'Keep replies under two spoken sentences unless asked for detail.'
        ].join(' '),
        tools: [{ functionDeclarations: [{
          name: 'run_coding_task',
          description: 'Ask the local Codex session to inspect or work on the configured project.',
          parameters: {
            type: Type.OBJECT,
            properties: { instruction: { type: Type.STRING, description: 'The precise coding task.' } },
            required: ['instruction']
          }
        }] }]
      },
      callbacks: {
        onmessage: (message: any) => { void this.handleMessage(message); },
        onerror: (error: unknown) => this.emit('error', error),
        onclose: () => this.emit('close')
      }
    });
  }

  sendAudio(pcm16le16khz: Buffer): void {
    this.connection?.sendRealtimeInput({
      audio: { data: pcm16le16khz.toString('base64'), mimeType: 'audio/pcm;rate=16000' }
    });
  }

  async greet(): Promise<void> {
    this.connection?.sendRealtimeInput({ text: 'به تماس صوتی کدنویسی وصل شدی. بگو روی پروژه چه کاری انجام بدهم.' });
  }

  close(): void { this.connection?.close(); this.connection = undefined; }

  private async handleMessage(message: any): Promise<void> {
    for (const part of message?.serverContent?.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data && part.inlineData?.mimeType?.startsWith('audio/pcm')) this.emit('audio', Buffer.from(data, 'base64'));
    }
    const calls = message?.toolCall?.functionCalls ?? [];
    for (const call of calls) {
      const instruction = String(call.args?.instruction ?? '');
      const result = await this.options.onCodingRequest(instruction);
      this.connection?.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response: { result } }] });
    }
  }
}
