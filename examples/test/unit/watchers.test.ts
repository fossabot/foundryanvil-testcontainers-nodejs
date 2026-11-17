import { triggerUntil } from "../../src";

describe("triggerUntil", () => {
  it("triggers until the condition holds", async () => {
    let triggers = 0;
    let reported = 0;
    // Simulates a watcher that misses the first two triggers (not subscribed yet).
    await triggerUntil(
      () => {
        triggers++;
        if (triggers > 2) setTimeout(() => reported++, 5);
        return Promise.resolve();
      },
      () => reported > 0,
      { intervalMs: 20 },
    );
    expect(triggers).toBe(3);
  });

  it("does not trigger when the condition already holds", async () => {
    const trigger = jest.fn(() => Promise.resolve());
    await triggerUntil(trigger, () => true);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("fails with the number of attempts after the timeout", async () => {
    await expect(
      triggerUntil(
        () => Promise.resolve(),
        () => false,
        {
          intervalMs: 10,
          timeoutMs: 50,
        },
      ),
    ).rejects.toThrow(/not observed after \d+ trigger\(s\) in 50 ms/);
  });

  it("propagates trigger failures", async () => {
    await expect(
      triggerUntil(
        () => Promise.reject(new Error("mine failed")),
        () => false,
      ),
    ).rejects.toThrow("mine failed");
  });
});
