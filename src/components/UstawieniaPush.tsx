import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { PrzelacznikOpcji } from "@/components/analizy/Pareto";
import { Button } from "@/components/ui/button";
import { stanPush, ustawTrybPush, wlaczPush, wylaczPush, type StanPush } from "@/lib/push";

const OPISY: Partial<Record<StanPush["stan"], string>> = {
  nieobslugiwane: "Ta przeglądarka nie obsługuje powiadomień push.",
  "brak-klucza": "Powiadomienia push nie są jeszcze skonfigurowane na serwerze.",
  "ios-zainstaluj":
    "Na iPhonie powiadomienia działają po dodaniu aplikacji do ekranu początkowego: Udostępnij → „Do ekranu początkowego”, potem otwórz aplikację z ikony.",
  zablokowane:
    "Powiadomienia są zablokowane w ustawieniach przeglądarki. Zezwól na nie dla tej strony i wróć tutaj.",
};

/** Karta „Powiadomienia na telefonie”: włączenie na tym urządzeniu i wybór, które powiadomienia przychodzą. */
export function UstawieniaPush() {
  const [stan, setStan] = useState<StanPush | null>(null);
  const [zapis, setZapis] = useState(false);

  const odswiez = useCallback(async () => {
    try {
      setStan(await stanPush());
    } catch {
      setStan({ stan: "wylaczone" });
    }
  }, []);

  useEffect(() => {
    void odswiez();
  }, [odswiez]);

  async function wykonaj(dzialanie: () => Promise<void>, sukces: string) {
    setZapis(true);
    try {
      await dzialanie();
      toast.success(sukces);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zmienić ustawienia.");
    } finally {
      setZapis(false);
      await odswiez();
    }
  }

  if (!stan) return null;
  const opis = OPISY[stan.stan];

  return (
    <section className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase">
        <BellRing className="size-5" /> Powiadomienia na telefonie
      </h2>
      {opis && <p className="text-sm text-muted-foreground">{opis}</p>}
      {stan.stan === "wylaczone" && (
        <>
          <p className="text-sm text-muted-foreground">
            Powiadomienia przyjdą także przy zamkniętej aplikacji. Domyślnie tylko krytyczne.
          </p>
          <Button
            className="h-12 w-full"
            disabled={zapis}
            onClick={() =>
              void wykonaj(() => wlaczPush(true), "Włączono powiadomienia na tym telefonie")
            }
          >
            Włącz na tym telefonie
          </Button>
        </>
      )}
      {stan.stan === "wlaczone" && (
        <>
          <PrzelacznikOpcji<"krytyczne" | "wszystkie">
            etykieta="Które powiadomienia"
            wylaczony={zapis}
            wartosc={stan.tylkoKrytyczne ? "krytyczne" : "wszystkie"}
            onZmiana={(w) =>
              void wykonaj(
                () => ustawTrybPush(w === "krytyczne"),
                w === "krytyczne" ? "Tylko krytyczne" : "Wszystkie powiadomienia",
              )
            }
            opcje={[
              { wartosc: "krytyczne", etykieta: "Tylko krytyczne" },
              { wartosc: "wszystkie", etykieta: "Wszystkie" },
            ]}
          />
          <Button
            variant="outline"
            className="h-12 w-full"
            disabled={zapis}
            onClick={() => void wykonaj(wylaczPush, "Wyłączono powiadomienia na tym telefonie")}
          >
            Wyłącz na tym telefonie
          </Button>
        </>
      )}
    </section>
  );
}
