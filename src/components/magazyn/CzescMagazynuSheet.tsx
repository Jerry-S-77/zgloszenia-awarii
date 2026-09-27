import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOnline } from "@/hooks/use-online";
import {
  formatujIlosc,
  korygujStan,
  niskiStan,
  przyjmijDostawe,
  ruchyQuery,
  ustawUrzadzeniaCzesci,
  zapiszCzescMagazynu,
  type CzescMagazynu,
} from "@/lib/magazyn";
import { wszystkieUrzadzeniaQuery } from "@/lib/urzadzenia-zapytania";

type Akcja = "przyjecie" | "korekta" | "edycja" | "urzadzenia" | null;

const OPIS_RUCHU = { przyjecie: "Przyjęcie", wydanie: "Wydanie", korekta: "Korekta" } as const;

export function CzescMagazynuSheet({
  czesc,
  onZamknij,
  zarzadza,
}: {
  czesc: CzescMagazynu | null;
  onZamknij: () => void;
  zarzadza: boolean;
}) {
  const qc = useQueryClient();
  const online = useOnline();
  const [akcja, setAkcja] = useState<Akcja>(null);
  const [zapis, setZapis] = useState(false);
  const [ilosc, setIlosc] = useState("");
  const [uwagi, setUwagi] = useState("");
  const [dane, setDane] = useState({
    nazwa: "",
    jednostka: "",
    stan_minimalny: "",
    lokalizacja: "",
  });
  const [wybrane, setWybrane] = useState<Map<string, boolean>>(new Map());
  const { data: ruchy = [] } = useQuery({
    ...ruchyQuery(czesc?.id ?? ""),
    enabled: czesc !== null,
  });
  const { data: urzadzenia = [] } = useQuery({
    ...wszystkieUrzadzeniaQuery,
    enabled: czesc !== null && akcja === "urzadzenia",
  });

  useEffect(() => {
    setAkcja(null);
    if (!czesc) return;
    setDane({
      nazwa: czesc.nazwa,
      jednostka: czesc.jednostka,
      stan_minimalny: String(czesc.stan_minimalny),
      lokalizacja: czesc.lokalizacja ?? "",
    });
    setWybrane(new Map(czesc.urzadzenia_czesci.map((u) => [u.nr_technologiczny, u.krytyczna])));
  }, [czesc]);

  function otworz(a: Akcja) {
    setIlosc(a === "korekta" && czesc ? String(czesc.stan) : "");
    setUwagi("");
    setAkcja(a);
  }

  async function wykonaj(dzialanie: () => Promise<void>, sukces: string) {
    setZapis(true);
    try {
      await dzialanie();
      await qc.invalidateQueries({ queryKey: ["magazyn"] });
      toast.success(sukces);
      setAkcja(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
    } finally {
      setZapis(false);
    }
  }

  if (!czesc) return null;
  const liczba = Number(ilosc.replace(",", "."));

  return (
    <Sheet open onOpenChange={(o) => !o && onZamknij()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{czesc.nazwa}</SheetTitle>
          <SheetDescription>
            {czesc.numer_katalogowy}
            {czesc.lokalizacja ? ` · ${czesc.lokalizacja}` : ""}
            {!czesc.aktywna ? " · wycofana" : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div
            className={`rounded-xl p-3 text-center ${niskiStan(czesc) ? "bg-destructive/10" : "bg-muted"}`}
          >
            <p
              className={`font-display text-3xl font-bold ${niskiStan(czesc) ? "text-destructive" : ""}`}
            >
              {formatujIlosc(czesc.stan, czesc.jednostka)}
            </p>
            <p className="text-xs text-muted-foreground">
              na stanie · minimum {formatujIlosc(czesc.stan_minimalny, czesc.jednostka)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Urządzenia</p>
            {czesc.urzadzenia_czesci.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nie przypisano do urządzeń.</p>
            ) : (
              <p className="text-sm">
                {czesc.urzadzenia_czesci
                  .map((u) => `${u.nr_technologiczny}${u.krytyczna ? " (krytyczna)" : ""}`)
                  .join(", ")}
              </p>
            )}
          </div>

          {zarzadza && akcja === null && (
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-12" disabled={!online} onClick={() => otworz("przyjecie")}>
                Przyjęcie dostawy
              </Button>
              <Button
                variant="outline"
                className="h-12"
                disabled={!online}
                onClick={() => otworz("korekta")}
              >
                Korekta stanu
              </Button>
              <Button
                variant="outline"
                className="h-12"
                disabled={!online}
                onClick={() => otworz("edycja")}
              >
                Edytuj dane
              </Button>
              <Button
                variant="outline"
                className="h-12"
                disabled={!online}
                onClick={() => otworz("urzadzenia")}
              >
                Urządzenia
              </Button>
            </div>
          )}

          {akcja === "przyjecie" && (
            <form
              className="space-y-3 rounded-xl bg-muted p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!(liczba > 0)) return void toast.error("Podaj ilość większą od zera.");
                void wykonaj(
                  () => przyjmijDostawe(czesc.id, liczba, uwagi.trim() || null),
                  "Przyjęto dostawę",
                );
              }}
            >
              <Pole id="przyjecie-ilosc" etykieta={`Ilość (${czesc.jednostka})`}>
                <Input
                  id="przyjecie-ilosc"
                  inputMode="decimal"
                  value={ilosc}
                  onChange={(e) => setIlosc(e.target.value)}
                  className="h-12 bg-card text-base"
                />
              </Pole>
              <Pole id="przyjecie-uwagi" etykieta="Uwagi (np. numer dostawy)">
                <Input
                  id="przyjecie-uwagi"
                  maxLength={500}
                  value={uwagi}
                  onChange={(e) => setUwagi(e.target.value)}
                  className="h-12 bg-card text-base"
                />
              </Pole>
              <Przyciski zapis={zapis} onAnuluj={() => setAkcja(null)} etykieta="Przyjmij" />
            </form>
          )}

          {akcja === "korekta" && (
            <form
              className="space-y-3 rounded-xl bg-muted p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!(liczba >= 0) || ilosc.trim() === "") {
                  return void toast.error("Podaj stan faktyczny (0 lub więcej).");
                }
                if (!uwagi.trim()) return void toast.error("Podaj powód korekty.");
                void wykonaj(() => korygujStan(czesc.id, liczba, uwagi.trim()), "Skorygowano stan");
              }}
            >
              <Pole id="korekta-stan" etykieta={`Stan faktyczny (${czesc.jednostka})`}>
                <Input
                  id="korekta-stan"
                  inputMode="decimal"
                  value={ilosc}
                  onChange={(e) => setIlosc(e.target.value)}
                  className="h-12 bg-card text-base"
                />
              </Pole>
              <Pole id="korekta-powod" etykieta="Powód korekty">
                <Input
                  id="korekta-powod"
                  maxLength={500}
                  placeholder="np. inwentaryzacja"
                  value={uwagi}
                  onChange={(e) => setUwagi(e.target.value)}
                  className="h-12 bg-card text-base"
                />
              </Pole>
              <Przyciski zapis={zapis} onAnuluj={() => setAkcja(null)} etykieta="Zapisz korektę" />
            </form>
          )}

          {akcja === "edycja" && (
            <form
              className="space-y-3 rounded-xl bg-muted p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const min = Number(dane.stan_minimalny.replace(",", "."));
                if (!dane.nazwa.trim() || !dane.jednostka.trim()) {
                  return void toast.error("Podaj nazwę i jednostkę.");
                }
                if (!(min >= 0)) return void toast.error("Stan minimalny: 0 lub więcej.");
                void wykonaj(
                  () =>
                    zapiszCzescMagazynu(czesc.id, {
                      nazwa: dane.nazwa.trim(),
                      jednostka: dane.jednostka.trim(),
                      stan_minimalny: min,
                      lokalizacja: dane.lokalizacja.trim() || null,
                    }),
                  "Zapisano dane części",
                );
              }}
            >
              <Pole id="edycja-nazwa" etykieta="Nazwa">
                <Input
                  id="edycja-nazwa"
                  maxLength={200}
                  value={dane.nazwa}
                  onChange={(e) => setDane({ ...dane, nazwa: e.target.value })}
                  className="h-12 bg-card text-base"
                />
              </Pole>
              <div className="grid grid-cols-2 gap-2">
                <Pole id="edycja-jednostka" etykieta="Jednostka">
                  <Input
                    id="edycja-jednostka"
                    maxLength={20}
                    value={dane.jednostka}
                    onChange={(e) => setDane({ ...dane, jednostka: e.target.value })}
                    className="h-12 bg-card text-base"
                  />
                </Pole>
                <Pole id="edycja-min" etykieta="Stan minimalny">
                  <Input
                    id="edycja-min"
                    inputMode="decimal"
                    value={dane.stan_minimalny}
                    onChange={(e) => setDane({ ...dane, stan_minimalny: e.target.value })}
                    className="h-12 bg-card text-base"
                  />
                </Pole>
              </div>
              <Pole id="edycja-lokalizacja" etykieta="Lokalizacja w magazynie">
                <Input
                  id="edycja-lokalizacja"
                  maxLength={200}
                  value={dane.lokalizacja}
                  onChange={(e) => setDane({ ...dane, lokalizacja: e.target.value })}
                  className="h-12 bg-card text-base"
                />
              </Pole>
              <Przyciski zapis={zapis} onAnuluj={() => setAkcja(null)} etykieta="Zapisz" />
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full text-destructive"
                disabled={zapis}
                onClick={() =>
                  void wykonaj(
                    () => zapiszCzescMagazynu(czesc.id, { aktywna: !czesc.aktywna }),
                    czesc.aktywna ? "Wycofano część z magazynu" : "Przywrócono część",
                  )
                }
              >
                {czesc.aktywna ? "Wycofaj z magazynu" : "Przywróć do magazynu"}
              </Button>
            </form>
          )}

          {akcja === "urzadzenia" && (
            <div className="space-y-3 rounded-xl bg-muted p-3">
              <p className="text-sm">
                Zaznacz urządzenia, w których występuje ta część. „Krytyczna” — jej brak zatrzymuje
                urządzenie.
              </p>
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {urzadzenia.map((u) => {
                  const zaznaczone = wybrane.has(u.nr_technologiczny);
                  return (
                    <li key={u.nr_technologiczny} className="flex items-center gap-2">
                      <label className="flex min-h-11 flex-1 items-center gap-2">
                        <Checkbox
                          checked={zaznaczone}
                          onCheckedChange={(c) => {
                            const m = new Map(wybrane);
                            if (c) m.set(u.nr_technologiczny, m.get(u.nr_technologiczny) ?? false);
                            else m.delete(u.nr_technologiczny);
                            setWybrane(m);
                          }}
                        />
                        <span className="text-sm">
                          <b>{u.nr_technologiczny}</b> {u.nazwa_urzadzenia}
                        </span>
                      </label>
                      {zaznaczone && (
                        <label className="flex min-h-11 items-center gap-1 text-xs">
                          <Checkbox
                            checked={wybrane.get(u.nr_technologiczny) ?? false}
                            onCheckedChange={(c) =>
                              setWybrane(new Map(wybrane).set(u.nr_technologiczny, c === true))
                            }
                          />
                          krytyczna
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Przyciski
                zapis={zapis}
                onAnuluj={() => setAkcja(null)}
                etykieta="Zapisz urządzenia"
                onZapisz={() =>
                  void wykonaj(
                    () =>
                      ustawUrzadzeniaCzesci(
                        czesc.id,
                        czesc.urzadzenia_czesci,
                        [...wybrane].map(([nr_technologiczny, krytyczna]) => ({
                          nr_technologiczny,
                          krytyczna,
                        })),
                      ),
                    "Zapisano urządzenia części",
                  )
                }
              />
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Ostatnie ruchy
            </p>
            {ruchy.length === 0 && <p className="text-sm text-muted-foreground">Brak ruchów.</p>}
            <ul className="divide-y divide-border text-sm">
              {ruchy.map((r) => (
                <li key={r.id} className="py-1.5">
                  <span className="font-semibold">{OPIS_RUCHU[r.typ]}</span>{" "}
                  <span className={r.zmiana < 0 ? "text-destructive" : "text-success"}>
                    {r.zmiana > 0 ? "+" : ""}
                    {formatujIlosc(r.zmiana, czesc.jednostka)}
                  </span>{" "}
                  → {formatujIlosc(r.stan_po, czesc.jednostka)}
                  <span className="block text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pl-PL")}
                    {r.autor_nazwa ? ` · ${r.autor_nazwa}` : ""}
                    {r.uwagi ? ` · ${r.uwagi}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Pole({
  id,
  etykieta,
  children,
}: {
  id: string;
  etykieta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{etykieta}</Label>
      {children}
    </div>
  );
}

function Przyciski({
  zapis,
  onAnuluj,
  etykieta,
  onZapisz,
}: {
  zapis: boolean;
  onAnuluj: () => void;
  etykieta: string;
  onZapisz?: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" className="h-12" onClick={onAnuluj}>
        Anuluj
      </Button>
      <Button
        type={onZapisz ? "button" : "submit"}
        className="h-12 font-bold"
        disabled={zapis}
        onClick={onZapisz}
      >
        {zapis ? "Zapisywanie..." : etykieta}
      </Button>
    </div>
  );
}
