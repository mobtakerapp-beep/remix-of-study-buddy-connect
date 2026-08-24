import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WeeklyPlan, PlanSignals } from "./plan.server";

export type { WeeklyPlan, PlanDay } from "./plan.server";

const GenerateSchema = z.object({
  language: z.enum(["ar", "en"]).default("ar"),
  grade: z.number().int().min(1).max(12).nullable().optional(),
});

function weekStartIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Week starts on Saturday.
  const shift = (d.getUTCDay() + 1) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

export const getWeeklyPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WeeklyPlan | null> => {
    const { data, error } = await context.supabase
      .from("study_plans" as never)
      .select("plan, week_start")
      .eq("user_id", context.userId)
      .eq("week_start", weekStartIso())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return (data as unknown as { plan: WeeklyPlan }).plan;
  });

export const generateWeeklyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => GenerateSchema.parse(input))
  .handler(async ({ data, context }): Promise<WeeklyPlan> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const weekStart = weekStartIso();
    const nowIso = new Date().toISOString();
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

    const [lessonsRes, sessionsRes, dueRes] = await Promise.all([
      context.supabase
        .from("user_lessons" as never)
        .select("title")
        .eq("user_id", context.userId)
        .order("updated_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("study_sessions" as never)
        .select("topic, correct, total, seconds, created_at")
        .eq("user_id", context.userId)
        .gte("created_at", since)
        .limit(400),
      context.supabase
        .from("review_items" as never)
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .lte("due_at", nowIso),
    ]);

    const lessonTitles = ((lessonsRes.data ?? []) as unknown[])
      .map((r) => String((r as Record<string, unknown>)["title"] ?? ""))
      .filter(Boolean);

    const sessions = ((sessionsRes.data ?? []) as unknown[]).map(
      (r) => r as Record<string, unknown>,
    );
    const byTopic = new Map<string, { correct: number; total: number }>();
    let totalSeconds = 0;
    for (const s of sessions) {
      totalSeconds += Number(s["seconds"] ?? 0);
      const topic = String(s["topic"] ?? "").trim();
      const total = Number(s["total"] ?? 0);
      if (!topic || total <= 0) continue;
      const acc = byTopic.get(topic) ?? { correct: 0, total: 0 };
      acc.correct += Number(s["correct"] ?? 0);
      acc.total += total;
      byTopic.set(topic, acc);
    }
    const scored = [...byTopic.entries()].map(([topic, v]) => ({
      topic,
      accuracy: v.total ? v.correct / v.total : 0,
    }));
    scored.sort((a, b) => a.accuracy - b.accuracy);

    const signals: PlanSignals = {
      language: data.language,
      grade: data.grade ?? null,
      lessonTitles,
      weakTopics: scored.filter((s) => s.accuracy < 0.75).slice(0, 5),
      strongTopics: [...scored].reverse().filter((s) => s.accuracy >= 0.75).slice(0, 5),
      dueReviews: dueRes.count ?? 0,
      avgMinutesPerDay: Math.round(totalSeconds / 60 / 30),
    };

    const { buildWeeklyPlan } = await import("./plan.server");
    const plan = await buildWeeklyPlan(signals, weekStart, key);

    const { error } = await context.supabase
      .from("study_plans" as never)
      .upsert(
        { user_id: context.userId, week_start: weekStart, plan } as never,
        { onConflict: "user_id,week_start" },
      );
    if (error) throw new Error(error.message);
    return plan;
  });
