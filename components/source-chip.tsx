import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The provenance primitive: every claim in the UI renders one of these,
 * linking to the exact public post/transcript the claim came from.
 */
export function SourceChip({
  url,
  title,
  date,
  className,
}: {
  url: string;
  title?: string | null;
  date?: Date | string | null;
  className?: string;
}) {
  let label = title?.trim();
  if (!label) {
    try {
      label = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      label = url;
    }
  }
  const dateLabel = date
    ? new Date(date).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title ?? url}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
        className,
      )}
    >
      <ExternalLink aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
      {dateLabel && (
        <span className="shrink-0 text-muted-foreground/70">· {dateLabel}</span>
      )}
    </a>
  );
}
