import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui";

/** Shared frame for the login and sign-up pages. Same look as onboarding. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between bg-forest p-8 text-lime lg:flex">
        <Link href="/" aria-label="FarmAs home" className="inline-flex min-h-11 items-center">
          <Logo light />
        </Link>
        <p className="max-w-[16rem] text-lime/80">
          Talk to your farm the way you talk. FarmAs AI turns it into records, answers and early warnings.
        </p>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="bg-lime px-5 py-3 lg:hidden">
          <Link href="/" aria-label="FarmAs home" className="inline-flex min-h-11 items-center">
            <Logo />
          </Link>
        </header>
        <main className="flex-1 px-5 py-10 md:px-10 lg:px-16 lg:py-16">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
