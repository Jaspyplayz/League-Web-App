import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalSetting } from "./use-local-setting";

afterEach(() => vi.unstubAllGlobals());

function Setting({ settingKey }: { settingKey: string }) {
  return <p>{useLocalSetting(settingKey) ?? "nothing saved"}</p>;
}

describe("useLocalSetting", () => {
  // If the server used what this browser saved, the page React builds in the
  // browser wouldn't match the server's HTML.
  it("gives null on the server, even when this browser saved something", () => {
    vi.stubGlobal("localStorage", { getItem: () => "light" });
    expect(renderToStaticMarkup(<Setting settingKey="turnpoint-theme" />)).toBe(
      "<p>nothing saved</p>",
    );
  });
});
