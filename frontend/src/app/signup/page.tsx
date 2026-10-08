"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { FormHeading, TextField } from "@/components/form";
import { Button } from "@/components/ui";
import { ApiError, backendConfigured } from "@/lib/api";
import { isValidPhone } from "@/lib/farm-setup";
import { demoAvailable, loginAsDemo, register } from "@/services/auth";

type Errors = Partial<Record<"name" | "email" | "phone" | "password", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit() {
    const next: Errors = {};
    if (form.name.trim().length < 2) next.name = "Please enter your full name.";
    if (!EMAIL_RE.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (!isValidPhone(form.phone)) next.phone = "Use a Nigerian number like 0803 123 4567.";
    if (form.password.length < 8) next.password = "Use at least 8 characters.";
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0])?.focus();
      return;
    }

    setBusy(true);
    setFormError("");
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.replace(/[\s-]/g, ""),
        password: form.password,
      });
      router.replace("/onboarding");
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  async function demo() {
    setBusy(true);
    setFormError("");
    try {
      const r = await loginAsDemo();
      router.replace(r.hasFarm ? "/app" : "/onboarding");
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <FormHeading sub="It takes a minute. Your phone number lets you chat with FarmAs AI on WhatsApp later.">
        Create your account
      </FormHeading>

      {!backendConfigured && (
        <p role="note" className="mb-6 rounded-2xl border border-warn/40 bg-white p-4 text-sm">
          No server is connected, so sign-up is off. You can still explore the demo farm.
        </p>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-6"
      >
        <TextField id="name" label="Full name" value={form.name} onChange={set("name")} error={errors.name} autoComplete="name" placeholder="e.g. Adewale Johnson" />
        <TextField id="email" label="Email" type="email" inputMode="email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" placeholder="you@example.com" />
        <TextField id="phone" label="Phone number" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} error={errors.phone} autoComplete="tel" placeholder="0803 123 4567" />
        <TextField id="password" label="Password" type="password" value={form.password} onChange={set("password")} error={errors.password} autoComplete="new-password" hint="At least 8 characters." />

        {formError && (
          <p role="alert" className="text-sm font-bold text-critical">
            {formError}
          </p>
        )}

        <Button type="submit" variant="forest" disabled={busy || !backendConfigured} className="w-full !min-h-14 !text-base">
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      {demoAvailable && (
        <div className="mt-8 flex flex-col gap-3 border-t border-forest/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-forest/80">Presenting or just exploring?</p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void demo()} className="shrink-0 whitespace-nowrap">
            Use demo account
          </Button>
        </div>
      )}

      <p className="mt-8 text-forest/80">
        Already have an account?{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
