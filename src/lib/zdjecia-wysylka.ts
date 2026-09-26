import { supabase } from "@/integrations/supabase/client";
import { czyDuplikat } from "./kolejka-bledy";

export const KUBELEK_ZDJEC = "zdjecia-awarii";
export const LIMIT_ZDJEC = 3;

export type ZdjecieDoWyslania = { id: string; awaria_id: string };

/** Błąd w formacie kolejki offline: brak `code` oznacza błąd sieci (patrz `czyBladSieci`). */
export type BladWysylki = { code?: string; message?: string } | null;

export function sciezkaZdjecia(awariaId: string, zdjecieId: string): string {
  return `${awariaId}/${zdjecieId}.jpg`;
}

type BladStorage = { message?: string; status?: number; statusCode?: string };

/**
 * Błąd Storage w formacie kolejki. Odpowiedź serwera (jest `status`) to odmowa biznesowa z kodem,
 * a błąd bez statusu (fetch się nie udał) to błąd sieci, czyli bez `code`. Plik, który już jest
 * (ponowna wysyłka po zgubionej odpowiedzi), zwraca `null`: traktujemy go jak wysłany.
 */
export function klasyfikujBladStorage(blad: BladStorage | null | undefined): BladWysylki {
  if (!blad) return null;
  const status = blad.status ?? (blad.statusCode ? Number(blad.statusCode) : undefined);
  if (status === undefined || Number.isNaN(status)) return { message: blad.message ?? "" };
  if (
    status === 409 ||
    blad.statusCode === "409" ||
    /already exists|duplicate/i.test(blad.message ?? "")
  ) {
    return null;
  }
  return { code: `STORAGE_${status}`, message: blad.message ?? "Serwer odrzucił zdjęcie." };
}

/**
 * Wysyła plik, potem zapisuje wiersz. Oba kroki są idempotentne (id nadaje klient), więc kolejka może
 * bezpiecznie ponowić całość. Gdy baza odrzuci wiersz (np. limit 3 zdjęć), wysłany plik jest usuwany.
 */
export async function wyslijZdjecie(zdjecie: ZdjecieDoWyslania, plik: Blob): Promise<BladWysylki> {
  const sciezka = sciezkaZdjecia(zdjecie.awaria_id, zdjecie.id);
  const { error: bladPliku } = await supabase.storage
    .from(KUBELEK_ZDJEC)
    .upload(sciezka, plik, { contentType: "image/jpeg", upsert: false });
  const bladStorage = klasyfikujBladStorage(bladPliku as BladStorage | null);
  if (bladStorage) return bladStorage;

  const { error } = await supabase
    .from("awarie_zdjecia")
    .insert({ id: zdjecie.id, awaria_id: zdjecie.awaria_id });
  if (!error || czyDuplikat(error)) return null;
  if (error.code) await supabase.storage.from(KUBELEK_ZDJEC).remove([sciezka]);
  return { code: error.code, message: error.message };
}
