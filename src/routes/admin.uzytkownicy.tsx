import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EdycjaUzytkownikaSheet } from "@/components/admin/EdycjaUzytkownikaSheet";
import { HasloTymczasoweDialog, type DaneHasla } from "@/components/admin/HasloTymczasoweDialog";
import { NoweKontoSheet } from "@/components/admin/NoweKontoSheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { profileQuery } from "@/lib/queries";
import { ETYKIETY_ROL } from "@/lib/uprawnienia";

export const Route = createFileRoute("/admin/uzytkownicy")({
  head: () => ({ meta: [{ title: "Użytkownicy — Ewidencja awarii urządzeń" }] }),
  component: Uzytkownicy,
});

function Uzytkownicy() {
  const auth = useAuth();
  const jestAdminem = auth.stan === "zalogowany" && auth.profil.rola === "admin";
  const {
    data: profile = [],
    isLoading,
    isError,
  } = useQuery({ ...profileQuery, enabled: jestAdminem });
  const [nowe, setNowe] = useState(false);
  const [wybranyId, setWybranyId] = useState<string | null>(null);
  const [haslo, setHaslo] = useState<DaneHasla | null>(null);
  // Profil wybranego użytkownika bierzemy zawsze ze świeżych danych zapytania, nie z kopii.
  const wybrany = profile.find((p) => p.id === wybranyId) ?? null;
  const wlasneId = auth.stan === "zalogowany" ? auth.profil.id : "";

  return (
    <AppShell title="Użytkownicy" dozwoloneRole={["admin"]}>
      <Button className="mb-4 h-14 w-full text-base font-bold" onClick={() => setNowe(true)}>
        <UserPlus className="size-5" /> Nowe konto
      </Button>

      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          Nie udało się wczytać użytkowników.
        </p>
      )}
      {!isLoading && !isError && jestAdminem && profile.length === 0 && (
        <p className="text-muted-foreground">Brak użytkowników.</p>
      )}
      <div className="space-y-3">
        {profile.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setWybranyId(p.id)}
            className={`w-full rounded-2xl border border-border bg-card p-4 text-left active:bg-accent ${
              p.status === "zablokowany" ? "opacity-60" : ""
            }`}
          >
            <p className="text-base font-bold">{p.imie_nazwisko}</p>
            <p className="truncate text-sm text-muted-foreground">{p.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                {ETYKIETY_ROL[p.rola]}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  p.status === "aktywny"
                    ? "bg-success text-success-foreground"
                    : "bg-destructive text-destructive-foreground"
                }`}
              >
                {p.status === "aktywny" ? "Aktywny" : "Zablokowany"}
              </span>
              {p.must_change_password && (
                <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">
                  Zmiana hasła wymagana
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <NoweKontoSheet otwarte={nowe} onZmiana={setNowe} onUtworzono={setHaslo} />
      <EdycjaUzytkownikaSheet
        profil={wybrany}
        wlasneId={wlasneId}
        onZamknij={() => setWybranyId(null)}
        onHaslo={setHaslo}
      />
      <HasloTymczasoweDialog dane={haslo} onZamknij={() => setHaslo(null)} />
    </AppShell>
  );
}
