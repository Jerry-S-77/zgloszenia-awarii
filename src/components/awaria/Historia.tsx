import { useQuery } from "@tanstack/react-query";
import { historiaQuery } from "@/lib/queries";
import { ETYKIETY_STATUSOW, type StatusAwarii } from "@/lib/statusy-awarii";

function opisWpisu(typ: string, dane: unknown): string {
  const d = (dane ?? {}) as Record<string, unknown>;
  if (typ === "utworzenie") return "Zgłoszenie utworzone";
  if (typ === "zmiana_statusu") {
    const z = ETYKIETY_STATUSOW[d["z"] as StatusAwarii] ?? String(d["z"]);
    const na = ETYKIETY_STATUSOW[d["na"] as StatusAwarii] ?? String(d["na"]);
    return `Status: ${z} → ${na}`;
  }
  if (typ === "przypisanie")
    return d["technik_id"] ? "Przypisano technika" : "Usunięto przypisanie";
  return "Edycja";
}

export function Historia({ awariaId }: { awariaId: string }) {
  const { data: wpisy = [], isLoading } = useQuery(historiaQuery(awariaId));
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold uppercase">Historia</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Wczytywanie...</p>}
      <div className="space-y-2">
        {wpisy.map((w) => (
          <div key={w.id} className="border-l-2 border-border pl-3">
            <p className="text-sm">{opisWpisu(w.typ, w.dane)}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(w.created_at).toLocaleString("pl-PL")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
