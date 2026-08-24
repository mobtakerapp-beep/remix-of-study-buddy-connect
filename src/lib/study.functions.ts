import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StudySession = {
  id: string;
  lessonId: string | null;
  topic: string;
  grade: number | null;
  seconds: number;
  correct: number;
  total: number;
  kind: string;
  createdAt: string;
};

function toSession(row: Record<string, unknown>): StudySession {
  return {
    id: String(row["id"]),
    lessonId: row["lesson_id"] ? String(row["lesson_id"]) : null,
    topic: String(row["topic"] ?? ""),
    grade: row["grade"] == null ? null : Number(row["grade"]),
    seconds: Number(row["seconds"] ?? 0),
    correct: Number(row["correct"] ?? 0),
    total: Number(row["total"] ?? 0),
    kind: String(row["kind"] ?? "study"),
    createdAt: String(row["created_at"]),
  };
}

const LogSchema = z.object({
  lessonId: z.string().uuid().nullable().optional(),
  topic: z.string().max(200).default(""),
  grade: z.number().int().min(1).max(12).nullable().optional(),
  seconds: z.number().int().min(0).max(60 * 60 * 6).default(0),
  correct: z.number().int().min(0).max(500).default(0),
  total: z.number().int().min(0).max(500).default(0),
  kind: z.enum(["study", "quiz", "listen"]).default("study"),
});

export const logStudySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => LogSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("study_sessions" as any).insert({
      user_id: context.userId,
      lesson_id: data.lessonId ?? null,
      topic: data.topic,
      grade: data.grade ?? null,
      seconds: data.seconds,
      correct: data.correct,
      total: data.total,
      kind: data.kind,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyStudySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudySession[]> => {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString();
    const { data, error } = await context.supabase
      .from("study_sessions" as any)
      .select("id, lesson_id, topic, grade, seconds, correct, total, kind, created_at")
      .eq("user_id", context.userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: unknown) => toSession(r as Record<string, unknown>));
  });
