import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  text: z.string().min(1).max(3500),
  voice: z.string().max(40).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  lang: z.enum(["ar", "en"]).optional(),
});

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("TTS not configured", { status: 500 });

        let parsed;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid request", { status: 400 });
        }

        const instructions =
          parsed.lang === "ar"
            ? "Read clearly in Modern Standard Arabic with a warm, friendly teacher tone, at a calm pace suitable for students."
            : "Read clearly in English with a warm, friendly teacher tone, at a calm pace suitable for students.";

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: parsed.text,
            voice: parsed.voice ?? "alloy",
            speed: parsed.speed ?? 1,
            instructions,
            stream_format: "sse",
            response_format: "pcm",
          }),
        });

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          return new Response(detail || "TTS failed", { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
