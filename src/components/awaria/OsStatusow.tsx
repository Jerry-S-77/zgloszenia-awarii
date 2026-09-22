import { CheckCircle2, Circle, PauseCircle } from "lucide-react";
import { ETYKIETY_STATUSOW, OS_GLOWNA, indeksNaOsi, type StatusAwarii } from "@/lib/statusy-awarii";

export function OsStatusow({ status }: { status: StatusAwarii }) {
  const biezacy = indeksNaOsi(status);
  return (
    <div>
      <div className="flex items-center">
        {OS_GLOWNA.map((krok, i) => (
          <div key={krok} className="flex flex-1 items-center last:flex-none">
            {i < biezacy ? (
              <CheckCircle2 className="size-6 shrink-0 text-success" />
            ) : i === biezacy ? (
              <Circle className="size-6 shrink-0 fill-primary text-primary" />
            ) : (
              <Circle className="size-6 shrink-0 text-muted-foreground" />
            )}
            {i < OS_GLOWNA.length - 1 && (
              <div className={`h-0.5 flex-1 ${i < biezacy ? "bg-success" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 text-center text-[11px] font-semibold text-muted-foreground">
        {OS_GLOWNA.map((krok) => (
          <span key={krok}>{ETYKIETY_STATUSOW[krok]}</span>
        ))}
      </div>
      {status === "oczekuje_na_czesc" && (
        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-warning">
          <PauseCircle className="size-4" /> Oczekuje na część
        </p>
      )}
    </div>
  );
}
