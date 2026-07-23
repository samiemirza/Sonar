import { createMcpHandler } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";

export const maxDuration = 300;

const handler = createMcpHandler(
  (server) => registerTools(server),
  {
    serverInfo: { name: "sonar", version: "0.1.0" },
    instructions:
      "Sonar matches companies to venture investors based on what those investors " +
      "have publicly written and said recently. Every claim carries the URL of the " +
      "public source it was extracted from.",
  },
  {
    basePath: "/api",
    maxDuration: 300,
    // Streamable HTTP only — the deprecated SSE transport needs Redis for
    // session state and adds nothing for this deployment.
    disableSse: true,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
