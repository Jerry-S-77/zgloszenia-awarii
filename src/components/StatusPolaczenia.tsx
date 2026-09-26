import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { getMojaKolejka, syncQueue } from "@/lib/offline";

export function StatusPolaczenia() {
  const [online, setOnline] = useState(true);
  const [oczekuje, setOczekuje] = useState(0);
  const qc = useQueryClient();

  useEffect(() => {
    let anulowane = false;
    const odswiez = async () => {
      const q = await getMojaKolejka();
      if (!anulowane) setOczekuje(q.length);
    };
    const przy = async () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        const ile = await syncQueue();
        if (ile > 0) qc.invalidateQueries();
      }
      void odswiez();
    };
    setOnline(navigator.onLine);
    void przy();
    window.addEventListener("online", przy);
    window.addEventListener("offline", przy);
    window.addEventListener("queue-changed", odswiez);
    const interval = window.setInterval(przy, 20000);
    return () => {
      anulowane = true;
      window.removeEventListener("online", przy);
      window.removeEventListener("offline", przy);
      window.removeEventListener("queue-changed", odswiez);
      window.clearInterval(interval);
    };
  }, [qc]);

  const stan = !online
    ? { Icon: CloudOff, text: "Offline", cls: "bg-warning text-warning-foreground" }
    : oczekuje > 0
      ? {
          Icon: RefreshCw,
          text: `${oczekuje} w kolejce`,
          cls: "bg-warning text-warning-foreground",
        }
      : { Icon: CheckCircle2, text: "Zsynchronizowano", cls: "bg-success text-success-foreground" };

  // Gdy wszystko jest zsynchronizowane, wystarczy sama ikona (miejsce na tytuł ekranu i dzwonek);
  // tekst pokazujemy tylko wtedy, gdy jest coś do przekazania (offline, operacje w kolejce).
  const tylkoIkona = online && oczekuje === 0;
  return (
    <span
      role="status"
      aria-label={stan.text}
      title={stan.text}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs font-bold ${
        tylkoIkona ? "size-11 justify-center" : "px-3 py-1.5"
      } ${stan.cls}`}
    >
      <stan.Icon className={tylkoIkona ? "size-5" : "size-4 shrink-0"} />
      {!tylkoIkona && stan.text}
    </span>
  );
}
