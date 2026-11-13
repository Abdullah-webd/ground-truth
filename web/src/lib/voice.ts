import type { UiCommand } from "./agent";

/** Live voice with OpenAI gpt-realtime-2.1 over WebRTC. Tool calls run on our backend. */

export type VoiceState = "connecting" | "listening" | "thinking" | "speaking" | "closed";

export interface VoiceHandlers {
  onState: (s: VoiceState) => void;
  onUserSpeechStart: () => void;
  onUserText: (text: string) => void;
  onToolStart: (id: string, label: string) => void;
  onToolDone: (id: string, ok: boolean, error?: string) => void;
  onUi: (cmd: UiCommand) => void;
  onAssistantDelta: (delta: string) => void;
  onAnswerDone: (unverified: string[]) => void;
  onError: (message: string) => void;
}

interface FunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

export class VoiceSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private transcript = "";
  private results: unknown[] = [];
  private h: VoiceHandlers;

  constructor(handlers: VoiceHandlers) {
    this.h = handlers;
  }

  async start() {
    this.h.onState("connecting");
    try {
      const res = await fetch("/api/voice/session", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? `Voice session failed (${res.status})`);
      const key: string = body.value;

      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const pc = new RTCPeerConnection();
      this.pc = pc;
      this.audio = document.createElement("audio");
      this.audio.autoplay = true;
      pc.ontrack = (e) => {
        if (this.audio) this.audio.srcObject = e.streams[0];
      };
      pc.addTrack(this.mic.getTracks()[0], this.mic);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.h.onError("The voice connection dropped. Press Talk to reconnect.");
          this.stop();
        }
      };

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.addEventListener("open", () => this.h.onState("listening"));
      dc.addEventListener("message", (e) => this.onEvent(JSON.parse(e.data)));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
      });
      if (!sdp.ok) throw new Error(`OpenAI refused the voice connection (${sdp.status}).`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
    } catch (err) {
      const e = err as Error;
      const message =
        e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow the microphone for this site and press Talk again."
          : e.message;
      this.h.onError(message);
      this.stop();
    }
  }

  stop() {
    this.dc?.close();
    this.pc?.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.audio) this.audio.srcObject = null;
    this.pc = null;
    this.dc = null;
    this.mic = null;
    this.h.onState("closed");
  }

  private send(event: object) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }

  private async onEvent(e: { type: string; [k: string]: unknown }) {
    switch (e.type) {
      case "input_audio_buffer.speech_started":
        this.transcript = "";
        this.results = [];
        this.h.onUserSpeechStart();
        this.h.onState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        this.h.onState("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.h.onUserText(String(e.transcript ?? "").trim());
        break;
      case "response.output_audio_transcript.delta":
        this.transcript += String(e.delta ?? "");
        this.h.onState("speaking");
        this.h.onAssistantDelta(String(e.delta ?? ""));
        break;
      case "response.done": {
        const response = e.response as { output?: Array<{ type: string }>; status?: string };
        const calls = (response.output ?? []).filter((o): o is FunctionCall => o.type === "function_call");
        if (calls.length) {
          this.h.onState("thinking");
          await Promise.all(calls.map((c) => this.runTool(c)));
          this.send({ type: "response.create" });
        } else if (response.status === "completed") {
          await this.finishAnswer();
        }
        break;
      }
      case "output_audio_buffer.stopped":
        this.h.onState("listening");
        break;
      case "error": {
        const err = e.error as { message?: string; code?: string } | undefined;
        // Cancelling a response that already finished is harmless; don't alarm the user.
        if (err?.code !== "response_cancel_not_active") this.h.onError(err?.message ?? "Voice error");
        break;
      }
    }
  }

  private async runTool(c: FunctionCall) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(c.arguments || "{}");
    } catch {
      /* the backend will report missing arguments */
    }
    let output: unknown;
    try {
      const res = await fetch("/api/voice/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: c.name, arguments: args }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `Tool failed (${res.status})`);
      this.h.onToolStart(c.call_id, body.label);
      for (const cmd of body.ui as UiCommand[]) this.h.onUi(cmd);
      output = body.result;
      this.h.onToolDone(c.call_id, !(body.result && "error" in body.result), body.result?.error);
    } catch (err) {
      output = { error: (err as Error).message };
      this.h.onToolStart(c.call_id, c.name);
      this.h.onToolDone(c.call_id, false, (err as Error).message);
    }
    this.results.push(output);
    this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(output) } });
  }

  private async finishAnswer() {
    let unverified: string[] = [];
    if (this.transcript.trim()) {
      try {
        const res = await fetch("/api/voice/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: this.transcript, results: this.results }),
        });
        if (res.ok) unverified = (await res.json()).unverified_numbers ?? [];
      } catch {
        /* checking is best-effort; the answer stands */
      }
    }
    this.h.onAnswerDone(unverified);
  }
}
