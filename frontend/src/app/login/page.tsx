"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { FormHeading, TextField } from "@/components/form";
import { Button } from "@/components/ui";
import { ApiError, backendConfigured } from "@/lib/api";
import { demoAvailable, login, loginAsDemo } from "@/services/auth";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ hasFarm: boolean }>) {
    setBusy(true);
    setFormError("");
    try {
      const r = await action();
      router.replace(r.hasFarm ? "/app" : "/onboarding");
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  function submit() {
    const next: typeof errors = {};
    if (!identifier.trim()) next.identifier = "Enter your email or phone number.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0])?.focus();
      return;
    }
    void run(() => login(identifier.trim(), password));
  }

  return (
    <AuthShell>
      <FormHeading sub="Log in to see your farm.">Welcome back</FormHeading>

      {!backendConfigured && (
        <p role="note" className="mb-6 rounded-2xl border border-warn/40 bg-white p-4 text-sm">
          No server is connected, so login is off. You can still explore the demo farm.
        </p>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <TextField
          id="identifier"
          label="Email or phone number"
          value={identifier}
          onChange={(v) => {
            setIdentifier(v);
            setErrors((x) => ({ ...x, identifier: undefined }));
          }}
          error={errors.identifier}
          autoComplete="username"
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setErrors((x) => ({ ...x, password: undefined }));
          }}
          error={errors.password}
          autoComplete="current-password"
        />

        {formError && (
          <p role="alert" className="text-sm font-bold text-critical">
            {formError}
          </p>
        )}

        <Button type="submit" variant="forest" disabled={busy || !backendConfigured} className="w-full !min-h-14 !text-base">
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>

      {demoAvailable && (
        <div className="mt-8 flex flex-col gap-3 border-t border-forest/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-forest/80">Presenting or just exploring?</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void run(loginAsDemo)}
            className="shrink-0 whitespace-nowrap"
          >
            Use demo account
          </Button>
        </div>
      )}

      <p className="mt-8 text-forest/80">
        New here?{" "}
        <Link href="/signup" className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
