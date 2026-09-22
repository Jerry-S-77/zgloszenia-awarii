import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
import { awarieQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { czyRola } from "@/lib/uprawnienia";

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

type Stat = {
  nr: string;
  nazwa: string;
  d90: number;
  wysokie60: number;
  przestoj30: number;
  razem: number;
  alarm: boolean;
};

function Dashboard() {
  const auth = useAuth();
  const dostep =
    auth.stan === "zalogowany" &&
    !auth.profil.must_change_password &&
    czyRola(auth.profil.rola, ["kierownik", "admin"]);
  const { data: awarie = [], isLoading } = useQuery({ ...awarieQuery, enabled: dostep });

  const { staty, trend } = useMemo(() => {
    const teraz = Date.now();
    const dni = (n: number) => teraz - n * 24 * 60 * 60 * 1000;
    const mapa = new Map<string, Stat>();

    for (const a of awarie) {
      const t = new Date(a.data_awarii).getTime();
      const s =
        mapa.get(a.nr_technologiczny) ??
        ({
          nr: a.nr_technologiczny,
          nazwa: a.nazwa_urzadzenia,
          d90: 0,
          wysokie60: 0,
          przestoj30: 0,
          razem: 0,
          alarm: false,
        } as Stat);
      s.razem += 1;
      if (t >= dni(90)) s.d90 += 1;
      if (t >= dni(60) && a.krytycznosc_skutku === "Wysoka") s.wysokie60 += 1;
      if (t >= dni(30)) s.przestoj30 += Number(a.czas_przestoju_h ?? 0);
      mapa.set(a.nr_technologiczny, s);
    }

    const staty = [...mapa.values()]
      .map((s) => ({ ...s, alarm: s.d90 >= 3 || s.wysokie60 >= 2 || s.przestoj30 >= 8 }))
      .sort((a, b) => b.razem - a.razem || b.d90 - a.d90);

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
    const trend = [...miesiace.entries()].map(([m, liczba]) => ({ m: m.slice(2), liczba }));

    return { staty, trend };
  }, [awarie]);

  const top10 = staty.slice(0, 10);
  const alarmy = staty.filter((s) => s.alarm);

  return (
    <AppShell title="Analizy" dozwoloneRole={["kierownik", "admin"]}>
      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Kafel etykieta="Awarie ogółem" wartosc={awarie.length} />
        <Kafel
          etykieta="Otwarte"
          wartosc={awarie.filter((a) => a.status !== "zamknieta").length}
        />
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
              key={s.nr}
              className={`rounded-2xl border-2 bg-card p-4 ${
                s.alarm ? "border-destructive" : "border-border"
              }`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold">{s.nr}</p>
                  <p className="truncate text-sm text-muted-foreground">{s.nazwa}</p>
                </div>
                {s.alarm && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">
                    <AlertTriangle className="size-4" /> Alarm
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metryka etykieta="90 dni" wartosc={s.d90} alarm={s.d90 >= 3} />
                <Metryka
                  etykieta="Wysoka / 60 dni"
                  wartosc={s.wysokie60}
                  alarm={s.wysokie60 >= 2}
                />
                <Metryka
                  etykieta="Przestój 30 dni"
                  wartosc={`${s.przestoj30} h`}
                  alarm={s.przestoj30 >= 8}
                />
              </div>
            </div>
          ))}
          {!isLoading && staty.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
              Brak danych — zgłoś pierwszą awarię.
            </p>
          )}
        </div>
      </section>

      {top10.length > 0 && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-xl font-bold uppercase">TOP 10 awaryjnych</h2>
          <ResponsiveContainer width="100%" height={Math.max(180, top10.length * 34)}>
            <BarChart data={top10} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis dataKey="nr" type="category" width={68} fontSize={12} />
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
