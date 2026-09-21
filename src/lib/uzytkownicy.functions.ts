import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  idUzytkownikaSchema,
  noweHasloWejscieSchema,
  nowyUzytkownikSchema,
  zmianaProfiluSchema,
} from "./uzytkownicy.schemas";

// Klucz service-role i logika kont ładowane dynamicznie: ten plik trafia do bundla klienta.
async function zaleznosci() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const serwer = await import("./uzytkownicy.server");
  return { admin: supabaseAdmin, ...serwer };
}

export const utworzKontoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => nowyUzytkownikSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, utworzKonto, bezpiecznie } = await zaleznosci();
    return bezpiecznie(() => utworzKonto(admin, context.userId, data));
  });

export const resetujHasloFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => idUzytkownikaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, resetujHaslo, bezpiecznie } = await zaleznosci();
    return bezpiecznie(() => resetujHaslo(admin, context.userId, data.userId));
  });

export const zmienRoleLubStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => zmianaProfiluSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, zmienRoleLubStatus, bezpiecznie } = await zaleznosci();
    return bezpiecznie(() => zmienRoleLubStatus(admin, context.userId, data));
  });

export const zmienWlasneHasloFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => noweHasloWejscieSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, zmienWlasneHaslo, bezpiecznie } = await zaleznosci();
    return bezpiecznie(() =>
      zmienWlasneHaslo(admin, context.userId, data.noweHaslo, data.aktualneHaslo),
    );
  });
