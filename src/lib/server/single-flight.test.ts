import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./single-flight";

describe("createSingleFlight", () => {
  it("coalesces concurrent work for the same key and clears after completion", async () => {
    const singleFlight = createSingleFlight<string, number>();
    let release: ((value: number) => void) | undefined;
    const loader = vi.fn(() => new Promise<number>((resolve) => { release = resolve; }));

    const first = singleFlight.run("AAPL", loader);
    const second = singleFlight.run("AAPL", loader);
    const third = singleFlight.run("AAPL", loader);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);

    release?.(42);
    await expect(Promise.all([first, second, third])).resolves.toEqual([42, 42, 42]);

    await expect(singleFlight.run("AAPL", async () => 84)).resolves.toBe(84);
  });

  it("does not merge work for different symbols", async () => {
    const singleFlight = createSingleFlight<string, string>();
    await expect(Promise.all([
      singleFlight.run("AAPL", async () => "apple"),
      singleFlight.run("MSFT", async () => "microsoft"),
    ])).resolves.toEqual(["apple", "microsoft"]);
  });
});
