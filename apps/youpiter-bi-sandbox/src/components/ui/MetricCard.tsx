import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
  };
  icon?: React.ReactNode;
  color?: "default" | "success" | "danger" | "warning" | "brand";
  className?: string;
}

const colorMap = {
  default: { bg: "bg-slate-100 dark:bg-slate-800", icon: "text-slate-500" },
  success: { bg: "bg-emerald-50 dark:bg-emerald-900/20", icon: "text-emerald-600" },
  danger: { bg: "bg-red-50 dark:bg-red-900/20", icon: "text-red-500" },
  warning: { bg: "bg-amber-50 dark:bg-amber-900/20", icon: "text-amber-500" },
  brand: { bg: "bg-amber-50 dark:bg-amber-900/20", icon: "text-amber-500" }
};

export function MetricCard({ title, value, subtitle, trend, icon, color = "default", className }: MetricCardProps) {
  const colors = colorMap[color];
  const trendPositive = trend && trend.value >= 0;

  return (
    <div className={cn("metric-card flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--color-muted)" }}>
            {title}
          </p>
        </div>
        {icon && (
          <div className={cn("flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ml-3", colors.bg, colors.icon)}>
            {icon}
          </div>
        )}
      </div>

      <div>
        <p className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>

      {trend && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium",
          trendPositive ? "text-emerald-600" : "text-red-500"
        )}>
          {trendPositive ? (
            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          <span>
            {trendPositive ? "+" : ""}{trend.value}% {trend.label}
          </span>
        </div>
      )}
    </div>
  );
}
