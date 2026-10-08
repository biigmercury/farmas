"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui";

// `primary` items also appear in the phone's bottom bar (max 5 so it stays readable).
// Everything shows in the desktop sidebar.
const items = [
  { href: "/app", label: "Home", icon: "home", primary: true },
  { href: "/app/ai", label: "AI", icon: "ai", primary: true },
  { href: "/app/inventory", label: "Inventory", short: "Stock", icon: "box", primary: true },
  { href: "/app/livestock", label: "Livestock", icon: "paw", primary: false },
  { href: "/app/health", label: "Health", icon: "heart", primary: false },
  { href: "/app/tasks", label: "Tasks", icon: "check", primary: false },
  { href: "/app/finance", label: "Finance", icon: "coin", primary: true },
  { href: "/app/alerts", label: "Alerts", icon: "bell", primary: true },
];

const ICONS: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  ai: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM9 11h.01M12 11h.01M15 11h.01",
  box: "M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10",
  paw: "M7 14c0-2 2-4 5-4s5 2 5 4-2 5-5 5-5-3-5-5zM5 9h.01M9 5h.01M15 5h.01M19 9h.01",
  heart: "M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z",
  check: "M5 12l5 5 9-10",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9h5a2 2 0 0 1 0 4H9m0-4v8m0-4h5",
  bell: "M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2zM10 21h4",
};

function NavIcon({ name }: { name: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
}

/** Phone / tablet: fixed bottom bar. Hidden on desktop (see SideNav). */
export function BottomNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-forest/15 bg-forest px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {items.filter((i) => i.primary).map((i) => {
          const active = isActive(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 ${
                  active ? "bg-lime text-forest" : "text-lime/80"
                }`}
              >
                <NavIcon name={i.icon} />
                <span className="label text-[0.62rem] leading-none">{"short" in i ? i.short : i.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop: full-height sidebar. Hidden below the lg breakpoint. */
export function SideNav({
  farmName,
  userName,
  onSignOut,
}: {
  farmName: string;
  userName: string;
  onSignOut: () => void;
}) {
  const isActive = useActive();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col justify-between bg-forest p-5 text-lime lg:flex">
      <div>
        <Link href="/" aria-label="FarmAs home" className="block px-2 pb-8">
          <Logo light />
        </Link>
        <nav aria-label="Primary">
          <ul className="space-y-1">
            {items.map((i) => {
              const active = isActive(i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={`label flex min-h-11 items-center gap-3 rounded-full px-4 transition-colors ${
                      active ? "bg-lime text-forest" : "text-lime/80 hover:bg-lime/10"
                    }`}
                  >
                    <NavIcon name={i.icon} />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <div className="rounded-2xl border border-lime/20 p-4">
        <p className="label opacity-70">Farm</p>
        <p className="mt-1 font-bold">{farmName}</p>
        {userName && <p className="mt-1 truncate text-sm text-lime/75">{userName}</p>}
        <button type="button" onClick={onSignOut} className="label mt-3 min-h-11 underline underline-offset-4">
          Log out
        </button>
      </div>
    </aside>
  );
}
