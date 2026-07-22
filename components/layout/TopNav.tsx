"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Settings2, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Round", icon: ListOrdered },
  { href: "/players", label: "Players", icon: Users },
  { href: "/setup", label: "Setup", icon: Settings2 },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 border-b bg-background">
      <div className="flex">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm font-medium transition-colors",
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
