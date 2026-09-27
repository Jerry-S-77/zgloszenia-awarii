import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { awarieQuery, progiQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { czyRola } from "@/lib/uprawnienia";
import { KafelWskaznika, Pareto, PrzelacznikOpcji } from "@/components/analizy/Pareto";
import { CzekajaceNaCzesci } from "@/components/CzekajaceNaCzesci";
import { formatujIlosc, magazynQuery, niskiStan } from "@/lib/magazyn";
import {
  formatujCzas,
  okresOstatnichDni,
  pareto,
  wOkresie,
  wskazniki,
  wskaznikiUrzadzen,
  type MiaraPareto,
} from "@/lib/wskazniki";

const OKRESY = [
  { wartosc: "90", etykieta: "90 dni" },
  { wartosc: "365", etykieta: "365 dni" },
] as const;
const MIARY: { wartosc: MiaraPareto; etykieta: string }[] = [
  { wartosc: "liczba", etykieta: "Liczba" },
  { wartosc: "przestoj", etykieta: "Przestój" },
];

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Analizy awaryjności — Ewidencja awarii urządzeń" },
      {
        name: "description",
        content:
          "Progi alarmowe: 3 awarie w 90 dni, 2 awarie krytyczne w 60 dni, 8 godzin przestoju w 30 dni.",
      },
      { property: "og:title", content: "Analizy awaryjności urządzeń" },
      {
        property: "og:description",
        content: "Ranking awaryjności, progi alarmowe i trend miesięczny.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const auth = useAuth();
  const dostep =
    auth.stan === "zalogowany" &&
    !auth.profil.must_change_password &&
    czyRola(auth.profil.rola, ["kierownik", "admin"]);
  const { data: awarie = [], isLoading } = useQuery({ ...awarieQuery, enabled: dostep });
  const {
    data: staty = [],
    isLoading: wczytujeProgi,
    isError: bladProgow,
  } = useQuery({ ...progiQuery, enabled: dostep });

  const trend = useMemo(() => {
    const miesiace = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      miesiace.set(d.toISOString().slice(0, 7), 0);
    }
    for (const a of awarie) {
      const k = a.data_awarii.slice(0, 7);
      if (miesiace.has(k)) miesiace.set(k, (miesiace.get(k) ?? 0) + 1);
    }
    return [...miesiace.entries()].map(([m, liczba]) => ({ m: m.slice(2), liczba }));
  }, [awarie]);

  const { data: magazyn = [] } = useQuery({ ...magazynQuery, enabled: dostep });
  const niskie = magazyn.filter((c) => c.aktywna && niskiStan(c));
  const [okres, setOkres] = useState<"90" | "365">("365");
  const [miara, setMiara] = useState<MiaraPareto>("liczba");
  const zakres = useMemo(() => okresOstatnichDni(Number(okres)), [okres]);
  const ogolem = useMemo(() => wskazniki(awarie, zakres), [awarie, zakres]);
  const urzadzenia = useMemo(() => wskaznikiUrzadzen(awarie, zakres), [awarie, zakres]);
  const przyczyny = useMemo(() => pareto(wOkresie(awarie, zakres), miara), [awarie, zakres, miara]);

  const top10 = staty.slice(0, 10);
  const alarmy = staty.filter((s) => s.przekracza);

  return (
    <AppShell title="Analizy" dozwoloneRole={["kierownik", "admin"]}>
      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Kafel etykieta="Awarie ogółem" wartosc={awarie.length} />
        <Kafel etykieta="Otwarte" wartosc={awarie.filter((a) => a.status !== "zamknieta").length} />
        <Kafel etykieta="Alarmy" wartosc={alarmy.length} alarm={alarmy.length > 0} />
      </div>

      <section className="mb-6">
        <h2 className="mb-1 font-display text-xl font-bold uppercase">Progi alarmowe</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Alarm: ≥3 awarie / 90 dni, ≥2 awarie „Wysoka” / 60 dni, ≥8 h przestoju / 30 dni.
        </p>
        <div className="space-y-3">
          {staty.map((s) => (
            <div
              key={s.nr_technologiczny}
              className={`rounded-2xl border-2 bg-card p-4 ${
                s.przekracza ? "border-destructive" : "border-border"
              }`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="min-w-0">
                  <Link
                    to="/urzadzenia/$nr"
                    params={{ nr: s.nr_technologiczny }}
                    className="inline-flex min-h-11 items-center font-display text-lg font-bold text-primary underline underline-offset-4"
                  >
                    {s.nr_technologiczny}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">{s.nazwa_urzadzenia}</p>
                </div>
                {s.przekracza && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">
                    <AlertTriangle className="size-4" /> Alarm
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metryka etykieta="90 dni" wartosc={s.awarie_90} alarm={s.awarie_90 >= 3} />
                <Metryka
                  etykieta="Wysoka / 60 dni"
                  wartosc={s.wysokie_60}
                  alarm={s.wysokie_60 >= 2}
                />
                <Metryka
                  etykieta="Przestój 30 dni"
                  wartosc={`${s.przestoj_30} h`}
                  alarm={s.przestoj_30 >= 8}
                />
              </div>
            </div>
          ))}
          {bladProgow && (
            <p role="alert" className="text-sm text-destructive">
              Nie udało się wczytać progów. Sprawdź połączenie.
            </p>
          )}
          {!wczytujeProgi && !bladProgow && staty.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
              Brak danych — zgłoś pierwszą awarię.
            </p>
          )}
        </div>
      </section>

      <section className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold uppercase">Niezawodność</h2>
          <PrzelacznikOpcji
            etykieta="Okres analizy"
            opcje={[...OKRESY]}
            wartosc={okres}
            onZmiana={setOkres}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <KafelWskaznika
            etykieta="MTTR"
            wartosc={formatujCzas(ogolem.mttrH)}
            opis="średni czas przestoju"
          />
          <KafelWskaznika etykieta="Przestój łącznie" wartosc={formatujCzas(ogolem.przestojH)} />
        </div>
        <p className="text-xs text-muted-foreground">
          MTBF — średni czas między awariami urządzenia (czas kalendarzowy okresu minus przestój,
          podzielony przez liczbę awarii). Najmniej niezawodne na górze.
        </p>
        {urzadzenia.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak awarii w wybranym okresie.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 font-semibold">Urządzenie</th>
                  <th className="p-2 text-right font-semibold">Awarie</th>
                  <th className="p-2 text-right font-semibold">MTBF</th>
                  <th className="p-2 text-right font-semibold">MTTR</th>
                </tr>
              </thead>
              <tbody>
                {urzadzenia.map((u) => (
                  <tr key={u.nr_technologiczny} className="border-t border-border">
                    <td className="p-2">
                      <Link
                        to="/urzadzenia/$nr"
                        params={{ nr: u.nr_technologiczny }}
                        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                      >
                        {u.nr_technologiczny}
                      </Link>
                    </td>
                    <td className="p-2 text-right tabular-nums">{u.liczba}</td>
                    <td className="p-2 text-right tabular-nums">{formatujCzas(u.mtbfH)}</td>
                    <td className="p-2 text-right tabular-nums">{formatujCzas(u.mttrH)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold uppercase">Przyczyny (Pareto)</h2>
          <PrzelacznikOpcji etykieta="Miara" opcje={MIARY} wartosc={miara} onZmiana={setMiara} />
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Zamknięte awarie z wybranego okresu. Wyróżnione kategorie dają razem ok. 80% — od nich
          warto zacząć działania zapobiegawcze.
        </p>
        <Pareto pozycje={przyczyny} miara={miara} />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Niski stan magazynu</h2>
        {niskie.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
            Wszystkie części powyżej stanu minimalnego.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border-2 border-destructive bg-card">
            {niskie.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-2 p-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{c.nazwa}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.numer_katalogowy}
                    {c.urzadzenia_czesci.length
                      ? ` · ${c.urzadzenia_czesci.map((u) => u.nr_technologiczny).join(", ")}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-destructive tabular-nums">
                  {formatujIlosc(c.stan, c.jednostka)} / min {c.stan_minimalny}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Czekają na części</h2>
        <CzekajaceNaCzesci awarie={awarie} />
      </section>

      {top10.length > 0 && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-xl font-bold uppercase">TOP 10 awaryjnych</h2>
          <ResponsiveContainer width="100%" height={Math.max(180, top10.length * 34)}>
            <BarChart data={top10} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis dataKey="nr_technologiczny" type="category" width={68} fontSize={12} />
              <Tooltip />
              <Bar dataKey="razem" name="Awarie" fill="var(--primary)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Trend miesięczny</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend} margin={{ left: -20, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="m" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="liczba"
              name="Awarie"
              stroke="var(--primary)"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </AppShell>
  );
}

function Kafel({
  etykieta,
  wartosc,
  alarm,
}: {
  etykieta: string;
  wartosc: number;
  alarm?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border-2 bg-card p-3 text-center ${
        alarm ? "border-destructive" : "border-border"
      }`}
    >
      <p className="font-display text-3xl font-bold">{wartosc}</p>
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{etykieta}</p>
    </div>
  );
}

function Metryka({
  etykieta,
  wartosc,
  alarm,
}: {
  etykieta: string;
  wartosc: number | string;
  alarm: boolean;
}) {
  return (
    <div className={`rounded-xl p-2 ${alarm ? "bg-destructive/10" : "bg-muted"}`}>
      <p className={`font-display text-xl font-bold ${alarm ? "text-destructive" : ""}`}>
        {wartosc}
      </p>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{etykieta}</p>
    </div>
  );
}
