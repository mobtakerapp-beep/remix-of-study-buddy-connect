import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Bell, BellOff, BookOpen, Clock, Home, Layers, Loader2, ListChecks, Flame, Target, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { listMyLessons, type SavedLesson } from "@/lib/lessons.functions";
import { listMyStudySessions, type StudySession } from "@/lib/study.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "لوحة تقدمي — مولّد الدروس الذكي" },
      {
        name: "description",
        content: "تابع عدد دروسك، أسئلتك، وبطاقاتك التعليمية وتقدمك الأسبوعي في مكان واحد.",
      },
      { property: "og:title", content: "لوحة تقدمي" },
      { property: "og:description", content: "إحصائيات دروسك وتقدمك الأسبوعي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatsPage,
});

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--destructive))",
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function StatsPage() {
  const { lang, t } = useI18n();
  const ar = lang === "ar";
  const navigate = useNavigate();
  const fetchLessons = useServerFn(listMyLessons);
  const fetchSessions = useServerFn(listMyStudySessions);
  const [lessons, setLessons] = useState<SavedLesson[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [reminders, setReminders] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      setReminders(localStorage.getItem("daily-reminder") === "on");
      try {
        const [ls, ss] = await Promise.all([
          fetchLessons({ data: undefined } as never),
          fetchSessions({ data: undefined } as never).catch(() => [] as StudySession[]),
        ]);
        setLessons(ls);
        setSessions(ss);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchLessons, fetchSessions, navigate]);

  const stats = useMemo(() => {
    let mcqs = 0;
    let tf = 0;
    let cards = 0;
    const byGrade = new Map<number, number>();
    for (const l of lessons) {
      const p = l.package;
      mcqs += p?.mcqs?.length ?? 0;
      tf += p?.trueFalse?.length ?? 0;
      cards += p?.flashcards?.length ?? 0;
      const g = Number(p?.grade ?? 0);
      if (g > 0) byGrade.set(g, (byGrade.get(g) ?? 0) + 1);
    }

    const today = startOfDay(new Date());
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - i));
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const count = lessons.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        return t >= day.getTime() && t < next.getTime();
      }).length;
      return {
        label: day.toLocaleDateString(ar ? "ar-EG" : "en-GB", { weekday: "short" }),
        count,
      };
    });

    const days = new Set(lessons.map((l) => startOfDay(new Date(l.createdAt)).getTime()));
    let streak = 0;
    const cursor = new Date(today);
    while (days.has(cursor.getTime())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const gradeData = [...byGrade.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([grade, count]) => ({
        name: ar ? `الصف ${grade}` : `Grade ${grade}`,
        value: count,
      }));

    return { mcqs, tf, cards, weekly, streak, gradeData, total: lessons.length };
  }, [lessons, ar]);

  const study = useMemo(() => {
    const totalSeconds = sessions.reduce((a, s) => a + s.seconds, 0);
    const correct = sessions.reduce((a, s) => a + s.correct, 0);
    const total = sessions.reduce((a, s) => a + s.total, 0);

    const today = startOfDay(new Date());
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - i));
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const minutes = sessions
        .filter((s) => {
          const ts = new Date(s.createdAt).getTime();
          return ts >= day.getTime() && ts < next.getTime();
        })
        .reduce((a, s) => a + s.seconds, 0) / 60;
      return {
        label: day.toLocaleDateString(ar ? "ar-EG" : "en-GB", { weekday: "short" }),
        minutes: Math.round(minutes),
      };
    });

    const byTopic = new Map<string, { correct: number; total: number }>();
    for (const s of sessions) {
      if (!s.topic || s.total === 0) continue;
      const cur = byTopic.get(s.topic) ?? { correct: 0, total: 0 };
      cur.correct += s.correct;
      cur.total += s.total;
      byTopic.set(s.topic, cur);
    }
    const topics = [...byTopic.entries()]
      .map(([topic, v]) => ({ topic, pct: Math.round((v.correct / v.total) * 100), total: v.total }))
      .sort((a, b) => b.pct - a.pct);

    return {
      minutes: Math.round(totalSeconds / 60),
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      weekly,
      strong: topics.filter((x) => x.pct >= 70).slice(0, 5),
      weak: [...topics].reverse().filter((x) => x.pct < 70).slice(0, 5),
      hasData: sessions.length > 0,
    };
  }, [sessions, ar]);

  const toggleReminders = async () => {
    if (reminders) {
      localStorage.setItem("daily-reminder", "off");
      setReminders(false);
      return;
    }
    if (!("Notification" in window)) return void toast.error(t.remindersBlocked);
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return void toast.error(t.remindersBlocked);
    localStorage.setItem("daily-reminder", "on");
    setReminders(true);
    new Notification(t.remindersTitle, { body: t.reminderBody, icon: "/icon-192.png" });
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  const cardsData = [
    {
      icon: BookOpen,
      label: ar ? "الدروس" : "Lessons",
      value: stats.total,
    },
    {
      icon: ListChecks,
      label: ar ? "الأسئلة" : "Questions",
      value: stats.mcqs + stats.tf,
    },
    {
      icon: Layers,
      label: ar ? "البطاقات" : "Flashcards",
      value: stats.cards,
    },
    {
      icon: Clock,
      label: t.studyTime,
      value: `${study.minutes} ${t.minutesShort}`,
    },
    {
      icon: Target,
      label: t.accuracy,
      value: `${study.accuracy}%`,
    },
    {
      icon: Flame,
      label: ar ? "أيام متتالية" : "Day streak",
      value: stats.streak,
    },
  ];

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8" dir={ar ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-primary">
            <BarChart3 className="me-2 inline size-6" />
            {ar ? "لوحة تقدمي" : "My progress"}
          </h1>
          <Link
            to="/"
            aria-label={ar ? "الرجوع للصفحة الرئيسية" : "Back to home"}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Home className="size-4" />
            <span className="hidden sm:inline">{ar ? "الرئيسية" : "Home"}</span>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cardsData.map((c) => (
            <Card key={c.label} className="rounded-3xl p-4">
              <c.icon className="mb-2 size-5 text-primary" />
              <p className="font-display text-2xl font-extrabold text-foreground">{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </Card>
          ))}
        </div>

        {stats.total === 0 ? (
          <Card className="rounded-3xl p-8 text-center text-muted-foreground">
            {ar
              ? "لا توجد بيانات بعد — أنشئي درسًا واحفظيه ليظهر تقدمك هنا."
              : "No data yet — create and save a lesson to see your progress."}
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-3xl p-4">
              <h2 className="mb-3 font-display text-base font-bold text-foreground">
                {ar ? "نشاط آخر ٧ أيام" : "Last 7 days"}
              </h2>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={24} />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="rounded-3xl p-4">
              <h2 className="mb-3 font-display text-base font-bold text-foreground">
                {ar ? "الدروس حسب الصف" : "Lessons by grade"}
              </h2>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.gradeData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {stats.gradeData.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {stats.gradeData.map((g, i) => (
                  <span
                    key={g.name}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {g.name} · {g.value}
                  </span>
                ))}
              </div>
            </Card>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-3xl p-4">
            <h2 className="mb-3 font-display text-base font-bold text-foreground">
              {t.weeklyMinutes}
            </h2>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={study.weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="minutes" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="rounded-3xl p-4">
            <h2 className="mb-3 font-display text-base font-bold text-foreground">
              {t.strongTopics} · {t.weakTopics}
            </h2>
            {!study.hasData ? (
              <p className="text-sm text-muted-foreground">{t.noQuizData}</p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-emerald">{t.strongTopics}</p>
                  {study.strong.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : (
                    study.strong.map((s) => (
                      <div key={`s-${s.topic}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{s.topic}</span>
                        <span className="font-bold text-emerald">{s.pct}%</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-destructive">{t.weakTopics}</p>
                  {study.weak.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : (
                    study.weak.map((s) => (
                      <div key={`w-${s.topic}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{s.topic}</span>
                        <span className="font-bold text-destructive">{s.pct}%</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card className="flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
          <div>
            <p className="flex items-center gap-2 font-display text-base font-bold text-foreground">
              <Bell className="size-4 text-primary" /> {t.remindersTitle}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <WifiOff className="size-3.5" /> {t.offlineHint}
            </p>
          </div>
          <Button variant={reminders ? "default" : "outline"} className="rounded-full" onClick={() => void toggleReminders()}>
            {reminders ? (
              <>
                <BellOff className="me-2 size-4" /> {t.remindersOff}
              </>
            ) : (
              <>
                <Bell className="me-2 size-4" /> {t.remindersOn}
              </>
            )}
          </Button>
        </Card>
      </div>
    </main>
  );
}
