import { defineConfig } from "vitest/config";

/**
 * Unit tests for the client's pure logic — access rules, timing maths, request
 * shapes. Deliberately not component or page rendering: `async` Server
 * Components are not supported by Vitest (see next/dist/docs/01-app/02-guides/
 * testing), and the things worth guarding here are decisions, not markup.
 *
 * jsdom rather than node because some of this code reaches for `window` to
 * decide whether it can speak at all.
 *
 * Paths come from tsconfig natively; the vite-tsconfig-paths plugin the Next
 * guide still recommends now warns that it is redundant.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
