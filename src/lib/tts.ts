/** Streaming text-to-speech playback via the app's /api/tts endpoint. */

let currentController: AbortController | null = null;
let currentCtx: AudioContext | null = null;

export function stopSpeech() {
  currentController?.abort();
  currentController = null;
  if (currentCtx) {
    void currentCtx.close().catch(() => {});
    currentCtx = null;
  }
}

/** Split long text into chunks that stay well under the model's input limit. */
export function chunkForTTS(text: string, maxChars = 900): string[] {
  const sentences = text.match(/[^.!?۔؟\n]+[.!?۔؟\n]*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current.trim()) chunks.push(current.trim());
      current = "";
      for (let i = 0; i < sentence.length; i += maxChars) {
        chunks.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    if (current.length + sentence.length > maxChars) {
      if (current.trim()) chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.trim().length > 0);
}

async function playChunkStream(
  ctx: AudioContext,
  text: string,
  lang: "ar" | "en",
  signal: AbortSignal,
  startAt: number,
): Promise<number> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`TTS failed: ${res.status}`);
  }

  let playhead = startAt;
  let pending = new Uint8Array(0);

  const schedule = (incoming: Uint8Array) => {
    const bytes = new Uint8Array(pending.length + incoming.length);
    bytes.set(pending);
    bytes.set(incoming, pending.length);
    const usable = bytes.length - (bytes.length % 2);
    pending = bytes.slice(usable);
    if (usable === 0) return;
    const samples = new Int16Array(bytes.buffer, 0, usable / 2);
    const floats = Float32Array.from(samples, (s) => s / 32768);
    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.copyToChannel(floats, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    playhead = playhead === 0 ? ctx.currentTime + 0.12 : Math.max(playhead, ctx.currentTime);
    source.start(playhead);
    playhead += buffer.duration;
  };

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payloadText = line.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") continue;
        let payload: { type?: string; audio?: string };
        try {
          payload = JSON.parse(payloadText);
        } catch {
          continue;
        }
        if (payload.type !== "speech.audio.delta" || !payload.audio) continue;
        const binary = atob(payload.audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        schedule(bytes);
      }
    }
  }
  return playhead;
}

/** Speak text aloud. Resolves once all audio has been scheduled and played. */
export async function speak(text: string, lang: "ar" | "en" = "ar"): Promise<void> {
  stopSpeech();
  const controller = new AbortController();
  currentController = controller;
  const ctx = new AudioContext({ sampleRate: 24000 });
  currentCtx = ctx;
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  try {
    let playhead = 0;
    for (const chunk of chunkForTTS(text)) {
      if (controller.signal.aborted) return;
      playhead = await playChunkStream(ctx, chunk, lang, controller.signal, playhead);
    }
    const waitMs = Math.max(0, (playhead - ctx.currentTime) * 1000);
    await new Promise((r) => setTimeout(r, waitMs));
  } finally {
    if (currentController === controller) {
      currentController = null;
      if (currentCtx === ctx) {
        void ctx.close().catch(() => {});
        currentCtx = null;
      }
    }
  }
}
