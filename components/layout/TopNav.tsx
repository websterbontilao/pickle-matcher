"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Settings2, ListOrdered, History, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Round", icon: ListOrdered },
  { href: "/upcoming", label: "Upcoming", icon: CalendarClock },
  { href: "/players", label: "Players", icon: Users },
  { href: "/history", label: "History", icon: History },
  { href: "/setup", label: "Setup", icon: Settings2 },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 border-b bg-background">
      <div className="flex">
        {TABS.map(({ href, label, icon: Icon }) => {
          // trailingSlash:true makes pathname "/players/" while hrefs omit it.
          const active = (pathname.replace(/\/+$/, "") || "/") === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 py-1.5 text-xs font-medium transition-colors sm:flex-row sm:gap-1.5 sm:py-2.5 sm:text-sm",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
