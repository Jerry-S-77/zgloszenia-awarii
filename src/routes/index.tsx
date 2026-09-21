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
import { zapiszAwarie } from "@/lib/offline";

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
  const { data: urzadzenia = [] } = useQuery(urzadzeniaQuery);

  const [nr, setNr] = useState("");
  const [data, setData] = useState(lokalnyTerazISO);
  const [opis, setOpis] = useState("");
  const [krytycznosc, setKrytycznosc] = useState("Srednia");
  const [zapisuje, setZapisuje] = useState(false);

  const urzadzenie = urzadzenia.find((u) => u.nr_technologiczny === nr);

  async function wyslij(e: React.FormEvent) {
    e.preventDefault();
    if (!urzadzenie || !opis.trim()) {
      toast.error("Uzupełnij urządzenie i opis awarii.");
      return;
    }
    setZapisuje(true);
    const wynik = await zapiszAwarie({
      id: crypto.randomUUID(),
      nr_technologiczny: urzadzenie.nr_technologiczny,
      nazwa_urzadzenia: urzadzenie.nazwa_urzadzenia,
      data_awarii: new Date(data).toISOString(),
      opis_awarii: opis.trim(),
      przyczyna: null,
      czas_przestoju_h: null,
      krytycznosc_skutku: krytycznosc,
      zglaszajacy_id: null, // ustawia baza z konta (trigger), wartość od klienta jest ignorowana
      zglaszajacy_nazwa: null,
      status: "Otwarta",
      data_zamkniecia: null,
    });
    setZapisuje(false);
    await qc.invalidateQueries();
    toast.success(
      wynik === "zsynchronizowano"
        ? "Zgłoszenie zsynchronizowano"
        : "Zapisano lokalnie, oczekuje na synchronizację",
    );
    setOpis("");
    setNr("");
    setData(lokalnyTerazISO());
    void navigate({ to: "/awarie" });
  }

  return (
    <AppShell title="Zgłoś awarię">
      <form onSubmit={wyslij} className="space-y-5">
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
          <div
            className={`rounded-xl bg-accent p-3 text-sm text-accent-foreground ${
              urzadzenie ? "" : "invisible"
            }`}
          >
            <p>
              <span className="font-semibold">Kategoria:</span> {urzadzenie?.kategoria}
            </p>
            <p>
              <span className="font-semibold">Lokalizacja:</span> {urzadzenie?.lokalizacja}
            </p>
            <p>
              <span className="font-semibold">Krytyczność urządzenia:</span>{" "}
              {urzadzenie?.krytycznosc}
            </p>
          </div>
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
            rows={5}
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

        <Button type="submit" disabled={zapisuje} className="h-16 w-full text-lg font-bold">
          {zapisuje ? "Zapisywanie..." : "Zgłoś awarię"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Status zgłoszenia ustawiany automatycznie na „Otwarta”.
        </p>
      </form>
    </AppShell>
  );
}
