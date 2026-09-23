import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { awarieQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { czyRola } from "@/lib/uprawnienia";

export const Route = createFileRoute("/eksport")({
  head: () => ({
    meta: [
      { title: "Eksport CSV — Ewidencja awarii urządzeń" },
      {
        name: "description",
        content: "Pobierz zgłoszenia awarii w formacie CSV.",
      },
      { property: "og:title", content: "Eksport danych o awariach" },
      {
        property: "og:description",
        content: "Plik CSV ze wszystkimi zgłoszeniami awarii.",
      },
    ],
  }),
  component: Eksport,
});

const NAGLOWKI = [
  "ID_zgloszenia",
  "Nr_technologiczny",
  "Nazwa_urzadzenia",
  "Data_awarii",
  "Opis_awarii",
  "Przyczyna",
  "Czas_przestoju_h",
  "Krytycznosc_skutku",
  "Osoba_zglaszajaca",
  "Status",
  "Data_zamkniecia",
];

function pole(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function Eksport() {
  const auth = useAuth();
  const dostep =
    auth.stan === "zalogowany" &&
    !auth.profil.must_change_password &&
    czyRola(auth.profil.rola, ["kierownik", "admin"]);
  const { data: awarie = [] } = useQuery({ ...awarieQuery, enabled: dostep });

  function pobierz() {
    const wiersze = awarie.map((a) =>
      [
        pole(a.numer), // pusty tylko dla zgłoszenia z kolejki offline, zanim baza nada numer
        pole(a.nr_technologiczny),
        pole(a.nazwa_urzadzenia),
        pole(a.data_awarii),
        pole(a.opis_awarii),
        pole(a.przyczyna),
        pole(a.czas_przestoju_h),
        pole(a.krytycznosc_skutku),
        pole(a.zglaszajacy_nazwa),
        pole(a.status),
        pole(a.data_zamkniecia),
      ].join(","),
    );
    const csv = "\uFEFF" + [NAGLOWKI.join(","), ...wiersze].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `awarie-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Wyeksportowano ${awarie.length} zgłoszeń`);
  }

  return (
    <AppShell title="Eksport danych" dozwoloneRole={["kierownik", "admin"]}>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <p className="text-base">
          Plik CSV z kolumnami jak w dawnym arkuszu „Awarie”. Kolumna <b>ID_zgloszenia</b> zawiera
          numer nadany przez system (AWR-rok-numer).
        </p>
        <ul className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
          {NAGLOWKI.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Do eksportu: {awarie.length} zgłoszeń.</p>
        <Button onClick={pobierz} className="h-16 w-full text-lg font-bold">
          <Download className="size-5" /> Pobierz CSV
        </Button>
      </div>
    </AppShell>
  );
}
