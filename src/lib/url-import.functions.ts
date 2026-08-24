import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const importFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ url: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const { extractFromUrl } = await import("./url-import.server");
    return extractFromUrl(data.url);
  });
