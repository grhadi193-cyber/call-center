import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

type RpcMessage = { id?: number; method?: string; params?: any; result?: any; error?: { message?: string } };

export class CodexSession extends EventEmitter {
  private process?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
  private threadId?: string;

  constructor(private readonly options: { cwd: string; writeEnabled: boolean }) { super(); }

  async start(): Promise<void> {
    if (this.process) return;
    this.process = spawn('codex', ['app-server'], { stdio: 'pipe' });
    this.process.once('exit', (code) => this.stop(new Error(`Codex app-server exited (${code ?? 'unknown'}).`)));
    this.process.stderr.on('data', (data) => this.emit('diagnostic', String(data)));
    const lines = createInterface({ input: this.process.stdout });
    lines.on('line', (line) => this.receive(line));

    await this.request('initialize', {
      clientInfo: { name: 'voice-codex-bridge', version: '0.1.0' },
      capabilities: {}
    });
    this.notify('initialized', {});
    const started = await this.request('thread/start', {
      cwd: this.options.cwd,
      approvalPolicy: this.options.writeEnabled ? 'never' : 'never',
      sandbox: this.options.writeEnabled ? 'workspace-write' : 'read-only',
      serviceName: 'voice-codex-bridge'
    });
    this.threadId = started.thread.id;
  }

  async prompt(text: string): Promise<void> {
    if (!this.threadId) throw new Error('Codex session was not started.');
    await this.request('turn/start', {
      threadId: this.threadId,
      cwd: this.options.cwd,
      approvalPolicy: 'never',
      sandboxPolicy: this.options.writeEnabled
        ? { type: 'workspaceWrite', writableRoots: [this.options.cwd], networkAccess: false }
        : { type: 'readOnly', networkAccess: false },
      input: [{ type: 'text', text }]
    });
  }

  close(): void {
    this.process?.kill();
    this.stop(new Error('Codex session closed.'));
  }

  private request(method: string, params: unknown): Promise<any> {
    const id = ++this.sequence;
    this.send({ id, method, params });
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  private notify(method: string, params: unknown): void { this.send({ method, params }); }

  private send(message: unknown): void {
    if (!this.process?.stdin.writable) throw new Error('Codex app-server is unavailable.');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let message: RpcMessage;
    try { message = JSON.parse(line) as RpcMessage; } catch { this.emit('diagnostic', `Invalid Codex event: ${line}`); return; }
    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Codex request failed.'));
      else pending.resolve(message.result);
      return;
    }
    if (message.method?.includes('requestApproval') && typeof message.id === 'number') {
      // Voice commands are never allowed to escalate permissions beyond the startup policy.
      this.send({ id: message.id, result: { decision: 'decline' } });
      this.emit('approvalDenied', message.params);
      return;
    }
    if (message.method === 'item/agentMessage/delta') this.emit('text', message.params?.delta ?? '');
    if (message.method === 'turn/completed') this.emit('turnCompleted', message.params);
    this.emit('event', message);
  }

  private stop(error: Error): void {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
    this.process = undefined;
  }
}
