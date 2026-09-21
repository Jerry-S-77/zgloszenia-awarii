import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/admin/uzytkownicy")({
  head: () => ({ meta: [{ title: "Użytkownicy — Ewidencja awarii urządzeń" }] }),
  component: () => (
    <AppShell title="Użytkownicy" dozwoloneRole={["admin"]}>
      <p className="text-muted-foreground">Panel w budowie.</p>
    </AppShell>
  ),
});
