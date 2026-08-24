import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Calendar, Home, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { generateWeeklyPlan, getWeeklyPlan, type WeeklyPlan } from "@/lib/plan.functions";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "خطة المذاكرة الأسبوعية — مولّد الدروس الذكي" },
      {
        name: "description",
        content: "خطة مذاكرة أسبوعية مبنية على دروسك ونتائج اختباراتك ونقاط ضعفك.",
      },
      { property: "og:title", content: "خطة المذاكرة الأسبوعية" },
      {
        property: "og:description",
        content: "خطة مذاكرة أسبوعية مبنية على دروسك ونتائج اختباراتك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const navigate = useNavigate();
  const fetchPlan = useServerFn(getWeeklyPlan);
  const generate = useServerFn(generateWeeklyPlan);

  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      try {
        const p = await fetchPlan({ data: undefined } as never);
        setPlan(p);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchPlan, navigate]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const p = await generate({ data: { language: ar ? "ar" : "en", grade: null } });
      setPlan(p);
      toast.success(ar ? "تم إعداد الخطة ✅" : "Plan ready ✅");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      toast.error(msg || (ar ? "فشل إعداد الخطة" : "Failed to build plan"));
    } finally {
      setGenerating(false);
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
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-primary">
              <Calendar className="me-2 inline size-6" />
              {t.planTitle}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.planSub}</p>
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

        {!plan ? (
          <Card className="rounded-3xl p-10 text-center">
            <p className="text-muted-foreground">{t.planEmpty}</p>
            <Button className="mt-6 rounded-full" onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="me-2 size-4" />
              )}
              {generating ? t.planGenerating : t.planGenerate}
            </Button>
          </Card>
        ) : (
          <>
            <Card className="rounded-3xl p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">{plan.summary}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-primary">{t.planTip}:</span> {plan.tip}
                  </p>
                </div>
                <Button
                  className="shrink-0 rounded-full"
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="me-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="me-2 size-4" />
                  )}
                  {generating ? t.planGenerating : t.planGenerate}
                </Button>
              </div>
            </Card>

            <div className="grid gap-4">
              {plan.days.map((day, i) => (
                <Card key={i} className="rounded-3xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-primary">{day.day}</p>
                      <p className="mt-1 font-display text-base font-bold text-foreground">
                        {t.planFocus}: {day.focus}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      {day.minutes} {t.planMinutes}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {day.tasks.map((task, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        {task}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
