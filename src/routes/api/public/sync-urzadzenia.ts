import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const urzadzenieSchema = z.object({
  nr_technologiczny: z.string().trim().min(1).max(120),
  nazwa_urzadzenia: z.string().trim().min(1).max(300),
  kategoria: z.string().trim().max(200).nullish(),
  lokalizacja: z.string().trim().max(300).nullish(),
  krytycznosc: z.string().trim().max(100).nullish(),
  wlasciciel: z.string().trim().max(300).nullish(),
  status_w_rejestrze: z.string().trim().min(1).max(100),
});

type BladRekordu = {
  index: number;
  nr_technologiczny: string | null;
  blad: string;
};

export const Route = createFileRoute("/api/public/sync-urzadzenia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const configuredSecret = process.env["SYNC_URZADZENIA_SECRET"];
        if (!configuredSecret) {
          return Response.json(
            { blad: "SYNC_URZADZENIA_SECRET nie jest skonfigurowany" },
            { status: 500 },
          );
        }

        if (request.headers.get("x-sync-secret") !== configuredSecret) {
          return Response.json({ blad: "Unauthorized" }, { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ blad: "Body musi być poprawnym JSON-em" }, { status: 400 });
        }

        if (!Array.isArray(body)) {
          return Response.json({ blad: "Body musi być tablicą urządzeń" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const bledy: BladRekordu[] = [];
        let przetworzone = 0;

        for (const [index, raw] of body.entries()) {
          const parsed = urzadzenieSchema.safeParse(raw);
          const nrTechnologiczny =
            typeof raw === "object" && raw !== null && "nr_technologiczny" in raw
              ? String(raw.nr_technologiczny)
              : null;

          if (!parsed.success) {
            bledy.push({
              index,
              nr_technologiczny: nrTechnologiczny,
              blad: parsed.error.issues.map((issue) => issue.message).join("; "),
            });
            continue;
          }

          const { error } = await supabaseAdmin.from("urzadzenia").upsert(
            {
              ...parsed.data,
              kategoria: parsed.data.kategoria ?? null,
              lokalizacja: parsed.data.lokalizacja ?? null,
              krytycznosc: parsed.data.krytycznosc ?? null,
              wlasciciel: parsed.data.wlasciciel ?? null,
            },
            { onConflict: "nr_technologiczny" },
          );

          if (error) {
            console.error("sync-urzadzenia upsert failed", {
              index,
              nr_technologiczny: parsed.data.nr_technologiczny,
              code: error.code,
            });
            bledy.push({
              index,
              nr_technologiczny: parsed.data.nr_technologiczny,
              blad: "Nie udało się zapisać rekordu",
            });
            continue;
          }

          przetworzone += 1;
        }

        return Response.json({
          przetworzone,
          bledow: bledy.length,
          bledy,
        });
      },
    },
  },
});
