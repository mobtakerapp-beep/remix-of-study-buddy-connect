import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Home, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { gradeReview, listDueReviews, type ReviewItem } from "@/lib/review.functions";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "جلسة المراجعة اليومية — مولّد الدروس الذكي" },
      {
        name: "description",
        content:
          "راجعي الأسئلة المستحقة اليوم بنظام التكرار المتباعد، والأسئلة التي أخطأت فيها تعود تلقائيًا.",
      },
      { property: "og:title", content: "جلسة المراجعة اليومية" },
      {
        property: "og:description",
        content: "تكرار متباعد ذكي يعيد لك الأسئلة الصعبة في الوقت المناسب.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const navigate = useNavigate();
  const fetchDue = useServerFn(listDueReviews);
  const grade = useServerFn(gradeReview);

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [upcoming, setUpcoming] = useState(0);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(0);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      try {
        const res = await fetchDue({ data: undefined } as never);
        setItems(res.due);
        setUpcoming(res.upcoming);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchDue, navigate]);

  const current = items[index];

  const choose = async (i: number) => {
    if (picked !== null || !current) return;
    setPicked(i);
    try {
      const res = await grade({ data: { id: current.id, correct: i === current.answerIndex } });
      setNextIn(res.intervalDays);
    } catch {
      setNextIn(null);
    }
  };

  const next = () => {
    setDone((d) => d + 1);
    setPicked(null);
    setNextIn(null);
    setIndex((i) => i + 1);
  };

  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-primary">{t.reviewTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.reviewSub}</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/">
              <Home className="me-1 size-4" />
              {ar ? "الرئيسية" : "Home"}
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t.reviewDue}</p>
            <p className="text-2xl font-extrabold text-primary">{items.length}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t.reviewUpcoming}</p>
            <p className="text-2xl font-extrabold text-muted-foreground">{upcoming}</p>
          </Card>
        </div>

        {loading && (
          <Card className="grid place-items-center p-10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </Card>
        )}

        {!loading && items.length === 0 && (
          <Card className="p-10 text-center text-lg font-semibold">{t.reviewEmpty}</Card>
        )}

        {!loading && items.length > 0 && !current && (
          <Card className="p-10 text-center">
            <h2 className="text-2xl font-extrabold text-emerald">{t.reviewDone}</h2>
            <p className="mt-2 text-muted-foreground">
              {done} / {items.length}
            </p>
            <Button
              className="mt-6 rounded-full"
              onClick={() => {
                setIndex(0);
                setDone(0);
                setPicked(null);
              }}
            >
              <RotateCcw className="me-2 size-4" /> {t.restart}
            </Button>
          </Card>
        )}

        {!loading && current && (
          <>
            <Progress value={(index / items.length) * 100} className="h-3" />
            <Card className="p-6" dir={current.language === "ar" ? "rtl" : "ltr"}>
              {current.topic && (
                <p className="text-xs text-muted-foreground">{current.topic}</p>
              )}
              <p className="mt-2 text-center text-xl font-bold leading-relaxed">
                {current.prompt}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {current.options.map((opt, i) => {
                  const isAnswer = i === current.answerIndex;
                  const state =
                    picked === null
                      ? "idle"
                      : isAnswer
                        ? "correct"
                        : picked === i
                          ? "wrong"
                          : "dim";
                  return (
                    <button
                      key={`${current.id}-${i}`}
                      type="button"
                      disabled={picked !== null}
                      onClick={() => void choose(i)}
                      className={[
                        "flex items-center justify-between gap-3 rounded-2xl border-2 p-4 text-start font-semibold transition-all",
                        state === "idle"
                          ? "border-border bg-card hover:border-primary"
                          : "",
                        state === "correct"
                          ? "border-emerald bg-emerald text-emerald-foreground"
                          : "",
                        state === "wrong" ? "border-destructive bg-destructive/10" : "",
                        state === "dim" ? "border-border opacity-50" : "",
                      ].join(" ")}
                    >
                      <span>{opt}</span>
                      {state === "correct" && <Check className="size-5 shrink-0" />}
                      {state === "wrong" && <X className="size-5 shrink-0 text-destructive" />}
                    </button>
                  );
                })}
              </div>

              {picked !== null && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    {nextIn !== null ? `${t.reviewAgainIn} ${nextIn} ${t.daysWord}` : ""}
                  </p>
                  <Button className="rounded-full" onClick={next}>
                    {t.reviewNext}
                  </Button>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
