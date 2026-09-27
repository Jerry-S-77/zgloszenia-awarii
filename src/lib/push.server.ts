import { subskrypcjeDlaPowiadomienia, wiadomoscPush } from "./push-wiadomosc";

/**
 * Wysyłka push dla jednego powiadomienia (wywoływana przez bazę przez `/api/push`). Czyta powiadomienie
 * i subskrypcje adresata kluczem serwisowym, wysyła kluczami VAPID i usuwa subskrypcje wygasłe (404/410).
 * Ładowane dynamicznie w handlerze, żeby klucz serwisowy i web-push nie trafiły do paczki przeglądarki.
 */
export async function wyslijPushDlaPowiadomienia(
  powiadomienieId: string,
): Promise<{ wyslane: number; usuniete: number }> {
  const publiczny = process.env["VITE_VAPID_PUBLIC_KEY"] ?? process.env["VAPID_PUBLIC_KEY"];
  const prywatny = process.env["VAPID_PRIVATE_KEY"];
  const kontakt = process.env["VAPID_SUBJECT"] ?? "mailto:admin@zgloszenia-awarii.invalid";
  if (!publiczny || !prywatny) throw new Error("Brak kluczy VAPID w konfiguracji serwera");

  const [{ supabaseAdmin }, webpush] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("web-push").then((m) => m.default ?? m),
  ]);
  webpush.setVapidDetails(kontakt, publiczny, prywatny);

  const { data: p, error } = await supabaseAdmin
    .from("powiadomienia")
    .select("id, uzytkownik_id, tresc, link, krytyczne, typ")
    .eq("id", powiadomienieId)
    .maybeSingle();
  if (error) throw error;
  if (!p) return { wyslane: 0, usuniete: 0 };

  const { data: subskrypcje, error: bladSub } = await supabaseAdmin
    .from("push_subskrypcje")
    .select("id, endpoint, p256dh, auth, tylko_krytyczne")
    .eq("uzytkownik_id", p.uzytkownik_id);
  if (bladSub) throw bladSub;

  const tresc = JSON.stringify(wiadomoscPush(p));
  let wyslane = 0;
  const wygasle: string[] = [];
  await Promise.all(
    subskrypcjeDlaPowiadomienia(subskrypcje ?? [], p.krytyczne).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          tresc,
          { TTL: 24 * 3600, urgency: p.krytyczne ? "high" : "normal" },
        );
        wyslane++;
      } catch (e) {
        const kod = (e as { statusCode?: number }).statusCode;
        if (kod === 404 || kod === 410) wygasle.push(s.id);
        else console.error("Push nieudany", kod, (e as Error).message);
      }
    }),
  );
  if (wygasle.length) await supabaseAdmin.from("push_subskrypcje").delete().in("id", wygasle);
  return { wyslane, usuniete: wygasle.length };
}
