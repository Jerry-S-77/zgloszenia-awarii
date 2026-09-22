import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EkranAuth } from "@/components/EkranAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { komunikatBleduLogowania } from "@/lib/auth-bledy";

export const Route = createFileRoute("/logowanie")({
  head: () => ({ meta: [{ title: "Logowanie — Ewidencja awarii urządzeń" }] }),
  component: Logowanie,
});

function Logowanie() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [haslo, setHaslo] = useState("");
  const [loguje, setLoguje] = useState(false);

  useEffect(() => {
    if (auth.stan === "zalogowany") void navigate({ to: "/" });
  }, [auth.stan, navigate]);

  async function zaloguj(e: React.FormEvent) {
    e.preventDefault();
    setLoguje(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: haslo,
    });
    setLoguje(false);
    if (error) toast.error(komunikatBleduLogowania(error));
  }

  return (
    <EkranAuth
      tytul="Logowanie"
      podtytul="Konto zakłada administrator. Nie masz konta? Poproś go o dostęp."
    >
      <form onSubmit={zaloguj} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-base">
            E-mail
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="haslo" className="text-base">
            Hasło
          </Label>
          <Input
            id="haslo"
            type="password"
            autoComplete="current-password"
            required
            value={haslo}
            onChange={(e) => setHaslo(e.target.value)}
            className="h-14 text-base"
          />
        </div>
        <Button type="submit" disabled={loguje} className="h-16 w-full text-lg font-bold">
          {loguje ? "Logowanie..." : "Zaloguj się"}
        </Button>
      </form>
    </EkranAuth>
  );
}
