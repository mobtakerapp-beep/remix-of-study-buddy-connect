import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "إكمال تسجيل الدخول — مولّد الدروس الذكي" },
      { name: "description", content: "جارٍ إكمال تسجيل الدخول…" },
      { property: "og:title", content: "إكمال تسجيل الدخول — مولّد الدروس الذكي" },
      { property: "og:description", content: "جارٍ إكمال تسجيل الدخول إلى مولّد الدروس الذكي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const [message, setMessage] = useState("جارٍ إكمال تسجيل الدخول…");

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        const fullUrl = window.location.href;
        const url = new URL(fullUrl);
        
        // استخراج التوكنات سواء كانت في الـ query أو الـ hash
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        const searchParams = url.searchParams;

        const error = searchParams.get("error") ?? hashParams.get("error");
        const errorDescription = searchParams.get("error_description") ?? hashParams.get("error_description");

        if (error) {
          throw new Error(errorDescription || error);
        }

        const accessToken = hashParams.get("access_token") ?? searchParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token") ?? searchParams.get("refresh_token");
        const code = searchParams.get("code");

        // 1. إذا توفرت التوكنات المباشرة، نقوم بضبط الجلسة فوراً
        if (accessToken && refreshToken) {
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setError) throw setError;
        } 
        // 2. إذا توفر الكود (PKCE Flow)
        else if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        // التأكد النهائي من وجود جلسة نشطة
        const { data: sessionData } = await supabase.auth.getSession();
        
        if (!sessionData.session) {
          // محاولة أخيرة للتحقق من المستخدم
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) {
            throw new Error("تعذر تثبيت جلسة الدخول.");
          }
        }

        if (!cancelled) {
          toast.success("تم تسجيل الدخول بنجاح!");
          
          // التوجيه المباشر إلى الصفحة الرئيسية لنفس الدومين الحالي (Cloudflare Workers)
          window.location.replace(`${window.location.origin}/`);
        }
      } catch (err) {
        const text = err instanceof Error ? err.message : "فشل تسجيل الدخول";
        if (!cancelled) {
          setMessage(text);
          toast.error(text);
          // في حالة الخلل يتم إرجاعه لصفحة الدخول على نفس الدومين
          setTimeout(() => {
            window.location.replace(`${window.location.origin}/auth`);
          }, 2000);
        }
      }
    }

    void handleCallback();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <Loader2 className="size-10 animate-spin text-primary" />
      <p className="text-lg font-medium text-foreground">{message}</p>
    </main>
  );
}
