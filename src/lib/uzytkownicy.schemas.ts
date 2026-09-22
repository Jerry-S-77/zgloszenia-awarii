import { z } from "zod";
import { noweHasloSchema } from "./haslo";
import { ROLE } from "./uprawnienia";

export type Wynik<T> = { ok: true; dane: T } | { ok: false; komunikat: string };

export const nowyUzytkownikSchema = z.object({
  email: z.string().trim().toLowerCase().email("Podaj poprawny adres e-mail.").max(200),
  imieNazwisko: z.string().trim().min(2, "Podaj imię i nazwisko.").max(120),
  rola: z.enum(ROLE),
});

export const idUzytkownikaSchema = z.object({ userId: z.string().uuid() });

export const zmianaProfiluSchema = z.object({
  userId: z.string().uuid(),
  rola: z.enum(ROLE).optional(),
  status: z.enum(["aktywny", "zablokowany"]).optional(),
});

export const noweHasloWejscieSchema = z.object({
  noweHaslo: noweHasloSchema,
  // Wymagane tylko przy dobrowolnej zmianie; o trybie decyduje serwer na podstawie profilu.
  aktualneHaslo: z.string().max(72).optional(),
});

export type NowyUzytkownik = z.infer<typeof nowyUzytkownikSchema>;
export type ZmianaProfilu = z.infer<typeof zmianaProfiluSchema>;
