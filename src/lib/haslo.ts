import { z } from "zod";

// Bez znaków łatwych do pomylenia: 0 O 1 l I.
const ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const DLUGOSC = 12;

/** Hasło tymczasowe XXXX-XXXX-XXXX z CSPRNG (odrzucanie próbek eliminuje obciążenie modulo). */
export function generujHasloTymczasowe(): string {
  const limit = 256 - (256 % ALFABET.length);
  const znaki: string[] = [];
  while (znaki.length < DLUGOSC) {
    for (const bajt of crypto.getRandomValues(new Uint8Array(24))) {
      if (bajt < limit && znaki.length < DLUGOSC)
        znaki.push(ALFABET[bajt % ALFABET.length] as string);
    }
  }
  const tekst = znaki.join("");
  return `${tekst.slice(0, 4)}-${tekst.slice(4, 8)}-${tekst.slice(8, 12)}`;
}

export const noweHasloSchema = z
  .string()
  .min(12, "Hasło musi mieć co najmniej 12 znaków.")
  .max(72, "Hasło może mieć najwyżej 72 znaki.");
