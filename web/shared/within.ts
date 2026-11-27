// A limit on a wait. The browser's own fetch has none: a request the Mac
// never answers would leave a screen waiting for good.

/** `work`, or a failure with `message` if it has not finished in `ms`. What
 *  `work` does after that is ignored: it is not stopped, only no longer waited for. */
export function within<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(message)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        ok(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        fail(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
