import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { zgodnySekret } from "@/lib/push-wiadomosc";

const cialo = z.object({ id: z.string().uuid() });

/**
 * Wywoływane wyłącznie przez bazę (trigger na `powiadomienia` przez pg_net) ze wspólnym sekretem w nagłówku
 * `x-push-sekret`. Wysyłka push dla jednego powiadomienia. Bez sekretu w konfiguracji trasa jest wyłączona.
 */
export const Route = createFileRoute("/api/push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sekret = process.env["PUSH_SEKRET"];
        if (!sekret) return Response.json({ blad: "Push wyłączony" }, { status: 503 });
        if (!zgodnySekret(request.headers.get("x-push-sekret"), sekret)) {
          return Response.json({ blad: "Brak uprawnień" }, { status: 401 });
        }
        let dane: z.infer<typeof cialo>;
        try {
          dane = cialo.parse(await request.json());
        } catch {
          return Response.json({ blad: "Nieprawidłowe dane" }, { status: 400 });
        }
        try {
          const { wyslijPushDlaPowiadomienia } = await import("@/lib/push.server");
          return Response.json(await wyslijPushDlaPowiadomienia(dane.id));
        } catch (e) {
          console.error("Wysyłka push nie powiodła się", e);
          return Response.json({ blad: "Wysyłka nie powiodła się" }, { status: 500 });
        }
      },
    },
  },
});
