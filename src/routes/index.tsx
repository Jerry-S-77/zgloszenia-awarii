import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { urzadzeniaQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { zapiszAwarie } from "@/lib/offline";
import { WyborZdjec } from "@/components/WyborZdjec";
import { dodajZdjecia, LIMIT_ZDJEC } from "@/lib/zdjecia";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zgłoś awarię — Ewidencja awarii urządzeń" },
      {
        name: "description",
        content:
          "Mobilne zgłaszanie awarii urządzeń technicznych w zakładzie farmaceutycznym, z pracą offline.",
      },
      { property: "og:title", content: "Zgłoś awarię — Ewidencja awarii urządzeń" },
      {
        property: "og:description",
        content: "Szybkie zgłoszenie awarii z telefonu, także bez dostępu do internetu.",
      },
    ],
  }),
  component: Zgloszenie,
});

function lokalnyTerazISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function Zgloszenie() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const gotowy = auth.stan === "zalogowany" && !auth.profil.must_change_password;
  const { data: urzadzenia = [] } = useQuery({ ...urzadzeniaQuery, enabled: gotowy });

  const [nr, setNr] = useState("");
  const [data, setData] = useState(lokalnyTerazISO);
  const [opis, setOpis] = useState("");
  const [krytycznosc, setKrytycznosc] = useState("Srednia");
  const [zdjecia, setZdjecia] = useState<Blob[]>([]);
  const [zapisuje, setZapisuje] = useState(false);

  const urzadzenie = urzadzenia.find((u) => u.nr_technologiczny === nr);

  async function wyslij(e: React.FormEvent) {
    e.preventDefault();
    if (!urzadzenie || !opis.trim()) {
      toast.error("Uzupełnij urządzenie i opis awarii.");
      return;
    }
    setZapisuje(true);
    const awariaId = crypto.randomUUID();
    let wynik: Awaited<ReturnType<typeof zapiszAwarie>>;
    try {
      wynik = await zapiszAwarie({
        id: awariaId,
        nr_technologiczny: urzadzenie.nr_technologiczny,
        nazwa_urzadzenia: urzadzenie.nazwa_urzadzenia,
        data_awarii: new Date(data).toISOString(),
        opis_awarii: opis.trim(),
        przyczyna: null,
        czas_przestoju_h: null,
        krytycznosc_skutku: krytycznosc,
        zglaszajacy_id: null, // ustawia baza z konta (trigger), wartość od klienta jest ignorowana
        zglaszajacy_nazwa: null,
        status: "zgloszona",
        data_zamkniecia: null,
        numer: null,
        wersja: 1,
      });
    } catch (e) {
      // Formularza nie czyścimy: użytkownik może poprawić dane lub spróbować ponownie.
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać zgłoszenia.");
      return;
    } finally {
      setZapisuje(false);
    }
    if (zdjecia.length > 0) {
      try {
        // Zgłoszenie jest już zapisane; zdjęcia same trafią do kolejki, jeśli zgłoszenie w niej czeka.
        if ((await dodajZdjecia(awariaId, zdjecia)) === "lokalnie") wynik = "lokalnie";
      } catch (e) {
        toast.error(
          `Zgłoszenie zapisane, ale zdjęć nie udało się dodać: ${e instanceof Error ? e.message : "błąd"}. Dodaj je na karcie awarii.`,
        );
      }
    }
    await qc.invalidateQueries();
    toast.success(
      wynik === "zsynchronizowano"
        ? "Zgłoszenie zsynchronizowano"
        : "Zapisano lokalnie, oczekuje na synchronizację",
    );
    setOpis("");
    setZdjecia([]);
    setNr("");
    setData(lokalnyTerazISO());
    void navigate({ to: "/awarie" });
  }

  return (
    <AppShell title="Zgłoś awarię">
      <form onSubmit={wyslij} className="space-y-4">
        {auth.stan === "zalogowany" && (
          <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
            Zgłasza: <span className="font-semibold">{auth.profil.imie_nazwisko}</span>
          </p>
        )}
        <div className="space-y-2">
          <Label className="text-base">Urządzenie</Label>
          <Select value={nr} onValueChange={setNr}>
            <SelectTrigger className="h-14 text-base">
              <SelectValue placeholder="Wybierz urządzenie" />
            </SelectTrigger>
            <SelectContent>
              {urzadzenia.map((u) => (
                <SelectItem
                  key={u.nr_technologiczny}
                  value={u.nr_technologiczny}
                  className="py-3 text-base"
                >
                  {u.nr_technologiczny} — {u.nazwa_urzadzenia}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Pokazywane dopiero po wyborze: rezerwowane puste miejsce spychało krytyczność pod dolny pasek. */}
          {urzadzenie && (
            <div className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
              <p>
                <span className="font-semibold">Kategoria:</span> {urzadzenie.kategoria}
              </p>
              <p>
                <span className="font-semibold">Lokalizacja:</span> {urzadzenie.lokalizacja}
              </p>
              <p>
                <span className="font-semibold">Krytyczność urządzenia:</span>{" "}
                {urzadzenie.krytycznosc}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="data" className="text-base">
            Data i godzina awarii
          </Label>
          <Input
            id="data"
            type="datetime-local"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-14 text-base"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="opis" className="text-base">
            Opis awarii
          </Label>
          <Textarea
            id="opis"
            value={opis}
            onChange={(e) => setOpis(e.target.value)}
            rows={3}
            placeholder="Co się stało, jakie objawy, jakie działania podjęto..."
            className="text-base"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-base">Krytyczność skutku</Label>
          <div className="grid grid-cols-3 gap-2">
            {["Niska", "Srednia", "Wysoka"].map((k) => (
              <Button
                key={k}
                type="button"
                variant={krytycznosc === k ? "default" : "outline"}
                className="h-14 text-base"
                onClick={() => setKrytycznosc(k)}
              >
                {k}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-base">Zdjęcia (opcjonalnie)</Label>
          <WyborZdjec zdjecia={zdjecia} onZmiana={setZdjecia} limit={LIMIT_ZDJEC} />
        </div>

        <Button type="submit" disabled={zapisuje} className="h-16 w-full text-lg font-bold">
          {zapisuje ? "Zapisywanie..." : "Zgłoś awarię"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Status zgłoszenia ustawiany automatycznie na „Zgłoszona”. Numer nada system po zapisaniu.
        </p>
      </form>
    </AppShell>
  );
}
