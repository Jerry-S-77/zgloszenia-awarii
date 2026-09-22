import type { ReactNode } from "react";

export function EkranAuth({
  tytul,
  podtytul,
  children,
}: {
  tytul: string;
  podtytul?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-md px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">
            Ewidencja awarii
          </p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">{tytul}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">
        {podtytul && <p className="mb-5 text-base text-muted-foreground">{podtytul}</p>}
        {children}
      </main>
    </div>
  );
}
