import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generujHasloTymczasowe, noweHasloSchema } from "./haslo";
import type { Wynik, NowyUzytkownik, ZmianaProfilu } from "./uzytkownicy.schemas";

type Admin = SupabaseClient<Database>;

/** Błąd, którego komunikat wolno pokazać użytkownikowi. */
export class BladBiznesowy extends Error {
  constructor(komunikat: string) {
    super(komunikat);
    this.name = "BladBiznesowy";
  }
}

/** Rola admina jest sprawdzana w bazie, nie w tokenie: blokada działa od razu. */
export async function wymagajAdmina(admin: Admin, aktorId: string): Promise<void> {
  const { data, error } = await admin
    .from("profiles")
    .select("rola, status, must_change_password")
    .eq("id", aktorId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.rola !== "admin" || data.status !== "aktywny" || data.must_change_password) {
    throw new BladBiznesowy("Brak uprawnień.");
  }
}

type BladProbyHasla = { code?: string | undefined; status?: number | undefined } | null;

/**
 * Tylko odrzucenie danych logowania oznacza "hasło nie pasuje". Limit zapytań, błąd sieci
 * czy nieznany błąd to "blad": nie wolno ich traktować jak braku dopasowania (fail open).
 */
export function klasyfikujProbeHasla(blad: BladProbyHasla): "pasuje" | "nie_pasuje" | "blad" {
  if (blad === null) return "pasuje";
  if (blad.code === "invalid_credentials" || blad.code === "user_banned") return "nie_pasuje";
  return "blad";
}

/** Sprawdza, czy para e-mail i hasło pozwala się zalogować (klucz publishable, bez zapisu sesji). */
export async function czyHasloPasuje(email: string, haslo: string): Promise<boolean> {
  const url = process.env["SUPABASE_URL"];
  const klucz = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !klucz) throw new Error("Brak SUPABASE_URL lub SUPABASE_PUBLISHABLE_KEY");
  const klient = createClient<Database>(url, klucz, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await klient.auth.signInWithPassword({ email, password: haslo });
  const wynik = klasyfikujProbeHasla(error);
  if (wynik === "blad") {
    console.error("czyHasloPasuje: signInWithPassword", error?.code ?? error?.status);
    throw new BladBiznesowy("Nie udało się sprawdzić hasła. Spróbuj ponownie za chwilę.");
  }
  if (wynik === "pasuje") {
    try {
      await klient.auth.signOut(); // próba nie zostawia żywej sesji
    } catch {
      /* sesja próbna i tak nie jest nigdzie zapisana */
    }
  }
  return wynik === "pasuje";
}

export async function utworzKonto(admin: Admin, aktorId: string, wej: NowyUzytkownik) {
  await wymagajAdmina(admin, aktorId);
  const haslo = generujHasloTymczasowe();
  const { data, error } = await admin.auth.admin.createUser({
    email: wej.email,
    password: haslo,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (error?.code === "email_exists")
      throw new BladBiznesowy("Konto o tym adresie e-mail już istnieje.");
    console.error("utworzKonto: createUser", error?.code);
    throw new BladBiznesowy("Nie udało się utworzyć konta.");
  }
  const { error: bladProfilu } = await admin.from("profiles").insert({
    id: data.user.id,
    email: wej.email,
    imie_nazwisko: wej.imieNazwisko,
    rola: wej.rola,
    status: "aktywny",
    must_change_password: true,
  });
  if (bladProfilu) {
    await admin.auth.admin.deleteUser(data.user.id); // nie zostawiamy konta bez profilu
    console.error("utworzKonto: insert profiles", bladProfilu.code);
    throw new BladBiznesowy("Nie udało się utworzyć profilu użytkownika.");
  }
  return { id: data.user.id, email: wej.email, hasloTymczasowe: haslo };
}

export async function resetujHaslo(admin: Admin, aktorId: string, userId: string) {
  await wymagajAdmina(admin, aktorId);
  const haslo = generujHasloTymczasowe();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: haslo });
  if (error) {
    console.error("resetujHaslo: updateUserById", error.code);
    throw new BladBiznesowy("Nie udało się zresetować hasła.");
  }
  // Wymuszenie zmiany działa od razu: RLS odcina dane, dopóki użytkownik nie ustawi własnego hasła,
  // nawet jeśli jego dotychczasowy token dostępu jeszcze nie wygasł.
  const { error: bladProfilu } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  if (bladProfilu) throw new BladBiznesowy("Nie udało się zresetować hasła.");
  return { hasloTymczasowe: haslo };
}

export async function zmienRoleLubStatus(admin: Admin, aktorId: string, wej: ZmianaProfilu) {
  await wymagajAdmina(admin, aktorId);
  const zapis: {
    rola?: NonNullable<ZmianaProfilu["rola"]>;
    status?: NonNullable<ZmianaProfilu["status"]>;
  } = {};
  if (wej.rola) zapis.rola = wej.rola;
  if (wej.status) zapis.status = wej.status;
  if (Object.keys(zapis).length === 0) throw new BladBiznesowy("Brak zmian do zapisania.");

  const { data: zmienione, error } = await admin
    .from("profiles")
    .update(zapis)
    .eq("id", wej.userId)
    .select("id");
  if (error) {
    if (error.message.includes("ostatniego aktywnego administratora")) {
      throw new BladBiznesowy(
        "Nie można zdegradować ani zablokować ostatniego aktywnego administratora.",
      );
    }
    console.error("zmienRoleLubStatus: update", error.code);
    throw new BladBiznesowy("Nie udało się zapisać zmian.");
  }
  if (!zmienione || zmienione.length === 0) throw new BladBiznesowy("Nie znaleziono użytkownika.");
  if (wej.status) {
    // Blokada w Auth zatrzymuje odświeżanie tokenu; RLS odcina dane natychmiast.
    const { error: bladBanu } = await admin.auth.admin.updateUserById(wej.userId, {
      ban_duration: wej.status === "zablokowany" ? "876000h" : "none",
    });
    if (bladBanu) {
      console.error("zmienRoleLubStatus: ban", bladBanu.code);
      throw new BladBiznesowy(
        "Zmieniono status konta, ale nie udało się zaktualizować blokady logowania. Spróbuj ponownie.",
      );
    }
  }
}

export async function zmienWlasneHaslo(
  admin: Admin,
  userId: string,
  noweHaslo: string,
): Promise<void> {
  const parsed = noweHasloSchema.safeParse(noweHaslo);
  if (!parsed.success)
    throw new BladBiznesowy(parsed.error.issues[0]?.message ?? "Nieprawidłowe hasło.");

  const { data: profil } = await admin
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (!profil || profil.status !== "aktywny") throw new BladBiznesowy("Brak uprawnień.");

  const { data: uzytkownik, error } = await admin.auth.admin.getUserById(userId);
  if (error || !uzytkownik.user?.email) throw new BladBiznesowy("Nie udało się zmienić hasła.");
  if (await czyHasloPasuje(uzytkownik.user.email, noweHaslo)) {
    throw new BladBiznesowy("Nowe hasło musi różnić się od dotychczasowego.");
  }

  const { error: bladHasla } = await admin.auth.admin.updateUserById(userId, {
    password: noweHaslo,
  });
  if (bladHasla) {
    console.error("zmienWlasneHaslo: updateUserById", bladHasla.code);
    throw new BladBiznesowy("Nie udało się zmienić hasła.");
  }
  // Hasło jest już zmienione, więc flagę próbujemy zdjąć kilka razy. Nie ma tu skrótu "hasło bez
  // zmian": użytkownik nie może zostać z hasłem tymczasowym znanym administratorowi.
  let kodBleduFlagi: string | undefined;
  for (let proba = 1; proba <= 3; proba++) {
    const { error: bladFlagi } = await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", userId);
    if (!bladFlagi) return;
    kodBleduFlagi = bladFlagi.code;
    if (proba < 3) await new Promise((r) => setTimeout(r, 200));
  }
  console.error("zmienWlasneHaslo: zdjęcie flagi", kodBleduFlagi);
  throw new BladBiznesowy(
    "Hasło zostało zmienione, ale nie udało się dokończyć zmiany. Zaloguj się nowym hasłem i spróbuj ponownie.",
  );
}

/** Zamienia wyjątek na wynik, który da się bezpiecznie przesłać do klienta. */
export async function bezpiecznie<T>(praca: () => Promise<T>): Promise<Wynik<T>> {
  try {
    return { ok: true, dane: await praca() };
  } catch (e) {
    if (e instanceof BladBiznesowy) return { ok: false, komunikat: e.message };
    // Tylko wybrane pola: obiekt błędu PostgREST może zawierać `details` z wartościami wierszy.
    const opis = (e ?? {}) as { name?: unknown; message?: unknown; code?: unknown };
    console.error("Nieoczekiwany błąd funkcji serwerowej", opis.name, opis.message, opis.code);
    return { ok: false, komunikat: "Wystąpił błąd serwera. Spróbuj ponownie." };
  }
}
