import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { czyBladSieci } from "./kolejka-bledy";
import { getMojaKolejka, zakolejkuj } from "./offline";
import {
  KUBELEK_ZDJEC,
  LIMIT_ZDJEC,
  sciezkaZdjecia,
  wyslijZdjecie,
  type ZdjecieDoWyslania,
} from "./zdjecia-wysylka";

export { LIMIT_ZDJEC } from "./zdjecia-wysylka";

const MAKS_BOK = 1600;
const JAKOSC = 0.8;
const WAZNOSC_LINKU_S = 3600;

export type Zdjecie = {
  id: string;
  autor_id: string | null;
  autor_nazwa: string | null;
  created_at: string;
  url: string | null;
};

/** Wymiary po zmniejszeniu: dłuższy bok najwyżej `maks`, proporcje zachowane, bez powiększania. */
export function wymiaryPoZmniejszeniu(
  szerokosc: number,
  wysokosc: number,
  maks = MAKS_BOK,
): { szerokosc: number; wysokosc: number } {
  const skala = Math.min(1, maks / Math.max(szerokosc, wysokosc));
  return {
    szerokosc: Math.max(1, Math.round(szerokosc * skala)),
    wysokosc: Math.max(1, Math.round(wysokosc * skala)),
  };
}

/**
 * Zmniejsza zdjęcie z aparatu do JPEG (dłuższy bok 1600 px). Orientacja z EXIF jest uwzględniana,
 * a ponowne kodowanie usuwa metadane (w tym lokalizację GPS).
 */
export async function zmniejszZdjecie(plik: Blob): Promise<Blob> {
  const obraz = await createImageBitmap(plik, { imageOrientation: "from-image" });
  try {
    const { szerokosc, wysokosc } = wymiaryPoZmniejszeniu(obraz.width, obraz.height);
    const plotno = document.createElement("canvas");
    plotno.width = szerokosc;
    plotno.height = wysokosc;
    const kontekst = plotno.getContext("2d");
    if (!kontekst) throw new Error("Brak kontekstu rysowania.");
    kontekst.drawImage(obraz, 0, 0, szerokosc, wysokosc);
    return await new Promise<Blob>((resolve, reject) =>
      plotno.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Nie udało się zapisać zdjęcia."))),
        "image/jpeg",
        JAKOSC,
      ),
    );
  } finally {
    obraz.close();
  }
}

export function zdjeciaQuery(awariaId: string) {
  return queryOptions({
    queryKey: ["awarie", awariaId, "zdjecia"],
    // Podpisane linki ważne godzinę; odświeżamy je wcześniej.
    staleTime: 45 * 60 * 1000,
    queryFn: async (): Promise<Zdjecie[]> => {
      if (typeof navigator !== "undefined" && !navigator.onLine)
        throw new Error("Brak połączenia.");
      const { data, error } = await supabase
        .from("awarie_zdjecia")
        .select("id, autor_id, autor_nazwa, created_at")
        .eq("awaria_id", awariaId)
        .order("created_at");
      if (error) throw error;
      const wiersze = data ?? [];
      if (wiersze.length === 0) return [];
      const { data: linki } = await supabase.storage.from(KUBELEK_ZDJEC).createSignedUrls(
        wiersze.map((w) => sciezkaZdjecia(awariaId, w.id)),
        WAZNOSC_LINKU_S,
      );
      const poSciezce = new Map((linki ?? []).map((l) => [l.path, l.signedUrl]));
      return wiersze.map((w) => ({
        ...w,
        url: poSciezce.get(sciezkaZdjecia(awariaId, w.id)) ?? null,
      }));
    },
  });
}

export type ZdjecieOczekujace = { id: string; plik: Blob };

/** Zdjęcia tej awarii czekające w kolejce offline zalogowanego użytkownika. */
export async function zdjeciaOczekujace(awariaId: string): Promise<ZdjecieOczekujace[]> {
  const kolejka = await getMojaKolejka();
  return kolejka.flatMap((op) =>
    op.type === "zdjecie" && op.payload.awaria_id === awariaId
      ? [{ id: op.payload.id, plik: op.plik }]
      : [],
  );
}

/**
 * Dodaje zdjęcia do awarii. Online wysyła od razu; offline, przy błędzie sieci albo gdy sama awaria
 * czeka jeszcze w kolejce, zdjęcie trafia do kolejki (idzie po zgłoszeniu, bo kolejka zachowuje
 * kolejność). Odmowa serwera (np. limit 3 zdjęć) rzuca błąd.
 */
export async function dodajZdjecia(
  awariaId: string,
  pliki: Blob[],
): Promise<"zsynchronizowano" | "lokalnie"> {
  const kolejka = await getMojaKolejka();
  let przezKolejke =
    !navigator.onLine || kolejka.some((op) => op.type === "insert" && op.payload.id === awariaId);
  for (const plik of pliki) {
    const zdjecie: ZdjecieDoWyslania = { id: crypto.randomUUID(), awaria_id: awariaId };
    if (!przezKolejke) {
      const blad = await wyslijZdjecie(zdjecie, plik);
      if (!blad) continue;
      if (!czyBladSieci(blad)) {
        throw new Error(blad.message || "Serwer odrzucił zdjęcie.");
      }
      // Połączenie zerwane w trakcie: to i kolejne zdjęcia czekają w kolejce.
      przezKolejke = true;
    }
    await zakolejkuj({ type: "zdjecie", payload: zdjecie, plik });
  }
  return przezKolejke ? "lokalnie" : "zsynchronizowano";
}

/** Usuwa zdjęcie (autor albo admin; tylko online). */
export async function usunZdjecie(awariaId: string, zdjecieId: string): Promise<void> {
  if (!navigator.onLine) throw new Error("Usuwanie zdjęć wymaga połączenia z internetem.");
  const { data, error } = await supabase
    .from("awarie_zdjecia")
    .delete()
    .eq("id", zdjecieId)
    .select("id");
  if (error || !data?.length) throw new Error("Nie udało się usunąć zdjęcia.");
  await supabase.storage.from(KUBELEK_ZDJEC).remove([sciezkaZdjecia(awariaId, zdjecieId)]);
}
