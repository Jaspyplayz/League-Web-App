// Keeps a long-running job under a rate limit by waiting before each call.
// Riot counts calls in a rolling window ("100 calls every 2 minutes"), so this
// remembers when the recent calls happened and, once the window is full,
// waits until the oldest one drops out.
//
// The live site has no need for this: a page view makes a handful of calls.
// It's for scripts like the benchmark collector that make hundreds in a row.
export function createPacer(maxCalls: number, windowMs: number): () => Promise<void> {
  // When each call in the current window started, oldest first.
  const calls: number[] = [];

  return async function wait() {
    for (;;) {
      const now = Date.now();
      while (calls.length > 0 && calls[0] <= now - windowMs) calls.shift();
      // Checking and recording happen with no await in between, so two calls
      // waiting at once can't both take the last free slot.
      if (calls.length < maxCalls) {
        calls.push(now);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, calls[0] + windowMs - now));
    }
  };
}
