import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarCheck,
  ClipboardPlus,
  Download,
  ListChecks,
  ListTodo,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import {
  czyAktywna,
  czyRola,
  pozycjeNawigacji,
  type IkonaNawigacji,
  type Rola,
} from "@/lib/uprawnienia";
import { BanerOffline } from "./BanerOffline";
import { DoSprawdzenia } from "./DoSprawdzenia";
import { Dzwonek } from "./Dzwonek";
import { MenuUzytkownika } from "./MenuUzytkownika";
import { StatusPolaczenia } from "./StatusPolaczenia";

const IKONY: Record<IkonaNawigacji, LucideIcon> = {
  zglos: ClipboardPlus,
  lista: ListChecks,
  zadania: ListTodo,
  przeglady: CalendarCheck,
  analizy: BarChart3,
  eksport: Download,
  admin: Settings,
};

type Props = { title: string; children: ReactNode; dozwoloneRole?: readonly Rola[] };

export function AppShell({ title, children, dozwoloneRole }: Props) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const wymuszonaZmiana = auth.stan === "zalogowany" && auth.profil.must_change_password;

  useEffect(() => {
    if (auth.stan === "brak") void navigate({ to: "/logowanie" });
    else if (wymuszonaZmiana) void navigate({ to: "/zmiana-hasla" });
  }, [auth.stan, wymuszonaZmiana, navigate]);

  if (auth.stan !== "zalogowany" || wymuszonaZmiana) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Wczytywanie...
      </div>
    );
  }

  const { rola } = auth.profil;
  const pozycje = pozycjeNawigacji(rola);
  const brakDostepu = dozwoloneRole !== undefined && !czyRola(rola, dozwoloneRole);

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-20 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">
              Ewidencja awarii
            </p>
            <h1 className="truncate font-display text-2xl font-bold uppercase tracking-wide">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <DoSprawdzenia />
            <Dzwonek />
            <StatusPolaczenia />
            <MenuUzytkownika />
          </div>
        </div>
      </header>
      <BanerOffline rola={rola} />

      <main className="mx-auto max-w-2xl px-4 py-5">
        {brakDostepu ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Brak dostępu do tego widoku.
          </p>
        ) : (
          children
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl items-end justify-around">
          {pozycje.map((pozycja) => {
            const { to, label, ikona, glowna } = pozycja;
            const Ikona = IKONY[ikona];
            const aktywna = czyAktywna(pathname, pozycja);
            return (
              <Link
                key={`${to}-${label}`}
                to={to}
                aria-current={aktywna ? "page" : undefined}
                className={`flex min-h-14 min-w-16 flex-1 flex-col items-center justify-end gap-1 pb-2 text-xs font-semibold transition-colors ${
                  aktywna ? (glowna ? "text-warning" : "text-primary") : "text-muted-foreground"
                }`}
              >
                {glowna ? (
                  <span className="-mt-5 flex size-14 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-lg">
                    <Ikona className="size-7" />
                  </span>
                ) : (
                  <Ikona className="size-6 shrink-0" />
                )}
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
