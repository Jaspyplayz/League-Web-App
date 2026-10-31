import { expect, test, type APIRequestContext } from "@playwright/test";

// Turnpoint's MCP server (src/app/api/mcp/route.ts, docs/mcp.md) has no page,
// so the browser tests never reach it. This asks the preview's /api/mcp for
// its tool list the way Claude does, so an update to mcp-handler or the MCP
// SDK that breaks the route at runtime fails here before it reaches the live
// site (JAS-56). Listing tools needs no database or Riot key.

const TOOLS = ["analyze_game", "look_up_player", "recent_games"];

// MCP requests have been seen held open until Vercel's 300 s limit (JAS-44).
// A healthy answer takes a second or two, even from a cold server, so a hung
// route fails in 15 s per request instead of waiting out the platform.
const REQUEST_TIMEOUT = 15_000;
test.setTimeout(40_000);

// The protection bypass goes only to the preview, and redirects aren't
// followed, so it can't be carried to another site (e2e/preview-login.ts).
function headers(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return {
    "content-type": "application/json",
    // Streamable HTTP: the server may answer with JSON or an event stream.
    accept: "application/json, text/event-stream",
    ...(secret ? { "x-vercel-protection-bypass": secret } : {}),
  };
}

async function call(request: APIRequestContext, id: number, method: string, params: object) {
  const response = await request.post("/api/mcp", {
    headers: headers(),
    data: { jsonrpc: "2.0", id, method, params },
    timeout: REQUEST_TIMEOUT,
    maxRedirects: 0,
  });
  const body = await response.text();
  expect(response.status(), `${method} answered:\n${body.slice(0, 500)}`).toBe(200);
  return parse(body);
}

// An event-stream answer carries the JSON-RPC message on its "data:" line.
function parse(body: string): { result?: Record<string, unknown>; error?: unknown } {
  const data = body.trim().startsWith("{")
    ? body
    : body
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .find((line) => line.startsWith("{"));
  expect(data, `no JSON-RPC message in:\n${body.slice(0, 500)}`).toBeTruthy();
  return JSON.parse(data!);
}

test("the MCP server lists its three tools", async ({ request }) => {
  const init = await call(request, 1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "turnpoint-smoke-test", version: "1.0.0" },
  });
  expect(init.error).toBeUndefined();
  expect(init.result?.serverInfo).toMatchObject({ name: "Turnpoint" });

  const list = await call(request, 2, "tools/list", {});
  expect(list.error).toBeUndefined();
  const tools = (list.result?.tools ?? []) as { name: string }[];
  expect(tools.map((tool) => tool.name).sort()).toEqual(TOOLS);
});
