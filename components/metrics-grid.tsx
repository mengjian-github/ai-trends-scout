import { TrendingDown, TrendingUp } from "lucide-react";
import { formatNumber, formatPercentChange } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";

export type Metric = {
  id: string;
  label: string;
  value: number | null;
  unit?: string;
  delta?: number | null;
  hint?: string;
};

type MetricsGridProps = {
  metrics: Metric[];
};

export const MetricsGrid = ({ metrics }: MetricsGridProps) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const delta = metric.delta ?? null;
        const isPositive = (delta ?? 0) >= 0;

        return (
          <Card key={metric.id} className="bg-black/20">
            <CardHeader className="mb-2">
              <CardTitle className="text-sm font-medium text-white/70">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-semibold text-white">
                  {formatNumber(metric.value, { maximumFractionDigits: 1 })}
                  {metric.unit ? <span className="ml-1 text-base font-normal text-white/70">{metric.unit}</span> : null}
                </p>
                {metric.hint ? (
                  <CardDescription className="mt-2 text-xs leading-relaxed text-white/50">
                    {metric.hint}
                  </CardDescription>
                ) : null}
              </div>
              {delta !== null ? (
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                    isPositive ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
                  }`}
                >
                  {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {formatPercentChange(delta)}
                </span>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
