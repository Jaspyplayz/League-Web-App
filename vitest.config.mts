import { defineConfig } from "vitest/config";

export default defineConfig({
  // Lets tests load modules that import with "@/..." (set up in tsconfig.json),
  // the way Next.js does.
  resolve: { tsconfigPaths: true },
});
