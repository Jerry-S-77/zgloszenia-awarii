import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { powiadomieniaQuery, useNaZywoPowiadomienia } from "@/lib/powiadomienia";

/** Dzwonek w nagłówku: licznik nieprzeczytanych (na żywo), prowadzi do listy powiadomień. */
export function Dzwonek() {
  const auth = useAuth();
  const userId =
    auth.stan === "zalogowany" && !auth.profil.must_change_password ? auth.profil.id : null;
  const { data: lista = [] } = useQuery({
    ...powiadomieniaQuery(userId),
    enabled: userId !== null,
  });
  useNaZywoPowiadomienia(userId);
  const nieprzeczytane = lista.filter((p) => !p.przeczytane).length;
  const krytyczne = lista.some((p) => !p.przeczytane && p.krytyczne);

  return (
    <Link
      to="/powiadomienia"
      aria-label={
        nieprzeczytane > 0 ? `Powiadomienia: ${nieprzeczytane} nieprzeczytane` : "Powiadomienia"
      }
      className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 active:bg-primary-foreground/30"
    >
      <Bell className="size-6" />
      {nieprzeczytane > 0 && (
        <span
          className={`absolute -right-1 -top-1 min-w-5 rounded-full px-1 text-center text-xs font-bold leading-5 ${
            krytyczne
              ? "bg-destructive text-destructive-foreground"
              : "bg-warning text-warning-foreground"
          }`}
        >
          {nieprzeczytane > 9 ? "9+" : nieprzeczytane}
        </span>
      )}
    </Link>
  );
}
