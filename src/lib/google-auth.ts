import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lovable's managed OAuth broker lives on `/~oauth/*`, which only exists on
 * Lovable preview/published hosting. On any other host (e.g. a self-hosted
 * Cloudflare Worker) that path 404s, so we go straight to the auth provider
 * and come back to the current origin instead.
 */
export function isLovableHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".lovable.app") || host.endsWith(".lovable.dev");
}

export async function signInWithGoogle(): Promise<{ error?: Error | undefined; redirected?: boolean | undefined }> {
  const redirectUri = `${window.location.origin}/auth/callback`;

  if (isLovableHost()) {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { prompt: "select_account" },
    });
    return {
      error: result.error instanceof Error ? result.error : result.error ? new Error(String(result.error)) : undefined,
      redirected: (result as { redirected?: boolean }).redirected,
    };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUri,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) return { error };
  // The browser is navigating to the provider.
  return { redirected: true };
}
