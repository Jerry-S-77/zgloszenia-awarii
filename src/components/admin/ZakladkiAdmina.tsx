import { Link } from "@tanstack/react-router";

const ZAKLADKI = [
  { to: "/admin/uzytkownicy", etykieta: "Użytkownicy" },
  { to: "/admin/urzadzenia", etykieta: "Urządzenia" },
] as const;

export function ZakladkiAdmina() {
  return (
    <nav
      className="mb-4 grid grid-cols-2 border-b-2 border-border"
      aria-label="Sekcje administracji"
    >
      {ZAKLADKI.map(({ to, etykieta }) => (
        <Link
          key={to}
          to={to}
          className="-mb-0.5 flex min-h-12 items-center justify-center border-b-2 border-transparent text-base font-bold text-muted-foreground"
          activeProps={{ className: "border-primary! text-primary!" }}
        >
          {etykieta}
        </Link>
      ))}
    </nav>
  );
}
