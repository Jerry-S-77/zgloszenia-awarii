import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Historia } from "@/components/awaria/Historia";
import { Komentarze } from "@/components/awaria/Komentarze";
import { OsStatusow } from "@/components/awaria/OsStatusow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { awarieQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { aktualizujAwarie, KonfliktWersjiError } from "@/lib/offline";
import {
  dozwolonePrzejscia,
  ETYKIETY_STATUSOW,
  wymagaDanychZamkniecia,
  type StatusAwarii,
} from "@/lib/statusy-awarii";
import type { Awaria } from "@/lib/types";

export const Route = createFileRoute("/awarie/$id")({
  head: () => ({
    meta: [
      { title: "Szczegóły awarii — Ewidencja awarii urządzeń" },
      {
        name: "description",
        content: "Szczegóły zgłoszenia awarii, przejścia statusu, komentarze i historia.",
      },
      { property: "og:title", content: "Szczegóły awarii" },
      {
        property: "og:description",
        content: "Podgląd zgłoszenia, obsługa i zamknięcie awarii urządzenia.",
      },
    ],
  }),
  component: Szczegoly,
});

function Szczegoly() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const auth = useAuth();
  const gotowy = auth.stan === "zalogowany" && !auth.profil.must_change_password;
  const { data: awarie = [], isLoading } = useQuery({ ...awarieQuery, enabled: gotowy });

  const awaria = awarie.find((a) => a.id === id);
  const [celStatusu, setCelStatusu] = useState<StatusAwarii | null>(null);
  const [przyczyna, setPrzyczyna] = useState("");
  const [czas, setCzas] = useState("");
  const [zapis, setZapis] = useState(false);

  if (isLoading) {
    return (
      <AppShell title="Szczegóły">
        <p className="text-muted-foreground">Wczytywanie...</p>
      </AppShell>
    );
  }
  if (!awaria) {
    return (
      <AppShell title="Szczegóły">
        <p className="text-muted-foreground">Nie znaleziono zgłoszenia.</p>
      </AppShell>
    );
  }

  const rola = auth.stan === "zalogowany" ? auth.profil.rola : null;
  const przejscia = dozwolonePrzejscia(awaria.status, rola);
  const osoba = awaria.zglaszajacy_nazwa ?? "—";

  async function wykonajPrzejscie(na: StatusAwarii, dane: Partial<Awaria> = {}): Promise<boolean> {
    if (!awaria) return false;
    setZapis(true);
    let wynik: Awaited<ReturnType<typeof aktualizujAwarie>>;
    try {
      wynik = await aktualizujAwarie(awaria.id, { status: na, ...dane }, awaria.wersja);
    } catch (e) {
      if (e instanceof KonfliktWersjiError) {
        toast.error(e.message);
        await qc.invalidateQueries({ queryKey: ["awarie"] });
      } else {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać zmiany.");
      }
      return false;
    } finally {
      setZapis(false);
    }
    await qc.invalidateQueries();
    toast.success(
      wynik === "zsynchronizowano"
        ? "Zapisano i zsynchronizowano"
        : "Zapisano lokalnie, oczekuje na synchronizację",
    );
    return true;
  }

  function klikPrzejscia(na: StatusAwarii) {
    if (wymagaDanychZamkniecia(na)) {
      setCelStatusu(na);
      return;
    }
    void wykonajPrzejscie(na);
  }

  async function potwierdzZamkniecie() {
    if (!celStatusu || !przyczyna.trim() || czas === "") {
      toast.error("Podaj przyczynę i czas przestoju.");
      return;
    }
    const udalo = await wykonajPrzejscie(celStatusu, {
      przyczyna: przyczyna.trim(),
      czas_przestoju_h: Number(czas),
      data_zamkniecia: new Date().toISOString(),
    });
    if (udalo) {
      setPrzyczyna("");
      setCzas("");
      setCelStatusu(null);
    }
  }

  return (
    <AppShell title={awaria.numer ?? "oczekuje na numer"}>
      <div className="mb-5 rounded-2xl border border-border bg-card p-4">
        <OsStatusow status={awaria.status} />
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Wiersz
          etykieta="Urządzenie"
          wartosc={`${awaria.nr_technologiczny} — ${awaria.nazwa_urzadzenia}`}
        />
        <Wiersz
          etykieta="Data awarii"
          wartosc={new Date(awaria.data_awarii).toLocaleString("pl-PL")}
        />
        <Wiersz etykieta="Zgłaszający" wartosc={osoba} />
        <Wiersz etykieta="Krytyczność skutku" wartosc={awaria.krytycznosc_skutku} />
        <Wiersz etykieta="Status" wartosc={ETYKIETY_STATUSOW[awaria.status]} />
        <Wiersz etykieta="Opis" wartosc={awaria.opis_awarii} />
        {awaria.status === "zamknieta" && (
          <>
            <Wiersz etykieta="Przyczyna" wartosc={awaria.przyczyna ?? "—"} />
            <Wiersz
              etykieta="Czas przestoju (h)"
              wartosc={String(awaria.czas_przestoju_h ?? "—")}
            />
            <Wiersz
              etykieta="Data zamknięcia"
              wartosc={
                awaria.data_zamkniecia
                  ? new Date(awaria.data_zamkniecia).toLocaleString("pl-PL")
                  : "—"
              }
            />
          </>
        )}
      </div>

      {przejscia.length > 0 && (
        <div className="mt-5 space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-xl font-bold uppercase">Kolejny krok</h2>
          {celStatusu === null ? (
            <div className="grid gap-2">
              {przejscia.map((p) => (
                <Button
                  key={p.na}
                  onClick={() => klikPrzejscia(p.na)}
                  disabled={zapis}
                  className="h-14 w-full text-base font-bold"
                >
                  {p.etykietaAkcji}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="przyczyna" className="text-base">
                  Przyczyna
                </Label>
                <Textarea
                  id="przyczyna"
                  rows={4}
                  value={przyczyna}
                  onChange={(e) => setPrzyczyna(e.target.value)}
                  className="text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="czas" className="text-base">
                  Czas przestoju (h)
                </Label>
                <Input
                  id="czas"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={czas}
                  onChange={(e) => setCzas(e.target.value)}
                  className="h-14 text-base"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setCelStatusu(null)} className="h-14">
                  Anuluj
                </Button>
                <Button onClick={potwierdzZamkniecie} disabled={zapis} className="h-14 font-bold">
                  {zapis ? "Zapisywanie..." : "Zamknij awarię"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <Komentarze awariaId={awaria.id} />
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <Historia awariaId={awaria.id} />
      </div>
    </AppShell>
  );
}

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {etykieta}
      </p>
      <p className="text-base">{wartosc}</p>
    </div>
  );
}
