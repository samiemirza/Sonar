"use client";

import { useRef, useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { InvestorCard } from "@/components/investor-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { MatchCard } from "@/lib/ai/schemas";

const EXAMPLES = [
  "AI agent that automates SOC 2 compliance and security questionnaires for B2B startups",
  "Open-source observability platform for LLM applications, pre-seed",
  "Marketplace connecting independent pharmacies with wholesale drug distributors",
  "Developer tool that records production traffic and replays it as integration tests",
];

type Status = "idle" | "searching" | "streaming" | "done" | "error";

export default function Home() {
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [cards, setCards] = useState<MatchCard[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  async function runMatch(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 10) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCards([]);
    setStatus("searching");

    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`match failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let received = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as MatchCard | { error: string };
          if ("error" in parsed) throw new Error(parsed.error);
          received = true;
          setStatus("streaming");
          setCards((prev) => [...prev, parsed]);
        }
      }
      setStatus(received ? "done" : "error");
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setStatus("error");
    }
  }

  const busy = status === "searching" || status === "streaming";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-12 sm:py-16">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Radar aria-hidden className="size-6" />
          <span className="text-xl font-semibold tracking-tight">Sonar</span>
        </div>
        <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Find investors already signaling interest in your space
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Describe your company in one line. Sonar matches it against what 50+
          investors have publicly written and said recently — every claim
          linked to its source.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runMatch(description);
          }}
          className="flex flex-col gap-2"
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. AI copilot that drafts and negotiates commercial contracts for in-house legal teams"
            rows={3}
            maxLength={2000}
            className="resize-none text-base"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Matched against public blogs, newsletters, and talks only.
            </p>
            <Button type="submit" disabled={busy || description.trim().length < 10}>
              {busy ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Matching…
                </>
              ) : (
                "Find investors"
              )}
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setDescription(example);
                void runMatch(example);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-live="polite">
        {status === "searching" && (
          <>
            <p className="text-sm text-muted-foreground">
              Retrieving matching investor writing, then ranking…
            </p>
            {[0, 1].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {cards.map((card) => (
          <InvestorCard key={card.slug} match={card} />
        ))}

        {status === "streaming" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            Ranking more investors…
          </p>
        )}

        {status === "done" && cards.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Ranked {cards.length} investors. Scores reflect thesis overlap,
            stage fit, and recency of public signals — click through for full
            provenance.
          </p>
        )}

        {status === "error" && (
          <p className="text-sm text-destructive">
            Something went wrong while matching. Try again in a moment.
          </p>
        )}
      </section>
    </div>
  );
}
