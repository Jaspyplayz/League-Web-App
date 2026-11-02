import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// The tools reach Riot and the database; these tests only talk protocol.
vi.mock("@/lib/mcp/tools", () => ({
  MAX_RECENT_GAMES: 20,
  analyzeGame: vi.fn(),
  lookUpPlayer: vi.fn(),
  recentGames: vi.fn(),
}));

// A client on the 2026-07-28 protocol revision puts these in every request.
const MODERN = "2026-07-28";
const modernMeta = {
  "io.modelcontextprotocol/protocolVersion": MODERN,
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

function modernRequest(method: string, params: object = {}) {
  return new Request("https://league-web-app.vercel.app/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MODERN,
      "mcp-method": method,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: modernMeta } }),
  });
}

// Reads a response to its end, or gives up after `ms` and says the stream
// is still open (a real client would sit there until Vercel's 300 s limit).
async function readToEnd(response: Response, ms = 2_000): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = new Promise<"open">((resolve) => setTimeout(() => resolve("open"), ms));
  for (;;) {
    const next = await Promise.race([reader.read(), deadline]);
    if (next === "open") {
      await reader.cancel();
      return `${text}[still open after ${ms} ms]`;
    }
    if (next.done) return text;
    text += decoder.decode(next.value);
  }
}

describe("POST /api/mcp", () => {
  it("tells a client the tool list never changes", async () => {
    const response = await POST(modernRequest("server/discover"));
    const body = JSON.parse(await readToEnd(response));
    expect(body.result.capabilities.tools).toEqual({ listChanged: false });
  });

  it("ends a subscriptions/listen stream at once instead of holding it open", async () => {
    const response = await POST(modernRequest("subscriptions/listen", { notifications: { toolsListChanged: true } }));
    const text = await readToEnd(response);
    expect(text).not.toContain("[still open");
    // The answer is the acknowledgement, with nothing subscribed, then the
    // result that closes the subscription.
    expect(text).toContain('"notifications":{}');
    expect(text).toContain('"resultType":"complete"');
  });

  it("still lists the three tools", async () => {
    const response = await POST(modernRequest("tools/list"));
    const body = JSON.parse(await readToEnd(response));
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "look_up_player",
      "recent_games",
      "analyze_game",
    ]);
  });
});
