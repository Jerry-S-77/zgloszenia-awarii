import { useNavigate } from "@tanstack/react-router";
import { BarChart3, Download, KeyRound, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { czyRola, ETYKIETY_ROL } from "@/lib/uprawnienia";

export function MenuUzytkownika() {
  const auth = useAuth();
  const navigate = useNavigate();
  if (auth.stan !== "zalogowany") return null;
  const { profil } = auth;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu konta"
        className="flex size-11 items-center justify-center rounded-full bg-primary-foreground/15 active:bg-primary-foreground/30"
      >
        <User className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="text-base font-bold">{profil.imie_nazwisko}</p>
          <p className="text-xs font-normal text-muted-foreground">{ETYKIETY_ROL[profil.rola]}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {czyRola(profil.rola, ["kierownik", "admin"]) && (
          <>
            <DropdownMenuItem
              className="py-3 text-base"
              onSelect={() => void navigate({ to: "/dashboard" })}
            >
              <BarChart3 className="size-5" /> Analizy
            </DropdownMenuItem>
            <DropdownMenuItem
              className="py-3 text-base"
              onSelect={() => void navigate({ to: "/eksport" })}
            >
              <Download className="size-5" /> Eksport CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          className="py-3 text-base"
          onSelect={() => void navigate({ to: "/zmiana-hasla" })}
        >
          <KeyRound className="size-5" /> Zmień hasło
        </DropdownMenuItem>
        <DropdownMenuItem
          className="py-3 text-base"
          onSelect={async () => {
            if (await auth.wyloguj()) void navigate({ to: "/logowanie" });
          }}
        >
          <LogOut className="size-5" /> Wyloguj
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
