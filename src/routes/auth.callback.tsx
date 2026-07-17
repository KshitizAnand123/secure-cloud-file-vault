import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function finalize() {
      const { data, error } = await supabase.auth.getSession();
      if (!cancelled) {
        if (error) {
          navigate({ to: "/auth" });
          return;
        }

        if (data.session) {
          navigate({ to: "/vault" });
        } else {
          navigate({ to: "/auth" });
        }
      }
    }

    void finalize();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">Finishing sign-in…</p>
    </div>
  );
}
