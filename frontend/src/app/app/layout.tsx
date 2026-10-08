"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/ui";
import { BottomNav, SideNav } from "@/components/bottom-nav";
import { Loading } from "@/components/states";
import { backendConfigured } from "@/lib/api";
import { useSession, useSessionReady } from "@/lib/session";
import { farm as demoFarm } from "@/lib/demo-data";
import { logout } from "@/services/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const ready = useSessionReady();

  // With a server, the app is for logged-in farmers who have a farm. Without one it shows the demo farm.
  const needsLogin = backendConfigured && ready && !session.token;
  const needsFarm = backendConfigured && ready && !!session.token && !session.farmId;

  useEffect(() => {
    if (needsLogin) router.replace("/login");
    else if (needsFarm) router.replace("/onboarding");
  }, [needsLogin, needsFarm, router]);

  if (backendConfigured && (!ready || needsLogin || needsFarm)) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-10">
        <Loading label="Opening your farm…" />
      </div>
    );
  }

  const farmName = backendConfigured ? session.farmName || "Your farm" : demoFarm.name;
  const userName = backendConfigured ? session.user?.name ?? "" : "Demo";

  function signOut() {
    logout();
    router.replace(backendConfigured ? "/login" : "/");
  }

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[16rem_1fr]">
      <SideNav farmName={farmName} userName={userName} onSignOut={signOut} />
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="flex items-center justify-between bg-lime px-5 py-3 lg:hidden">
          <Link href="/" aria-label="FarmAs home" className="inline-flex min-h-11 items-center">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="label max-w-[8rem] truncate">{farmName}</span>
            <button type="button" onClick={signOut} className="label min-h-11 underline underline-offset-4">
              {backendConfigured ? "Log out" : "Exit"}
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 pt-5 pb-28 md:px-8 lg:px-10 lg:py-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
