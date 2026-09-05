import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { awarieQuery, urzadzeniaQuery } from "@/lib/queries";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Analizy awaryjności — Ewidencja awarii urządzeń" },
      {
        name: "description",
        content:
          "Progi alarmowe: 3 awarie w 90 dni, 2 awarie krytyczne w 60 dni, 8 godzin przestoju w 30 dni.",
      },
      { property: "og:title", content: "Analizy awaryjności urządzeń" },
      { property: "og:description", content: "Ranking awaryjności, progi alarmowe i trend miesięczny." },
    ],
  }),
  component: Dashboard;
});

function Dashboard() {
  return null;
}
