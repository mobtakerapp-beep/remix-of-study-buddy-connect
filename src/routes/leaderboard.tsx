import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Home, Loader2, RefreshCw, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { listLeaderboard, syncMyLeaderboard, type LeaderboardRow } from "@/lib/leaderboard.functions";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "لوحة المنافسات — مولّد الدروس الذكي" },
      {
        name: "description",
        content: "لوحة المنافسات بين الطلاب — نقاط تُحسب تلقائيًا من جلسات المذاكرة والاختبارات.",
      },
      { property: "og:title", content: "لوحة المنافسات" },
      {
        property: "og:description",
        content: "نقاطك تُحسب تلقائيًا من جلسات المذاكرة والاختبارات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const navigate = useNavigate();
  const fetchBoard = useServerFn(listLeaderboard);
  const sync = useServerFn(syncMyLeaderboard);

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    try {
      const res = await fetchBoard({ data: undefined } as never);
      setRows(res.rows);
      setMeId(res.meId);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      await load();
      setLoading(false);
    })();
  }, [fetchBoard, navigate]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const me = await sync({ data: undefined } as never);
      await load();
      toast.success(
        ar
          ? `تم تحديث نقاطك: ${me.points} نقطة`
          : `Points updated: ${me.points} points`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      toast.error(msg || (ar ? "فشل التحديث" : "Sync failed"));
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8" dir={ar ? "rtl" : "ltr"}>
      <Toaster position="top-center" />
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-primary">
              <Trophy className="me-2 inline size-6" />
              {t.leaderboardTitle}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.leaderboardSub}</p>
          </div>
          <Link
            to="/"
            aria-label={ar ? "الرجوع للصفحة الرئيسية" : "Back to home"}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Home className="size-4" />
            <span className="hidden sm:inline">{ar ? "الرئيسية" : "Home"}</span>
          </Link>
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="me-2 size-4" />
            )}
            {t.leaderboardSync}
          </Button>
        </div>

        {rows.length === 0 ? (
          <Card className="rounded-3xl p-10 text-center text-muted-foreground">
            {t.leaderboardEmpty}
          </Card>
        ) : (
          <Card className="overflow-hidden rounded-3xl">
            <div className="grid grid-cols-12 gap-2 bg-muted p-4 text-xs font-bold text-muted-foreground">
              <span className="col-span-2 text-center">{t.rank}</span>
              <span className="col-span-5">{t.player}</span>
              <span className="col-span-2 text-center">{t.quizzesWord}</span>
              <span className="col-span-3 text-center">{t.points}</span>
            </div>
            <div className="divide-y divide-border">
              {rows.map((row, i) => {
                const isMe = row.userId === meId;
                return (
                  <div
                    key={row.userId}
                    className={`grid grid-cols-12 items-center gap-2 p-4 ${
                      isMe ? "bg-primary/10" : ""
                    }`}
                  >
                    <span className="col-span-2 text-center font-display text-lg font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="col-span-5 truncate font-semibold text-foreground">
                      {row.displayName}
                      {isMe && (
                        <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                          {ar ? "أنت" : "You"}
                        </span>
                      )}
                    </span>
                    <span className="col-span-2 text-center text-muted-foreground">{row.quizzes}</span>
                    <span className="col-span-3 text-center font-display font-bold text-foreground">
                      {row.points}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
