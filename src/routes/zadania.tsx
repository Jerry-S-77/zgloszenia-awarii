import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { awarieQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { ETYKIETY_STATUSOW } from "@/lib/statusy-awarii";
import type { AwariaLokalna } from "@/lib/types";

export const Route = createFileRoute("/zadania")({
  head: () => ({
    meta: [
      { title: "Zadania — Ewidencja awarii urządzeń" },
      { name: "description", content: "Awarie do przyjęcia i przypisane do bieżącego technika." },
    ],
  }),
  component: Zadania,
});

function Karta({ a }: { a: AwariaLokalna }) {
  return (
    <Link
      to="/awarie/$id"
      params={{ id: a.id }}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-bold">{a.numer ?? "oczekuje na numer"}</span>
          <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">
            {ETYKIETY_STATUSOW[a.status]}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{a.nazwa_urzadzenia}</p>
        <p className="mt-1 line-clamp-2 text-sm">{a.opis_awarii}</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function Zadania() {
  const auth = useAuth();
  const gotowy = auth.stan === "zalogowany" && !auth.profil.must_change_password;
  const { data: awarie = [], isLoading } = useQuery({ ...awarieQuery, enabled: gotowy });
  const userId = auth.stan === "zalogowany" ? auth.profil.id : null;

  const { doPrzyjecia, przypisaneDoMnie } = useMemo(
    () => ({
      doPrzyjecia: awarie.filter((a) => a.status === "zgloszona"),
      przypisaneDoMnie: awarie.filter(
        (a) => a.przypisany_technik_id === userId && a.status !== "zamknieta",
      ),
    }),
    [awarie, userId],
  );

  return (
    <AppShell title="Zadania" dozwoloneRole={["technik", "kierownik", "admin"]}>
      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}

      <section className="mb-6">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Do przyjęcia</h2>
        <div className="space-y-3">
          {doPrzyjecia.map((a) => (
            <Karta key={a.id} a={a} />
          ))}
          {!isLoading && doPrzyjecia.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
              Brak zgłoszeń oczekujących na przyjęcie.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Przypisane do mnie</h2>
        <div className="space-y-3">
          {przypisaneDoMnie.map((a) => (
            <Karta key={a.id} a={a} />
          ))}
          {!isLoading && przypisaneDoMnie.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
              Brak awarii przypisanych do Ciebie.
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
