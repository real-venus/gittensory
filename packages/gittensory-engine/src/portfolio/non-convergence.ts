// Portfolio non-convergence DETECTOR (pure signal, no enforcement).
// Deterministic classifier over one local portfolio-queue item's attempt/outcome history. A miner's queue item
// (portfolio-queue.js, status queued → in_progress → done) can be re-enqueued in place — an item that keeps
// cycling queued → in_progress → queued without ever reaching done, or that fails repeatedly without improving,
// is "not converging" and worth flagging so a later stage can stop spending budget on it. This module computes
// a verdict from typed counts ONLY: no IO, no clock read, no randomness, and it does not enforce, gate, or block
// any action by itself. It mirrors classifyContributorFit's pure-classifier-over-typed-input shape (including
// its "absence of history is not evidence of a problem" rule) and rate-limit.ts's numbers-only discipline. Its
// output is one input signal for the fail-closed Governor chokepoint that composes it later — that composition
// (rate-limit + budget caps + this detector) is separate, maintainer-owned work (#2340), not this module.

// Normalize any numeric input to a finite, non-negative integer (a non-finite or negative value becomes 0), so
// no count or threshold can make the verdict NaN or negative. Matches rate-limit.ts's finiteNonNegativeInt.
function finiteNonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** One queue item's attempt/outcome history so far. Caller-supplied — the table has no attempt-history columns
 *  today, so this detector never fetches or persists; it classifies counts the caller already tracks. */
export type PortfolioConvergenceInput = {
  /** Total attempts made on this item. Zero means not yet tried. */
  attempts: number;
  /** Consecutive failures since the last improvement (reset to 0 whenever progress is made). */
  consecutiveFailures: number;
  /** Times the item has been re-enqueued (queued → in_progress → queued) in place. */
  reEnqueues: number;
  /** Whether the item has ever reached the terminal `done` status. */
  reachedDone: boolean;
};

/** The streak thresholds past which an item reads non-convergent. Each is floored to a minimum of 1 so a
 *  degenerate 0 threshold can never flag a clean item. */
export type PortfolioConvergenceThresholds = {
  /** A consecutive-failure streak at or past this count reads non-convergent. */
  maxConsecutiveFailures: number;
  /** Re-enqueues at or past this count WITHOUT ever reaching done read non-convergent. */
  maxReEnqueues: number;
};

export type PortfolioConvergenceStatus = "converging" | "stalled" | "non_convergent";

/** A structured verdict: the status plus human-readable reasons, matching classifyContributorFit's shape. */
export type PortfolioConvergenceVerdict = {
  status: PortfolioConvergenceStatus;
  reasons: string[];
};

/**
 * Classify whether a queue item's attempt history shows convergence. Pure and deterministic: same input →
 * same verdict, with no IO, clock, or randomness. An item with zero attempts reads `converging` (a first
 * attempt is not evidence of a stuck loop). Otherwise a sustained streak — consecutive failures at/past the
 * threshold, OR re-enqueues at/past the threshold without ever reaching done — reads `non_convergent`; any
 * lesser sign of non-progress (a failure or a re-enqueue below threshold) reads `stalled`; a clean item making
 * progress reads `converging`. Every count and threshold is normalized first, so no input can yield a NaN or
 * negative verdict.
 */
export function classifyPortfolioConvergence(
  input: PortfolioConvergenceInput,
  thresholds: PortfolioConvergenceThresholds,
): PortfolioConvergenceVerdict {
  const attempts = finiteNonNegativeInt(input.attempts);
  const consecutiveFailures = finiteNonNegativeInt(input.consecutiveFailures);
  const reEnqueues = finiteNonNegativeInt(input.reEnqueues);
  const maxConsecutiveFailures = Math.max(1, finiteNonNegativeInt(thresholds.maxConsecutiveFailures));
  const maxReEnqueues = Math.max(1, finiteNonNegativeInt(thresholds.maxReEnqueues));

  if (attempts === 0) {
    return { status: "converging", reasons: ["No attempts yet; a first attempt is not evidence of a stuck loop."] };
  }

  const failureStreakExceeded = consecutiveFailures >= maxConsecutiveFailures;
  const reEnqueueExceeded = !input.reachedDone && reEnqueues >= maxReEnqueues;
  if (failureStreakExceeded || reEnqueueExceeded) {
    const reasons: string[] = [];
    if (failureStreakExceeded) {
      reasons.push(`${consecutiveFailures} consecutive failure(s), at or past the threshold of ${maxConsecutiveFailures}`);
    }
    if (reEnqueueExceeded) {
      reasons.push(`re-enqueued ${reEnqueues} time(s) without ever reaching done`);
    }
    return { status: "non_convergent", reasons };
  }

  if (consecutiveFailures > 0 || reEnqueues > 0) {
    const reasons: string[] = [];
    if (consecutiveFailures > 0) {
      reasons.push(`${consecutiveFailures} consecutive failure(s), below the threshold of ${maxConsecutiveFailures}`);
    }
    if (reEnqueues > 0) reasons.push(`re-enqueued ${reEnqueues} time(s) so far`);
    return { status: "stalled", reasons };
  }

  return { status: "converging", reasons: [`${attempts} attempt(s) with no failure streak`] };
}
