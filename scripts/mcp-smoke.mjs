// MCP smoke test: connect a real client to /api/mcp and exercise both tools.
// Usage: node scripts/mcp-smoke.mjs [base-url]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:3000";
const url = new URL("/api/mcp", base);

const client = new Client({ name: "sonar-smoke", version: "0.0.1" });
await client.connect(new StreamableHTTPClientTransport(url));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const match = await client.callTool({
  name: "match_investors",
  arguments: {
    company_description:
      "Vertical AI agent that automates prior-authorization paperwork for outpatient clinics",
    stage: "seed",
  },
});
const matches = JSON.parse(match.content[0].text).matches;
console.log(`\nmatch_investors -> ${matches.length} matches`);
for (const m of matches.slice(0, 3)) {
  console.log(
    `  ${String(m.fitScore).padStart(3)}  ${m.name}  whyNow src: ${m.whyNow?.source.url ?? "-"}`,
  );
}

const detail = await client.callTool({
  name: "get_investor_signals",
  arguments: { investor_slug: matches[0].slug },
});
const profile = JSON.parse(detail.content[0].text);
console.log(
  `\nget_investor_signals(${matches[0].slug}) -> thesis ${profile.thesis.promptVersion}, ` +
    `${profile.thesis.themes.length} themes, ${profile.signals.length} signals`,
);
console.log(`  first signal: [${profile.signals[0].strength}] ${profile.signals[0].date} ${profile.signals[0].claim.slice(0, 80)}`);
console.log(`  source: ${profile.signals[0].sourceUrl}`);

const bad = await client.callTool({
  name: "get_investor_signals",
  arguments: { investor_slug: "nobody" },
});
console.log(
  `\nunknown slug -> isError=${bad.isError === true}, lists ${JSON.parse(bad.content[0].text).available_slugs.length} available slugs`,
);

await client.close();
