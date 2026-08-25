"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Auth } from "@/lib/api/resources";
import { ApiError } from "@/lib/api/client";
import { parseApiError } from "@/lib/api/errors";
import { clearSession, setSession } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PhoneCallIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reaching the login page means the session (if any) is dead — clear BOTH
  // stores so the proxy's cookie check can't bounce us straight back to "/"
  // while apiFetch's expired localStorage token 401s "/" back here (the
  // constantly-refreshing login loop). Makes /login a stable sink.
  useEffect(() => {
    clearSession();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, role } = await Auth.login(email, password);
      setSession(token, role);
      router.push("/");
    } catch (err) {
      // A failed sign-in surfaces as a 401, but the shared helper maps 401 to a
      // "session expired" message — which reads wrong on the login form. Treat
      // any 401 here as bad credentials; let the helper handle everything else
      // (server down, validation, 5xx) so the message stays human-readable.
      const message =
        err instanceof ApiError && err.status === 401
          ? "Incorrect email or password."
          : parseApiError(err, "Incorrect email or password.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Subtle radial glow behind the card */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[480px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative flex size-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25">
            <PhoneCallIcon className="size-6 text-primary" aria-hidden />
            <span
              className={cn(
                "absolute -right-1 -top-1 size-2.5 rounded-full bg-primary",
                "ring-2 ring-background",
                "animate-pulse"
              )}
              aria-hidden
            />
          </div>
          <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Command Center
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
              Jerali
            </h1>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Sign in to your account
          </h2>
          <p className="mb-5 text-xs text-muted-foreground">
            Enter your credentials to access the console.
          </p>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="block text-xs font-medium text-muted-foreground"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className={cn(
                  "transition-colors duration-150",
                  error && "border-destructive focus-visible:ring-destructive/50"
                )}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-muted-foreground"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={cn(
                  "transition-colors duration-150",
                  error && "border-destructive focus-visible:ring-destructive/50"
                )}
              />
            </div>

            {/* Inline error state */}
            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="mt-1 w-full font-medium"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
