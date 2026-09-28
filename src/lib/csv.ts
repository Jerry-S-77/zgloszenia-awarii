/**
 * Tekst, który Excel potraktowałby jak formułę (zaczyna się od =, +, -, @ — także po spacjach — albo od
 * tabulatora/CR), poprzedzamy apostrofem, żeby eksport CSV nie wykonał cudzej formuły u osoby otwierającej plik.
 */
export function bezFormuly(tekst: string): string {
  return /^(?:\s*[=+\-@]|[\t\r])/.test(tekst) ? `'${tekst}` : tekst;
}
