import { cn } from "@/lib/utils";

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function FitGauge({
  score,
  className,
}: {
  score: number; // 0-100
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, score));
  const color =
    clamped >= 75
      ? "text-emerald-600 dark:text-emerald-400"
      : clamped >= 50
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <div
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Fit score ${clamped} out of 100`}
      className={cn("relative size-12", className)}
    >
      <svg viewBox="0 0 48 48" className="size-full -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          strokeWidth="4"
          className="stroke-muted"
        />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
          className={cn("stroke-current transition-all duration-700", color)}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums",
          color,
        )}
      >
        {clamped}
      </span>
    </div>
  );
}
