import { describe, expect, it } from "vitest";
import { scalAwarie, zdalneLubZCache } from "@/lib/awarie-cache";
import type { QueueOp } from "@/lib/offline";
import type { AwariaLokalna } from "@/lib/types";

const awaria = (id: string, dodatki: Partial<AwariaLokalna> = {}): AwariaLokalna => ({
  id,
  nr_technologiczny: "HVAC-01",
  nazwa_urzadzenia: "AHU",
  data_awarii: "2026-09-21T10:00:00.000Z",
  opis_awarii: id,
  przyczyna: null,
  czas_przestoju_h: null,
  krytycznosc_skutku: "Niska",
  zglaszajacy_id: null,
  zglaszajacy_nazwa: null,
  status: "zgloszona",
  data_zamkniecia: null,
  numer: "AWR-2026-001",
  wersja: 1,
  przypisany_technik_id: null,
  ...dodatki,
});

describe("zdalneLubZCache", () => {
  it("udane pobranie ma pierwszeństwo, także puste", () => {
    const pobrane = [awaria("a")];
    expect(zdalneLubZCache(pobrane, [awaria("b")])).toBe(pobrane);
    expect(zdalneLubZCache([], [awaria("b")])).toEqual([]);
  });
  it("nieudane pobranie: wiersze z poprzedniego pobrania, bez znacznika _pending", () => {
    const wynik = zdalneLubZCache(null, [awaria("a"), awaria("b", { _pending: true })]);
    expect(wynik.map((r) => r.id)).toEqual(["a", "b"]);
    expect(wynik.every((r) => r._pending === undefined)).toBe(true);
  });
  it("nieudane pobranie i brak pamięci: pusta lista", () => {
    expect(zdalneLubZCache(null, undefined)).toEqual([]);
  });
});

const op = (dane: Partial<QueueOp> & Pick<QueueOp, "type" | "payload">): QueueOp =>
  ({
    opId: crypto.randomUUID(),
    createdAt: 0,
    userId: "u1",
    status: "oczekuje",
    ...dane,
  }) as QueueOp;

describe("scalAwarie", () => {
  it("bez kolejki zwraca zdalne posortowane malejąco po dacie", () => {
    const a = awaria("a", { data_awarii: "2026-09-20T10:00:00.000Z" });
    const b = awaria("b", { data_awarii: "2026-09-21T10:00:00.000Z" });
    expect(scalAwarie([a, b], []).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("wstawienie z kolejki dokłada się z _pending, bez duplikatu po synchronizacji", () => {
    const zdalna = awaria("a");
    const lokalna = op({ type: "insert", payload: awaria("nowa") });
    const wynik = scalAwarie([zdalna], [lokalna]);
    expect(wynik.map((a) => a.id).sort()).toEqual(["a", "nowa"]);
    expect(wynik.find((a) => a.id === "nowa")?._pending).toBe(true);
    // Po synchronizacji: to samo id istnieje już zdalnie, insert znika z kolejki -> brak duplikatu.
    const poSynchronizacji = scalAwarie([zdalna, awaria("nowa")], []);
    expect(poSynchronizacji).toHaveLength(2);
  });
  it("aktualizacja z kolejki nakłada się na wiersz zdalny i ustawia _pending", () => {
    const zdalna = awaria("a", { status: "zgloszona" });
    const zmiana = op({ type: "update", payload: { id: "a", status: "zamknieta" } });
    const [wynik] = scalAwarie([zdalna], [zmiana]);
    expect(wynik?.status).toBe("zamknieta");
    expect(wynik?._pending).toBe(true);
  });
  it("scalAwarie samo nie filtruje 'do_sprawdzenia' — ufa wejściu, filtrowanie to obowiązek wywołującego", () => {
    const zdalna = awaria("a");
    const odrzucona = op({
      type: "update",
      payload: { id: "a", status: "zamknieta" },
      status: "do_sprawdzenia",
    });
    // Ta funkcja przyjmuje każdą przekazaną operację, więc nadal ją zastosuje. Dlatego
    // getMojaKolejka MUSI filtrować do "oczekuje" PRZED wywołaniem scalAwarie (patrz krok 6 tego
    // zadania) — ten test dokumentuje kontrakt, nie zachowanie całego potoku odczytu.
    const [wynik] = scalAwarie([zdalna], [odrzucona]);
    expect(wynik?.status).toBe("zamknieta");
  });
});
