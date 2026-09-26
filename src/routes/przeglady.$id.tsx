import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardCheck, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BanerPropozycji } from "@/components/przeglady/BanerPropozycji";
import { EdycjaHarmonogramuSheet } from "@/components/przeglady/EdycjaHarmonogramuSheet";
import { OdnotujWykonanieSheet } from "@/components/przeglady/OdnotujWykonanieSheet";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";
import { useAuth } from "@/lib/auth";
import {
  dzisLokalnie,
  ETYKIETY_STATUSU_PRZEGLADU,
  formatujDate,
  KOLOR_STATUSU,
  opisTerminu,
  roznicaDni,
  statusPrzegladu,
} from "@/lib/przeglady";
import {
  oczekujacaPropozycja,
  przegladyQuery,
  wykonaniaQuery,
  zdecydujPropozycje,
} from "@/lib/przeglady-zapytania";
import { czyRola } from "@/lib/uprawnienia";

export const Route = createFileRoute("/przeglady/$id")({
  head: () => ({
    meta: [
      { title: "Przegląd — Ewidencja awarii urządzeń" },
      { name: "description", content: "Karta przeglądu: termin, historia wykonań, decyzje." },
    ],
  }),
  component: KartaPrzegladuEkran,
});

function KartaPrzegladuEkran() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const auth = useAuth();
  const rola = auth.stan === "zalogowany" ? auth.profil.rola : null;
  const dostep =
    auth.stan === "zalogowany" &&
    !auth.profil.must_change_password &&
    czyRola(rola, ["technik", "kierownik", "admin"]);
  const { data: przeglady = [], isLoading } = useQuery({ ...przegladyQuery, enabled: dostep });
  const { data: wykonania = [], isError: bladWykonan } = useQuery({
    ...wykonaniaQuery(id),
    enabled: dostep,
  });
  const [wykonanieOtwarte, setWykonanieOtwarte] = useState(false);
  const [edycjaOtwarta, setEdycjaOtwarta] = useState(false);
  const [zapis, setZapis] = useState(false);
  const online = useOnline();

  const przeglad = przeglady.find((p) => p.id === id);
  const tytul = przeglad?.nr_technologiczny ?? "Przegląd";

  if (isLoading || !przeglad) {
    return (
      <AppShell title={tytul} dozwoloneRole={["technik", "kierownik", "admin"]}>
        <p className="text-muted-foreground">
          {isLoading ? "Wczytywanie..." : "Nie znaleziono przeglądu."}
        </p>
      </AppShell>
    );
  }

  const dzis = dzisLokalnie();
  const status = statusPrzegladu(przeglad, dzis);
  const propozycja = oczekujacaPropozycja(przeglad);
  const mozeDecydowac = czyRola(rola, ["kierownik", "admin"]);

  async function decyzja(zatwierdz: boolean) {
    if (!propozycja) return;
    setZapis(true);
    try {
      await zdecydujPropozycje(propozycja.id, zatwierdz);
      toast.success(
        !zatwierdz
          ? "Odrzucono propozycję"
          : propozycja.proponowany_termin
            ? "Zatwierdzono nowy termin przeglądu"
            : "Przyjęto propozycję do wiadomości",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać decyzji.");
    } finally {
      setZapis(false);
      await qc.invalidateQueries({ queryKey: ["przeglady"] });
    }
  }

  return (
    <AppShell title={tytul} dozwoloneRole={["technik", "kierownik", "admin"]}>
      {propozycja && (
        <div className="mb-5">
          <BanerPropozycji
            propozycja={propozycja}
            terminPrzegladu={przeglad.data_najblizszego}
            mozeDecydowac={mozeDecydowac}
            zapis={zapis || !online}
            onDecyzja={(z) => void decyzja(z)}
          />
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Wiersz
          etykieta="Urządzenie"
          wartosc={`${przeglad.nr_technologiczny} — ${przeglad.urzadzenia?.nazwa_urzadzenia ?? ""}`}
        />
        <Wiersz etykieta="Typ czynności" wartosc={przeglad.typ_czynnosci ?? "—"} />
        <Wiersz
          etykieta="Częstotliwość"
          wartosc={przeglad.czestotliwosc_dni ? `co ${przeglad.czestotliwosc_dni} dni` : "—"}
        />
        <Wiersz etykieta="Ostatni przegląd" wartosc={formatujDate(przeglad.data_ostatniego)} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Najbliższy przegląd
          </p>
          <p className={`text-base font-bold ${KOLOR_STATUSU[status].tekst}`}>
            {formatujDate(przeglad.data_najblizszego)}
            {przeglad.data_najblizszego &&
              ` (${opisTerminu(roznicaDni(dzis, przeglad.data_najblizszego))})`}
            {" · "}
            {ETYKIETY_STATUSU_PRZEGLADU[status]}
          </p>
        </div>
        <Wiersz etykieta="Wykonawca" wartosc={przeglad.wykonawca ?? "—"} />
        <Wiersz etykieta="Właściciel" wartosc={przeglad.urzadzenia?.wlasciciel_nazwa ?? "—"} />
        {przeglad.uwagi && <Wiersz etykieta="Uwagi" wartosc={przeglad.uwagi} />}
      </div>

      <div className="mt-5 grid gap-2">
        {!online && (
          <p className="text-sm text-muted-foreground">
            Odnotowanie wykonania i zmiany harmonogramu wymagają połączenia.
          </p>
        )}
        <Button
          disabled={!online}
          onClick={() => setWykonanieOtwarte(true)}
          className="h-14 w-full text-base font-bold"
        >
          <ClipboardCheck className="size-5" /> Odnotuj wykonanie
        </Button>
        {mozeDecydowac && (
          <Button
            variant="outline"
            disabled={!online}
            onClick={() => setEdycjaOtwarta(true)}
            className="h-12 w-full text-base font-bold"
          >
            <Pencil className="size-5" /> Edytuj harmonogram
          </Button>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Historia wykonań</h2>
        {bladWykonan && (
          <p className="text-sm text-destructive">Nie udało się wczytać historii wykonań.</p>
        )}
        {!bladWykonan && wykonania.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak odnotowanych wykonań.</p>
        )}
        <ul className="space-y-2">
          {wykonania.map((w) => (
            <li key={w.id} className="border-l-2 border-border pl-3">
              <p className="text-base">
                {formatujDate(w.data_wykonania)} · wykonany
                {w.wykonawca ? ` · ${w.wykonawca}` : ""}
              </p>
              {w.uwagi && <p className="text-sm text-muted-foreground">Uwagi: {w.uwagi}</p>}
            </li>
          ))}
        </ul>
      </div>

      <OdnotujWykonanieSheet
        przeglad={przeglad}
        otwarte={wykonanieOtwarte}
        onZmiana={setWykonanieOtwarte}
      />
      {mozeDecydowac && (
        <EdycjaHarmonogramuSheet
          przeglad={przeglad}
          otwarte={edycjaOtwarta}
          onZmiana={setEdycjaOtwarta}
        />
      )}
    </AppShell>
  );
}

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {etykieta}
      </p>
      <p className="whitespace-pre-line text-base">{wartosc}</p>
    </div>
  );
}
