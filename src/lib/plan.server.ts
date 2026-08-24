export type PlanDay = {
  day: string;
  focus: string;
  minutes: number;
  tasks: string[];
};

export type WeeklyPlan = {
  weekStart: string;
  summary: string;
  tip: string;
  days: PlanDay[];
};

export type PlanSignals = {
  language: "ar" | "en";
  grade: number | null;
  lessonTitles: string[];
  weakTopics: { topic: string; accuracy: number }[];
  strongTopics: { topic: string; accuracy: number }[];
  dueReviews: number;
  avgMinutesPerDay: number;
};

const DAYS_AR = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const DAYS_EN = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function fallbackPlan(signals: PlanSignals, weekStart: string): WeeklyPlan {
  const ar = signals.language === "ar";
  const names = ar ? DAYS_AR : DAYS_EN;
  const topics =
    signals.weakTopics.map((w) => w.topic).filter(Boolean).length > 0
      ? signals.weakTopics.map((w) => w.topic)
      : signals.lessonTitles;
  return {
    weekStart,
    summary: ar
      ? "خطة متوازنة تركّز على نقاط الضعف مع مراجعة يومية قصيرة."
      : "A balanced plan focused on your weak spots with a short daily review.",
    tip: ar
      ? "ابدئي كل يوم بخمس دقائق مراجعة قبل الدرس الجديد."
      : "Start each day with five minutes of review before new material.",
    days: names.map((day, i) => ({
      day,
      focus: topics[i % Math.max(1, topics.length)] ?? (ar ? "مراجعة عامة" : "General review"),
      minutes: Math.max(15, Math.min(60, Math.round(signals.avgMinutesPerDay || 25))),
      tasks: ar
        ? ["مراجعة الأسئلة المستحقة", "قراءة الملخص", "لعب اختبار قصير"]
        : ["Clear due review questions", "Read the summary", "Play a short quiz"],
    })),
  };
}

/** Ask the AI gateway for a weekly plan; fall back to a deterministic plan on failure. */
export async function buildWeeklyPlan(
  signals: PlanSignals,
  weekStart: string,
  apiKey: string,
): Promise<WeeklyPlan> {
  const ar = signals.language === "ar";
  const prompt = [
    ar
      ? "أنت مخطط دراسي خبير. أنشئ خطة مذاكرة أسبوعية لسبعة أيام."
      : "You are an expert study coach. Create a seven-day weekly study plan.",
    `Grade: ${signals.grade ?? "unknown"}`,
    `Lessons: ${signals.lessonTitles.slice(0, 12).join(" | ") || "none"}`,
    `Weak topics: ${signals.weakTopics.map((w) => `${w.topic} (${Math.round(w.accuracy * 100)}%)`).join(", ") || "none"}`,
    `Strong topics: ${signals.strongTopics.map((w) => w.topic).join(", ") || "none"}`,
    `Due review questions: ${signals.dueReviews}`,
    `Average study minutes per day: ${Math.round(signals.avgMinutesPerDay)}`,
    ar
      ? "اكتب كل النصوص بالعربية. اجعل التركيز على المواضيع الضعيفة أولًا."
      : "Write everything in English. Prioritise the weak topics.",
    'Return ONLY JSON: {"summary":string,"tip":string,"days":[{"day":string,"focus":string,"minutes":number,"tasks":[string,string,string]}]} with exactly 7 days.',
  ].join("\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`AI plan request failed [${res.status}]: ${body}`);
      return fallbackPlan(signals, weekStart);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<WeeklyPlan>;
    const days = Array.isArray(parsed.days) ? parsed.days.slice(0, 7) : [];
    if (days.length === 0) return fallbackPlan(signals, weekStart);
    return {
      weekStart,
      summary: String(parsed.summary ?? ""),
      tip: String(parsed.tip ?? ""),
      days: days.map((d, i) => ({
        day: String(d?.day ?? (ar ? DAYS_AR[i] : DAYS_EN[i]) ?? ""),
        focus: String(d?.focus ?? ""),
        minutes: Math.max(5, Math.min(180, Number(d?.minutes ?? 25) || 25)),
        tasks: (Array.isArray(d?.tasks) ? d.tasks : []).slice(0, 6).map((x) => String(x)),
      })),
    };
  } catch (err) {
    console.error("AI plan generation error", err);
    return fallbackPlan(signals, weekStart);
  }
}
