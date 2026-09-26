/** „przed chwilą”, „5 min temu”, „2 godz. temu”, „wczoraj”, „3 dni temu”, a starsze jako data. */
export function opisCzasu(iso: string, teraz: Date = new Date()): string {
  const roznica = teraz.getTime() - new Date(iso).getTime();
  const minuty = Math.floor(roznica / 60_000);
  if (minuty < 1) return "przed chwilą";
  if (minuty < 60) return `${minuty} min temu`;
  const godziny = Math.floor(minuty / 60);
  if (godziny < 24) return `${godziny} godz. temu`;
  const dni = Math.floor(godziny / 24);
  if (dni === 1) return "wczoraj";
  if (dni < 7) return `${dni} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL");
}
