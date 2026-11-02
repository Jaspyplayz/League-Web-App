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

function post(body: object, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return POST(
    new Request("https://league-web-app.vercel.app/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

// A client on the 2026-07-28 protocol names it in a header and in `_meta`.
function postModern(method: string, params: object = {}, signal?: AbortSignal) {
  const _meta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  const headers = { "mcp-protocol-version": "2026-07-28", "mcp-method": method };
  return post({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta } }, headers, signal);
}

// The JSON-RPC messages in a stream (SSE) answer: one on each `data:` line.
function sseMessages(text: string) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

describe("POST /api/mcp", () => {
  it("tells a 2026-07-28 client the tool list never changes", async () => {
    const { result } = await (await postModern("server/discover")).json();
    expect(result.capabilities.tools).toEqual({ listChanged: false });
  });

  it("tells a 2025-era client the same", async () => {
    const response = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
    });
    const [{ result }] = sseMessages(await response.text());
    expect(result.capabilities.tools).toEqual({ listChanged: false });
  });

  it("ends a subscriptions/listen at once, whatever the client asks to hear about", async () => {
    // If the server held the stream open, this timeout would end it instead.
    const timeout = AbortSignal.timeout(1_000);
    const everything = {
      toolsListChanged: true,
      promptsListChanged: true,
      resourcesListChanged: true,
      resourceSubscriptions: ["turnpoint://anything"],
    };
    const response = await postModern("subscriptions/listen", { notifications: everything }, timeout);
    const [ack, end] = sseMessages(await response.text());

    expect(timeout.aborted).toBe(false);
    expect(ack.params.notifications).toEqual({});
    expect(end.result.resultType).toBe("complete");
  });

  it("still lists the three tools", async () => {
    const { result } = await (await postModern("tools/list")).json();
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "look_up_player",
      "recent_games",
      "analyze_game",
    ]);
  });
});
