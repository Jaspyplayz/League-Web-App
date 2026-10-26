import { expect, test as base } from "@playwright/test";
import { passPreviewLogin, recordLeaks } from "./preview-login";

export const test = base.extend({
  // Named provide, not Playwright's usual use, which the React hooks lint rule
  // mistakes for a hook.
  context: async ({ context, baseURL }, provide) => {
    const preview = new URL(baseURL!).origin;
    await passPreviewLogin(context, preview);
    const leaked = recordLeaks(context, preview);
    await provide(context);
    expect(await leaked(), "other sites that got the bypass secret").toEqual([]);
  },
});

export { expect };
