import { Link } from "@tanstack/react-router";
import { ClipboardPlus, ListChecks, BarChart3, Download } from "lucide-react";
import type { ReactNode } from "react";
import { StatusPolaczenia } from "./StatusPolaczenia";

const NAV = [
  { to: "/", label: "Zgłoś", icon: ClipboardPlus },
  { to: "/awarie", label: "Awarie", icon: ListChecks },
  { to: "/dashboard", label: "Analizy", icon: BarChart3 },
  { to: "/eksport", label: "Eksport", icon: Download },
] as const;

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">
              Ewidencja awarii
            </p>
            <h1 className="truncate font-display text-2xl font-bold uppercase tracking-wide">{title}</h1>
          </div>
          <StatusPolaczenia />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex flex-col items-center gap-1 py-3 text-xs font-semibold text-muted-foreground transition-colors"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="size-6 shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
