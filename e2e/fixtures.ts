import { test as base } from "@playwright/test";
import { passPreviewLogin } from "./preview-login";

export const test = base.extend({
  // Named provide, not Playwright's usual use, which the React hooks lint rule
  // mistakes for a hook.
  context: async ({ context, baseURL }, provide) => {
    await passPreviewLogin(context, new URL(baseURL!).origin);
    await provide(context);
  },
});

export { expect } from "@playwright/test";
