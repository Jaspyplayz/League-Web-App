import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// Next's redirect() ends the request by throwing; here it throws the address.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

describe("the old Ask address", () => {
  it("goes to the player's profile", async () => {
    const params = Promise.resolve({ region: "kr", riotId: "Hide on bush-KR1" });
    await expect(GET(new Request("http://localhost/x"), { params })).rejects.toThrow(
      "redirect /player/kr/Hide%20on%20bush-KR1",
    );
  });

  // The segments come back decoded, so they're encoded again and can't add
  // a path or a query of their own.
  it("keeps odd characters inside the profile's address", async () => {
    const params = Promise.resolve({ region: "na", riotId: "a/../b?c-TAG" });
    await expect(GET(new Request("http://localhost/x"), { params })).rejects.toThrow(
      "redirect /player/na/a%2F..%2Fb%3Fc-TAG",
    );
  });
});
