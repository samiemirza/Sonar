import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { FitGauge } from "@/components/fit-gauge";
import { SourceChip } from "@/components/source-chip";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MatchCard } from "@/lib/ai/schemas";

export function InvestorCard({ match }: { match: MatchCard }) {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <CardHeader>
        <CardTitle className="text-lg">{match.name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          {match.firm && <span className="mr-1">{match.firm}</span>}
          <Badge variant="outline" className="capitalize">
            {match.type}
          </Badge>
          {match.stages.map((stage) => (
            <Badge key={stage} variant="secondary">
              {stage}
            </Badge>
          ))}
        </CardDescription>
        <CardAction>
          <FitGauge score={match.fitScore} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="leading-relaxed text-foreground/90">{match.reasoning}</p>

        {match.whyNow && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Zap aria-hidden className="size-3.5 text-amber-500" />
              Why now
            </div>
            <p className="leading-relaxed">{match.whyNow.text}</p>
            <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
              {match.whyNow.claim}
            </blockquote>
            <div className="mt-2">
              <SourceChip
                url={match.whyNow.source.url}
                title={match.whyNow.source.title}
                date={match.whyNow.date}
              />
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Outreach angle
          </div>
          <p className="leading-relaxed text-foreground/90">
            {match.outreachAngle}
          </p>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Link
          href={`/investor/${match.slug}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
        >
          Full thesis & signal timeline
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}
