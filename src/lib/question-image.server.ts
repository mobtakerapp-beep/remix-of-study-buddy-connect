type Input = {
  prompt: string;
  topic: string;
  language: "ar" | "en";
  grade?: number | null | undefined;
};

/** Calls the Lovable AI gateway image model and returns a data URL. */
export async function generateIllustration(
  input: Input,
  apiKey: string,
): Promise<{ image: string }> {
  const grade = input.grade ?? 6;
  const description = [
    "Create a clean, friendly educational illustration for a school question.",
    `Topic: ${input.topic || "general lesson"}.`,
    `Question: ${input.prompt}`,
    `Audience: school grade ${grade}.`,
    "Flat vector style, bright colors, soft shapes, white background, no text or letters in the image, no answer spoilers.",
  ].join(" ");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: description }],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Image generation failed [${res.status}]: ${body}`);
    throw new Error(`image_failed_${res.status}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("image_failed_empty");
  return { image: url };
}
