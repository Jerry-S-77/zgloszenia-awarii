import { CloudOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { mozliwosciOffline } from "@/lib/offline-mozliwosci";
import type { Rola } from "@/lib/uprawnienia";

/** Wyraźna informacja o braku połączenia: co da się zrobić offline, a co poczeka na internet. */
export function BanerOffline({ rola }: { rola: Rola }) {
  const online = useOnline();
  if (online) return null;
  const { mozna, niemozna } = mozliwosciOffline(rola);
  return (
    <div role="status" className="border-b border-warning bg-warning/20">
      <details className="mx-auto max-w-2xl px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-bold">
          <CloudOff className="size-5 shrink-0" />
          Brak połączenia — pracujesz na danych z ostatniej synchronizacji. Co możesz teraz zrobić?
        </summary>
        <div className="grid gap-3 pb-2 pt-1 text-sm sm:grid-cols-2">
          <div>
            <p className="font-bold">Możesz:</p>
            <ul className="list-disc pl-5">
              {mozna.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-bold">Poczeka na internet:</p>
            <ul className="list-disc pl-5">
              {niemozna.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}
