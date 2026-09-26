import { describe, expect, it } from "vitest";
import { mozliwosciOffline } from "@/lib/offline-mozliwosci";

describe("mozliwosciOffline", () => {
  it("pracownik: zgłoszenie offline tak, komentarze nie, bez pozycji obsługi", () => {
    const m = mozliwosciOffline("pracownik");
    expect(m.mozna.join(" ")).toContain("Zgłosić awarię");
    expect(m.mozna.join(" ")).not.toContain("status");
    expect(m.niemozna).toEqual(["Dodawać komentarzy"]);
  });
  it("technik: zmiana statusu offline tak, zespół i przeglądy nie", () => {
    const m = mozliwosciOffline("technik");
    expect(m.mozna.join(" ")).toContain("Zmienić status");
    expect(m.niemozna.join(" ")).toContain("zespołu");
    expect(m.niemozna.join(" ")).toContain("przeglądów");
    expect(m.niemozna.join(" ")).not.toContain("harmonogramu");
  });
  it("kierownik: dochodzą decyzje i analizy; admin: konta i urządzenia", () => {
    expect(mozliwosciOffline("kierownik").niemozna.join(" ")).toContain("harmonogramu");
    expect(mozliwosciOffline("kierownik").niemozna.join(" ")).not.toContain("kontami");
    expect(mozliwosciOffline("admin").niemozna.join(" ")).toContain("kontami");
  });
});
