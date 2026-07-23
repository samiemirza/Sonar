import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe } from "lucide-react";
import { SourceChip } from "@/components/source-chip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getDb } from "@/lib/db";
import { getInvestorDetail } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

function StrengthDots({ strength }: { strength: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`Signal strength ${strength}/5`}
      aria-label={`Signal strength ${strength} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            i <= strength ? "bg-foreground" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

export default async function InvestorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getInvestorDetail(getDb(), slug);
  if (!detail) notFound();

  const { investor, thesis, signals, sources } = detail;
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Back to matching
        </Link>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {investor.name}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
          {investor.firm && <span className="mr-1">{investor.firm}</span>}
          <Badge variant="outline" className="capitalize">
            {investor.type}
          </Badge>
          {(thesis?.stages.length ? thesis.stages : investor.stageFocus).map(
            (stage) => (
              <Badge key={stage} variant="secondary">
                {stage}
              </Badge>
            ),
          )}
        </div>
        {investor.siteUrl && (
          <a
            href={investor.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Globe aria-hidden className="size-3.5" />
            {investor.siteUrl.replace(/^https?:\/\//, "")}
          </a>
        )}
      </header>

      {!thesis ? (
        <p className="text-muted-foreground">
          No extracted thesis for this investor yet — their sources are queued
          for the next extraction run.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Current thesis</h2>
            <p className="leading-relaxed text-foreground/90">
              {thesis.summary}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {thesis.sectors.map((sector) => (
                <Badge key={sector} variant="outline">
                  {sector}
                </Badge>
              ))}
            </div>
            {thesis.checkSize && (
              <p className="text-sm text-muted-foreground">
                Typical check: {thesis.checkSize}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Extracted {thesis.extractedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}{" "}
              · prompt {thesis.promptVersion} · from{" "}
              {thesis.sourceIds.length} source
              {thesis.sourceIds.length === 1 ? "" : "s"}
            </p>
          </section>

          {thesis.themes.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Active themes</h2>
              <ul className="flex flex-col gap-4">
                {thesis.themes.map((theme) => {
                  const source = sourceById.get(theme.sourceId);
                  return (
                    <li key={`${theme.theme}-${theme.sourceId}`}>
                      <p className="font-medium">{theme.theme}</p>
                      <blockquote className="mt-1 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                        {theme.evidence}
                      </blockquote>
                      {source && (
                        <div className="mt-1.5">
                          <SourceChip
                            url={source.url}
                            title={source.title}
                            date={source.publishedAt}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {signals.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Signal timeline</h2>
          <ol className="relative flex flex-col gap-5 border-l border-border pl-5">
            {signals.map((signal) => (
              <li key={signal.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[23px] top-1.5 size-2 rounded-full bg-foreground"
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <time dateTime={signal.signalDate.toISOString()}>
                    {signal.signalDate.toLocaleDateString("en-US", {
                      dateStyle: "medium",
                    })}
                  </time>
                  <StrengthDots strength={signal.strength} />
                </div>
                <p className="mt-1 leading-relaxed text-foreground/90">
                  {signal.claim}
                </p>
                <div className="mt-1.5">
                  <SourceChip
                    url={signal.sourceUrl}
                    title={signal.sourceTitle}
                  />
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Tracked sources</h2>
        <p className="text-sm text-muted-foreground">
          Everything Sonar knows about {investor.name} comes from these public
          sources.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {sources.map((source) => (
            <li key={source.id}>
              <SourceChip
                url={source.url}
                title={source.title}
                date={source.publishedAt}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
