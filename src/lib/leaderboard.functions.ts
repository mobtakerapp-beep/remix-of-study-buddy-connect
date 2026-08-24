import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  points: number;
  quizzes: number;
  correct: number;
};

function toRow(r: Record<string, unknown>): LeaderboardRow {
  return {
    userId: String(r["user_id"]),
    displayName: String(r["display_name"] ?? "Student"),
    points: Number(r["points"] ?? 0),
    quizzes: Number(r["quizzes"] ?? 0),
    correct: Number(r["correct"] ?? 0),
  };
}

export const listLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: LeaderboardRow[]; meId: string }> => {
    const { data, error } = await context.supabase
      .from("leaderboard_entries" as never)
      .select("user_id, display_name, points, quizzes, correct")
      .order("points", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return {
      rows: ((data ?? []) as unknown[]).map((r) => toRow(r as Record<string, unknown>)),
      meId: context.userId,
    };
  });

const SyncSchema = z.object({ displayName: z.string().max(60).optional() });

/** Recompute the signed-in user's points from their study sessions. */
export const syncMyLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SyncSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<LeaderboardRow> => {
    const [sessionsRes, profileRes] = await Promise.all([
      context.supabase
        .from("study_sessions" as never)
        .select("correct, total, seconds, kind")
        .eq("user_id", context.userId)
        .limit(2000),
      context.supabase
        .from("profiles" as never)
        .select("teacher_name")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);
    if (sessionsRes.error) throw new Error(sessionsRes.error.message);

    let correct = 0;
    let quizzes = 0;
    let minutes = 0;
    for (const raw of (sessionsRes.data ?? []) as unknown[]) {
      const s = raw as Record<string, unknown>;
      correct += Number(s["correct"] ?? 0);
      minutes += Number(s["seconds"] ?? 0) / 60;
      if (String(s["kind"] ?? "") === "quiz") quizzes += 1;
    }
    // 10 points per correct answer, 1 point per study minute, 5 per finished quiz.
    const points = Math.round(correct * 10 + minutes + quizzes * 5);

    const profileName = String(
      (profileRes.data as Record<string, unknown> | null)?.["teacher_name"] ?? "",
    ).trim();
    const claimEmail = String(
      (context as unknown as { claims?: { email?: string } }).claims?.email ?? "",
    );
    const displayName =
      data.displayName?.trim() || profileName || claimEmail.split("@")[0] || "Student";

    const row = {
      user_id: context.userId,
      display_name: displayName.slice(0, 60),
      points,
      quizzes,
      correct,
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("leaderboard_entries" as never)
      .upsert(row as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return toRow(row as unknown as Record<string, unknown>);
  });
