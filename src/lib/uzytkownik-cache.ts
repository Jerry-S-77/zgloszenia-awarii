/** Klucz localStorage z profilem zalogowanego użytkownika (zapisywany przez `auth.tsx`). */
export const PROFIL_CACHE_KEY = "profil-cache-v1";

/**
 * Wybiera identyfikator bieżącego użytkownika. Wygasły token przy braku sieci daje sesję null
 * (odświeżenie się nie udaje), a offline nadal trzeba wiedzieć, czyje jest zgłoszenie. Dlatego
 * tylko offline wolno użyć id z pamięci lokalnej; online wygasła sesja ma się odświeżyć albo zawieść.
 */
export function wybierzUserId(
  sesjaUserId: string | null,
  online: boolean,
  cacheUserId: string | null,
): string | null {
  if (sesjaUserId) return sesjaUserId;
  return online ? null : cacheUserId;
}

/** Id użytkownika z zapisanego profilu; bezpiecznie zwraca null przy braku lub uszkodzeniu wpisu. */
export function odczytajIdZCache(): string | null {
  try {
    const surowy = window.localStorage.getItem(PROFIL_CACHE_KEY);
    const id = (surowy ? JSON.parse(surowy) : null)?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/**
 * Stan po uruchomieniu aplikacji. Wygasły token przy braku sieci daje sesję null, choć użytkownik
 * jest zalogowany: tylko offline pokazujemy wtedy profil z pamięci lokalnej (RLS nadal decyduje
 * o danych). Online brak sesji to brak zalogowania, więc pamięci nie ufamy.
 */
export function stanPoStarcie(
  sesjaUserId: string | null,
  online: boolean,
  cacheProfil: { id: string } | null,
): "sesja" | "cache" | "brak" {
  if (sesjaUserId) return "sesja";
  return !online && cacheProfil ? "cache" : "brak";
}
