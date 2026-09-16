import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronRight, CloudOff } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { awarieQuery, urzadzeniaQuery } from "@/lib/queries";

export const Route = createFileRoute("/awarie/")({
  head: () => ({
    meta: [
      { title: "Lista awarii — Ewidencja awarii urządzeń" },
      {
        name: "description",
        content: "Przeglądaj i filtruj zgłoszone awarie urządzeń według statusu, krytyczności i dat.",
      },
      { property: "og:title", content: "Lista awarii — Ewidencja awarii urządzeń" },
      { property: "og:description", content: "Filtrowanie awarii po urządzeniu, statusie i dacie." },
    ],
  }),
  component: Lista,
});

const WSZYSTKIE = "__all__";

function Lista() {
  const { data: awarie = [], isLoading } = useQuery(awarieQuery);
  const { data: urzadzenia = [] } = useQuery(urzadzeniaQuery);

  const [urz, setUrz] = useState(WSZYSTKIE);
  const [status, setStatus] = useState(WSZYSTKIE);
  const [kryt, setKryt] = useState(WSZYSTKIE);
  const [od, setOd] = useState("");
  const [do_, setDo] = useState("");

  const wynik = useMemo(
    () =>
      awarie.filter((a) => {
        if (urz !== WSZYSTKIE && a.nr_technologiczny !== urz) return false;
        if (status !== WSZYSTKIE && a.status !== status) return false;
        if (kryt !== WSZYSTKIE && a.krytycznosc_skutku !== kryt) return false;
        const d = a.data_awarii.slice(0, 10);
        if (od && d < od) return false;
        if (do_ && d > do_) return false;
        return true;
      }),
    [awarie, urz, status, kryt, od, do_],
  );

  return (
    <AppShell title="Lista awarii">
      <div className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-4">
        <Select value={urz} onValueChange={setUrz}>
          <SelectTrigger className="h-12 text-base">
            <SelectValue placeholder="Urządzenie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={WSZYSTKIE}>Wszystkie urządzenia</SelectItem>
            {urzadzenia.map((u) => (
              <SelectItem key={u.nr_technologiczny} value={u.nr_technologiczny}>
                {u.nr_technologiczny} — {u.nazwa_urzadzenia}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WSZYSTKIE}>Każdy status</SelectItem>
              <SelectItem value="Otwarta">Otwarta</SelectItem>
              <SelectItem value="Zamknieta">Zamknieta</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kryt} onValueChange={setKryt}>
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder="Krytyczność" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WSZYSTKIE}>Każda krytyczność</SelectItem>
              <SelectItem value="Niska">Niska</SelectItem>
              <SelectItem value="Srednia">Srednia</SelectItem>
              <SelectItem value="Wysoka">Wysoka</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Od</Label>
            <Input type="date" value={od} onChange={(e) => setOd(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Do</Label>
            <Input type="date" value={do_} onChange={(e) => setDo(e.target.value)} className="h-12" />
          </div>
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">Znaleziono {wynik.length} zgłoszeń</p>

      <div className="space-y-3">
        {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}
        {wynik.map((a) => (
          <Link
            key={a.id}
            to="/awarie/$id"
            params={{ id: a.id }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors active:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-bold">{a.nr_technologiczny}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    a.status === "Otwarta"
                      ? "bg-warning text-warning-foreground"
                      : "bg-success text-success-foreground"
                  }`}
                >
                  {a.status}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    a.krytycznosc_skutku === "Wysoka"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {a.krytycznosc_skutku}
                </span>
                {a._pending && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    <CloudOff className="size-3" /> lokalnie
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-muted-foreground">{a.nazwa_urzadzenia}</p>
              <p className="mt-1 line-clamp-2 text-sm">{a.opis_awarii}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(a.data_awarii).toLocaleString("pl-PL")}
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
        {!isLoading && wynik.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Brak zgłoszeń spełniających filtry.
          </p>
        )}
      </div>
    </AppShell>
  );
}
