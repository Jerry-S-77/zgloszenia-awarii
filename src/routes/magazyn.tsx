import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, FileUp, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PrzelacznikOpcji } from "@/components/analizy/Pareto";
import { CzescMagazynuSheet } from "@/components/magazyn/CzescMagazynuSheet";
import { ImportMagazynuSheet } from "@/components/magazyn/ImportMagazynuSheet";
import { NowaCzescSheet } from "@/components/magazyn/NowaCzescSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/hooks/use-online";
import { useAuth } from "@/lib/auth";
import { formatujIlosc, magazynQuery, niskiStan } from "@/lib/magazyn";
import { czyRola } from "@/lib/uprawnienia";

export const Route = createFileRoute("/magazyn")({
  head: () => ({
    meta: [
      { title: "Magazyn części — Ewidencja awarii urządzeń" },
      { name: "description", content: "Stany części zamiennych, dostawy, korekty i import." },
    ],
  }),
  component: Magazyn,
});

type Filtr = "wszystkie" | "niski" | "wycofane";

function Magazyn() {
  const auth = useAuth();
  const online = useOnline();
  const rola = auth.stan === "zalogowany" ? auth.profil.rola : null;
  const dostep =
    auth.stan === "zalogowany" &&
    !auth.profil.must_change_password &&
    czyRola(rola, ["technik", "kierownik", "admin"]);
  const zarzadza = czyRola(rola, ["kierownik", "admin"]);
  const { data: czesci = [], isLoading, isError } = useQuery({ ...magazynQuery, enabled: dostep });
  const [szukaj, setSzukaj] = useState("");
  const [filtr, setFiltr] = useState<Filtr>("wszystkie");
  const [wybranaId, setWybranaId] = useState<string | null>(null);
  const [nowa, setNowa] = useState(false);
  const [importOtwarty, setImportOtwarty] = useState(false);

  const widoczne = useMemo(() => {
    const f = szukaj.trim().toLowerCase();
    return czesci.filter((c) => {
      if (filtr === "wycofane" ? c.aktywna : !c.aktywna) return false;
      if (filtr === "niski" && !niskiStan(c)) return false;
      if (!f) return true;
      return [
        c.nazwa,
        c.numer_katalogowy,
        c.lokalizacja ?? "",
        ...c.urzadzenia_czesci.map((u) => u.nr_technologiczny),
      ]
        .join(" ")
        .toLowerCase()
        .includes(f);
    });
  }, [czesci, szukaj, filtr]);
  const liczbaNiskich = czesci.filter((c) => c.aktywna && niskiStan(c)).length;
  // Zawsze świeży obiekt z listy, żeby arkusz pokazywał stan po przyjęciu/korekcie.
  const wybrana = czesci.find((c) => c.id === wybranaId) ?? null;

  return (
    <AppShell title="Magazyn" dozwoloneRole={["technik", "kierownik", "admin"]}>
      {zarzadza && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Button className="h-12" disabled={!online} onClick={() => setNowa(true)}>
            <Plus className="size-5" /> Dodaj część
          </Button>
          <Button
            variant="outline"
            className="h-12"
            disabled={!online}
            onClick={() => setImportOtwarty(true)}
          >
            <FileUp className="size-5" /> Import z pliku
          </Button>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Szukaj części"
          placeholder="Szukaj: nazwa, numer, urządzenie"
          value={szukaj}
          onChange={(e) => setSzukaj(e.target.value)}
          className="h-12 pl-10 text-base"
        />
      </div>
      <div className="mb-4">
        <PrzelacznikOpcji<Filtr>
          etykieta="Filtr magazynu"
          wartosc={filtr}
          onZmiana={setFiltr}
          opcje={[
            { wartosc: "wszystkie", etykieta: "Wszystkie" },
            { wartosc: "niski", etykieta: `Niski stan (${liczbaNiskich})` },
            ...(zarzadza ? [{ wartosc: "wycofane" as const, etykieta: "Wycofane" }] : []),
          ]}
        />
      </div>

      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Nie udało się wczytać magazynu. Sprawdź połączenie.
        </p>
      )}
      {!isLoading && !isError && widoczne.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
          {czesci.length === 0
            ? "Magazyn jest pusty. Dodaj części albo zaimportuj je z pliku."
            : "Brak części spełniających kryteria."}
        </p>
      )}
      <ul className="space-y-2">
        {widoczne.map((c) => {
          const niski = niskiStan(c);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setWybranaId(c.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left active:bg-accent ${niski ? "border-destructive" : "border-border"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.nazwa}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.numer_katalogowy}
                    {c.lokalizacja ? ` · ${c.lokalizacja}` : ""}
                    {c.urzadzenia_czesci.length
                      ? ` · ${c.urzadzenia_czesci.map((u) => u.nr_technologiczny).join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`font-display text-xl font-bold ${niski ? "text-destructive" : ""}`}
                  >
                    {formatujIlosc(c.stan, c.jednostka)}
                  </p>
                  {niski ? (
                    <p className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                      <AlertTriangle className="size-3.5" /> min {c.stan_minimalny}
                    </p>
                  ) : (
                    c.stan_minimalny > 0 && (
                      <p className="text-xs text-muted-foreground">min {c.stan_minimalny}</p>
                    )
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <CzescMagazynuSheet
        czesc={wybrana}
        onZamknij={() => setWybranaId(null)}
        zarzadza={zarzadza}
      />
      {zarzadza && (
        <>
          <NowaCzescSheet otwarte={nowa} onZmiana={setNowa} />
          <ImportMagazynuSheet
            otwarte={importOtwarty}
            onZmiana={setImportOtwarty}
            czesci={czesci}
          />
        </>
      )}
    </AppShell>
  );
}
