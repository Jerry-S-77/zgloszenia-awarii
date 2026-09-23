import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { UrzadzenieSheet } from "@/components/admin/UrzadzenieSheet";
import { ZakladkiAdmina } from "@/components/admin/ZakladkiAdmina";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { ETYKIETY_STATUSU_URZADZENIA, type StatusUrzadzenia } from "@/lib/urzadzenia";
import { wszystkieUrzadzeniaQuery } from "@/lib/urzadzenia-zapytania";

export const Route = createFileRoute("/admin/urzadzenia")({
  head: () => ({ meta: [{ title: "Urządzenia — Ewidencja awarii urządzeń" }] }),
  component: Urzadzenia,
});

const STYL_STATUSU: Record<StatusUrzadzenia, string> = {
  proponowane: "bg-warning text-warning-foreground",
  aktywne: "bg-success text-success-foreground",
  wycofane: "bg-muted text-muted-foreground",
};

function Urzadzenia() {
  const auth = useAuth();
  const jestAdminem = auth.stan === "zalogowany" && auth.profil.rola === "admin";
  const {
    data: urzadzenia = [],
    isLoading,
    isError,
  } = useQuery({ ...wszystkieUrzadzeniaQuery, enabled: jestAdminem });
  const [nowe, setNowe] = useState(false);
  const [wybranyNr, setWybranyNr] = useState<string | null>(null);
  // Zawsze świeży wiersz z zapytania, nie kopia z chwili kliknięcia.
  const wybrany = urzadzenia.find((u) => u.nr_technologiczny === wybranyNr) ?? null;

  return (
    <AppShell title="Urządzenia" dozwoloneRole={["admin"]}>
      <ZakladkiAdmina />
      <Button className="mb-4 h-14 w-full text-base font-bold" onClick={() => setNowe(true)}>
        <Plus className="size-5" /> Dodaj urządzenie
      </Button>

      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          Nie udało się wczytać urządzeń.
        </p>
      )}
      <div className="space-y-3">
        {urzadzenia.map((u) => (
          <button
            key={u.nr_technologiczny}
            type="button"
            onClick={() => setWybranyNr(u.nr_technologiczny)}
            className={`w-full rounded-2xl border border-border bg-card p-4 text-left active:bg-accent ${
              u.status === "wycofane" ? "opacity-60" : ""
            }`}
          >
            <p className="text-base font-bold">
              {u.nr_technologiczny} · {u.nazwa_urzadzenia}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${STYL_STATUSU[u.status]}`}
              >
                {ETYKIETY_STATUSU_URZADZENIA[u.status]}
              </span>
              {u.krytycznosc && <span>{u.krytycznosc}</span>}
              {u.wlasciciel_nazwa && <span>· {u.wlasciciel_nazwa}</span>}
            </div>
          </button>
        ))}
        {!isLoading && !isError && jestAdminem && urzadzenia.length === 0 && (
          <p className="text-muted-foreground">Brak urządzeń.</p>
        )}
      </div>

      <UrzadzenieSheet urzadzenie={null} otwarte={nowe} onZmiana={setNowe} />
      <UrzadzenieSheet
        urzadzenie={wybrany}
        otwarte={wybrany !== null}
        onZmiana={(o) => {
          if (!o) setWybranyNr(null);
        }}
      />
    </AppShell>
  );
}
