import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";
import { useAuth } from "@/lib/auth";
import { opisCzasu } from "@/lib/czas-wzgledny";
import {
  oznaczPrzeczytane,
  oznaczWszystkie,
  powiadomieniaQuery,
  type Powiadomienie,
} from "@/lib/powiadomienia";

export const Route = createFileRoute("/powiadomienia")({
  head: () => ({ meta: [{ title: "Powiadomienia — Ewidencja awarii urządzeń" }] }),
  component: Powiadomienia,
});

function styl(p: Powiadomienie): string {
  if (p.przeczytane) return "border-l-border opacity-75";
  return p.krytyczne ? "border-l-destructive bg-destructive/5" : "border-l-warning bg-warning/10";
}

function Powiadomienia() {
  const auth = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const online = useOnline();
  const userId =
    auth.stan === "zalogowany" && !auth.profil.must_change_password ? auth.profil.id : null;
  const {
    data: lista = [],
    isLoading,
    isError,
  } = useQuery({ ...powiadomieniaQuery(userId), enabled: userId !== null });
  const [zapis, setZapis] = useState(false);
  const nieprzeczytane = lista.filter((p) => !p.przeczytane).length;

  async function otworz(p: Powiadomienie) {
    if (!p.przeczytane && online) {
      try {
        await oznaczPrzeczytane(p.id);
        await qc.invalidateQueries({ queryKey: ["powiadomienia", userId] });
      } catch {
        /* nieudane oznaczenie nie blokuje przejścia do karty */
      }
    }
    if (p.link) router.history.push(p.link);
  }

  async function wszystkie() {
    if (!userId) return;
    setZapis(true);
    try {
      await oznaczWszystkie(userId);
      await qc.invalidateQueries({ queryKey: ["powiadomienia", userId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się oznaczyć powiadomień.");
    } finally {
      setZapis(false);
    }
  }

  return (
    <AppShell title="Powiadomienia">
      {nieprzeczytane > 0 && (
        <Button
          variant="outline"
          disabled={zapis || !online}
          onClick={() => void wszystkie()}
          className="mb-4 h-12 w-full text-base font-bold"
        >
          Oznacz wszystkie jako przeczytane ({nieprzeczytane})
        </Button>
      )}
      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          Nie udało się wczytać powiadomień. Powiadomienia wymagają połączenia z internetem.
        </p>
      )}
      {!isLoading && !isError && lista.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          Brak powiadomień.
        </p>
      )}
      <ul className="space-y-3">
        {lista.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => void otworz(p)}
              className={`flex w-full items-center gap-3 rounded-2xl border border-l-[6px] border-border bg-card p-4 text-left active:bg-accent ${styl(p)}`}
            >
              <div className="min-w-0 flex-1">
                <p className={`text-base ${p.przeczytane ? "" : "font-bold"}`}>
                  {p.krytyczne && (
                    <AlertTriangle
                      aria-label="Krytyczne"
                      className="mr-1 inline size-4 text-destructive"
                    />
                  )}
                  {p.tresc}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {opisCzasu(p.created_at)}
                  {!p.przeczytane && " · nieprzeczytane"}
                </p>
              </div>
              {p.link && <ChevronRight className="size-5 shrink-0 text-muted-foreground" />}
            </button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
