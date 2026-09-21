import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { awarieQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { czyRola } from "@/lib/uprawnienia";
import { aktualizujAwarie } from "@/lib/offline";

export const Route = createFileRoute("/awarie/$id")({
  head: () => ({
    meta: [
      { title: "Szczegóły awarii — Ewidencja awarii urządzeń" },
      { name: "description", content: "Szczegóły zgłoszenia awarii i formularz zamknięcia." },
      { property: "og:title", content: "Szczegóły awarii" },
      { property: "og:description", content: "Podgląd zgłoszenia i zamknięcie awarii urządzenia." },
    ],
  }),
  component: Szczegoly,
});

function Szczegoly() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const gotowy = auth.stan === "zalogowany" && !auth.profil.must_change_password;
  const mozeZamykac =
    auth.stan === "zalogowany" && czyRola(auth.profil.rola, ["technik", "kierownik", "admin"]);
  const { data: awarie = [], isLoading } = useQuery({ ...awarieQuery, enabled: gotowy });

  const awaria = awarie.find((a) => a.id === id);
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

  const osoba = awaria.zglaszajacy_nazwa ?? "—";

  async function zamknij() {
    if (!awaria) return;
    if (!przyczyna.trim() || czas === "") {
      toast.error("Podaj przyczynę i czas przestoju.");
      return;
    }
    setZapis(true);
    let wynik: Awaited<ReturnType<typeof aktualizujAwarie>>;
    try {
      wynik = await aktualizujAwarie(awaria.id, {
        przyczyna: przyczyna.trim(),
        czas_przestoju_h: Number(czas),
        status: "Zamknieta",
        data_zamkniecia: new Date().toISOString(),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać zmiany.");
      return;
    } finally {
      setZapis(false);
    }
    await qc.invalidateQueries();
    toast.success(
      wynik === "zsynchronizowano"
        ? "Awaria zamknięta i zsynchronizowana"
        : "Zapisano lokalnie, oczekuje na synchronizację",
    );
    void navigate({ to: "/awarie" });
  }

  return (
    <AppShell title={awaria.nr_technologiczny}>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Wiersz etykieta="Urządzenie" wartosc={awaria.nazwa_urzadzenia} />
        <Wiersz
          etykieta="Data awarii"
          wartosc={new Date(awaria.data_awarii).toLocaleString("pl-PL")}
        />
        <Wiersz etykieta="Zgłaszający" wartosc={osoba} />
        <Wiersz etykieta="Krytyczność skutku" wartosc={awaria.krytycznosc_skutku} />
        <Wiersz etykieta="Status" wartosc={awaria.status} />
        <Wiersz etykieta="Opis" wartosc={awaria.opis_awarii} />
        {awaria.status === "Zamknieta" && (
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

      {awaria.status === "Otwarta" && mozeZamykac && (
        <div className="mt-5 space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-xl font-bold uppercase">Zamknięcie awarii</h2>
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
          <Button onClick={zamknij} disabled={zapis} className="h-16 w-full text-lg font-bold">
            {zapis ? "Zapisywanie..." : "Zamknij awarię"}
          </Button>
        </div>
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
      <p className="text-base">{wartosc}</p>
    </div>
  );
}
