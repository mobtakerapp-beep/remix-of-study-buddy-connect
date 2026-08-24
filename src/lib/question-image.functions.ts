import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({
  prompt: z.string().min(3).max(600),
  topic: z.string().max(200).default(""),
  language: z.enum(["ar", "en"]).default("ar"),
  grade: z.number().int().min(1).max(12).nullable().optional(),
});

/** Generate a classroom-friendly illustration for a single question. */
export const generateQuestionImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }): Promise<{ image: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { generateIllustration } = await import("./question-image.server");
    return generateIllustration(data, key);
  });
