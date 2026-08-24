import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReviewItem = {
  id: string;
  kind: "mcq" | "tf";
  prompt: string;
  options: string[];
  answerIndex: number;
  topic: string;
  grade: number | null;
  language: "ar" | "en";
  reps: number;
  lapses: number;
  intervalDays: number;
  dueAt: string;
};

function toItem(row: Record<string, unknown>): ReviewItem {
  const opts = Array.isArray(row["options"]) ? (row["options"] as unknown[]) : [];
  return {
    id: String(row["id"]),
    kind: row["kind"] === "tf" ? "tf" : "mcq",
    prompt: String(row["prompt"] ?? ""),
    options: opts.map((o) => String(o)),
    answerIndex: Number(row["answer_index"] ?? 0),
    topic: String(row["topic"] ?? ""),
    grade: row["grade"] == null ? null : Number(row["grade"]),
    language: row["language"] === "en" ? "en" : "ar",
    reps: Number(row["reps"] ?? 0),
    lapses: Number(row["lapses"] ?? 0),
    intervalDays: Number(row["interval_days"] ?? 0),
    dueAt: String(row["due_at"] ?? new Date().toISOString()),
  };
}

/** Stable, non-cryptographic hash so the same question maps to one review row. */
export function questionHash(topic: string, prompt: string): string {
  const s = `${topic}::${prompt}`.replace(/\s+/g, " ").trim().toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 + c * (i + 7)) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

const CardSchema = z.object({
  kind: z.enum(["mcq", "tf"]),
  prompt: z.string().min(1).max(1000),
  options: z.array(z.string().max(400)).max(8),
  answerIndex: z.number().int().min(0).max(7),
  wasWrong: z.boolean().default(false),
});

const AddSchema = z.object({
  lessonId: z.string().uuid().nullable().optional(),
  topic: z.string().max(200).default(""),
  grade: z.number().int().min(1).max(12).nullable().optional(),
  language: z.enum(["ar", "en"]).default("ar"),
  cards: z.array(CardSchema).min(1).max(100),
});

/** Schedule questions for spaced repetition. Wrong answers come back tomorrow. */
export const addReviewItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => AddSchema.parse(input))
  .handler(async ({ data, context }) => {
    const now = Date.now();
    const rows = data.cards.map((c) => ({
      user_id: context.userId,
      lesson_id: data.lessonId ?? null,
      question_hash: questionHash(data.topic, c.prompt),
      kind: c.kind,
      prompt: c.prompt,
      options: c.options,
      answer_index: c.answerIndex,
      topic: data.topic,
      grade: data.grade ?? null,
      language: data.language,
      interval_days: c.wasWrong ? 1 : 3,
      reps: c.wasWrong ? 0 : 1,
      lapses: c.wasWrong ? 1 : 0,
      last_result: !c.wasWrong,
      due_at: new Date(now + (c.wasWrong ? 1 : 3) * 86400000).toISOString(),
      updated_at: new Date(now).toISOString(),
    }));
    const { error } = await context.supabase
      .from("review_items" as never)
      .upsert(rows as never, { onConflict: "user_id,question_hash" });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

export const listDueReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ due: ReviewItem[]; upcoming: number }> => {
    const nowIso = new Date().toISOString();
    const [dueRes, allRes] = await Promise.all([
      context.supabase
        .from("review_items" as never)
        .select("*")
        .eq("user_id", context.userId)
        .lte("due_at", nowIso)
        .order("due_at", { ascending: true })
        .limit(40),
      context.supabase
        .from("review_items" as never)
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .gt("due_at", nowIso),
    ]);
    if (dueRes.error) throw new Error(dueRes.error.message);
    return {
      due: ((dueRes.data ?? []) as unknown[]).map((r) => toItem(r as Record<string, unknown>)),
      upcoming: allRes.count ?? 0,
    };
  });

const GradeSchema = z.object({ id: z.string().uuid(), correct: z.boolean() });

/** SM-2 style scheduling: correct answers stretch the interval, mistakes reset it. */
export const gradeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => GradeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("review_items" as never)
      .select("ease, interval_days, reps, lapses")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .limit(1);
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("Review item not found");

    let ease = Number(row["ease"] ?? 2.5);
    let interval = Number(row["interval_days"] ?? 0);
    const reps = Number(row["reps"] ?? 0);
    const lapses = Number(row["lapses"] ?? 0);

    if (data.correct) {
      ease = Math.min(3.2, ease + 0.1);
      interval = interval <= 0 ? 1 : Math.min(180, Math.round(Math.max(1, interval) * ease));
    } else {
      ease = Math.max(1.4, ease - 0.25);
      interval = 1;
    }

    const { error: upErr } = await context.supabase
      .from("review_items" as never)
      .update({
        ease,
        interval_days: interval,
        reps: data.correct ? reps + 1 : reps,
        lapses: data.correct ? lapses : lapses + 1,
        last_result: data.correct,
        due_at: new Date(Date.now() + interval * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, intervalDays: interval };
  });
