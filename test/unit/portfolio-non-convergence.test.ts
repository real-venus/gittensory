import { describe, expect, it } from "vitest";
import {
  classifyPortfolioConvergence,
  type PortfolioConvergenceInput,
  type PortfolioConvergenceThresholds,
} from "../../packages/gittensory-engine/src/portfolio/non-convergence";

const THRESHOLDS: PortfolioConvergenceThresholds = { maxConsecutiveFailures: 3, maxReEnqueues: 3 };

function input(overrides: Partial<PortfolioConvergenceInput> = {}): PortfolioConvergenceInput {
  return { attempts: 1, consecutiveFailures: 0, reEnqueues: 0, reachedDone: false, ...overrides };
}

describe("classifyPortfolioConvergence", () => {
  it("reads converging for a not-yet-tried item (zero attempts is not evidence of a stuck loop)", () => {
    const v = classifyPortfolioConvergence(input({ attempts: 0, consecutiveFailures: 9, reEnqueues: 9 }), THRESHOLDS);
    expect(v.status).toBe("converging");
    expect(v.reasons[0]).toContain("first attempt is not evidence");
  });

  it("reads converging for an item making progress with no failure streak", () => {
    const v = classifyPortfolioConvergence(input({ attempts: 4, consecutiveFailures: 0, reEnqueues: 0 }), THRESHOLDS);
    expect(v.status).toBe("converging");
    expect(v.reasons[0]).toContain("4 attempt(s)");
  });

  it("reads stalled — not non_convergent — for a single failure below the threshold", () => {
    const v = classifyPortfolioConvergence(input({ attempts: 2, consecutiveFailures: 1 }), THRESHOLDS);
    expect(v.status).toBe("stalled");
    expect(v.reasons.join(" ")).toContain("below the threshold");
  });

  it("reads non_convergent for a consecutive-failure streak at the threshold (failure arm only)", () => {
    const v = classifyPortfolioConvergence(input({ attempts: 3, consecutiveFailures: 3, reEnqueues: 0 }), THRESHOLDS);
    expect(v.status).toBe("non_convergent");
    expect(v.reasons.join(" ")).toContain("at or past the threshold");
    expect(v.reasons.join(" ")).not.toContain("re-enqueued");
  });

  it("reads non_convergent for repeated re-enqueues without ever reaching done (re-enqueue arm only)", () => {
    const v = classifyPortfolioConvergence(input({ attempts: 5, consecutiveFailures: 0, reEnqueues: 4, reachedDone: false }), THRESHOLDS);
    expect(v.status).toBe("non_convergent");
    expect(v.reasons.join(" ")).toContain("without ever reaching done");
    expect(v.reasons.join(" ")).not.toContain("consecutive failure");
  });

  it("does NOT flag re-enqueues once the item has reached done (reachedDone suppresses the re-enqueue arm)", () => {
    const v = classifyPortfolioConvergence(input({ attempts: 5, consecutiveFailures: 0, reEnqueues: 9, reachedDone: true }), THRESHOLDS);
    expect(v.status).toBe("stalled");
    expect(v.reasons.join(" ")).toContain("re-enqueued 9 time(s) so far");
  });

  it("normalizes non-finite/negative counts and a degenerate zero threshold so no verdict is NaN", () => {
    const v = classifyPortfolioConvergence(
      { attempts: 6, consecutiveFailures: Number.NaN, reEnqueues: -4, reachedDone: false },
      { maxConsecutiveFailures: Number.NaN, maxReEnqueues: 0 },
    );
    // consecutiveFailures NaN→0, reEnqueues -4→0, thresholds floored to 1 ⇒ nothing exceeded, no non-progress signal.
    expect(v.status).toBe("converging");
    expect(v.reasons[0]).toContain("6 attempt(s)");
  });
});
