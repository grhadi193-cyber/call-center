# Voice ↔ Gemini Live ↔ Codex Bridge

The default, no-telecom-cost route is a private voice page: open it from your phone and speak Persian to Gemini Live, then ask a local Codex session to inspect or work in one configured project. It intentionally uses Codex app-server instead of automating an open ChatGPT window: app-server gives the integration its own persistent Codex thread, approvals, and event stream.

## Safety model

- The local voice WebSocket needs `LOCAL_ACCESS_TOKEN`; the service binds to `127.0.0.1` by default.
- The optional phone adapter accepts only Twilio-signed webhooks from a number in `ALLOWED_CALLERS`.
- The Codex working directory is fixed to `CODEX_PROJECT_DIR`.
- `VOICE_WRITE_ENABLED=false` is the default and gives Codex a read-only sandbox. Set it to `true` only after testing with your own caller number.
- No secret is read from or written to source control. Put provider values only in `.env`.

## Run locally

1. Copy `.env.example` to `.env` and set the values. `CODEX_PROJECT_DIR` must be the absolute path of the project Codex is allowed to touch.
2. Run `npm install`, then `npm run check`.
3. Start the service with `npm run dev`, then open `http://127.0.0.1:8787` on the same computer.
4. For your phone, join the same private network (for example a personal Tailscale network) and open the same page through the computer's private address. There is no phone-number, call-provider, or public tunnel fee.
5. Start in read-only mode; after a successful call, set `VOICE_WRITE_ENABLED=true` if you want voice commands to make edits.

## Provider boundary

The optional phone adapter is Twilio Media Streams because it provides a documented live-media path. The bridge is deliberately split into adapters, `GeminiVoiceSession`, and `CodexSession`; a WhatsApp Business Calling adapter can feed the same voice core once its business calling access and callback contract are enabled. Do not automate a personal WhatsApp or ChatGPT desktop interface for this.

## Operational notes

Gemini Live accepts 16 kHz PCM input and produces 24 kHz PCM output. The bridge performs G.711 μ-law conversion and fixed-ratio resampling for telephony. Codex app-server is spawned locally and keeps one conversation for the call, so the spoken request and coding work remain connected.

For production, run behind TLS, set network firewall rules, keep the caller allowlist narrow, rotate provider credentials, and add an audit sink for call ID plus Codex task summary (never raw audio or secrets).
