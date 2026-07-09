// App-vitest coverage for the engine subprocess-env helper (#4284). The engine also has its own node:test suite,
// but codecov/patch is computed from this app vitest run (vitest.config coverage includes
// packages/gittensory-engine/src/**), so the changed engine lines need a vitest test that imports the SRC directly.
import { describe, expect, it } from "vitest";
import {
  SUBPROCESS_CLI_ENV_ALLOWLIST,
  buildAllowlistedEnv,
  SECRET_PATTERNS,
  redactSecrets,
} from "../../packages/gittensory-engine/src/subprocess-env";

describe("engine subprocess-env helper (#4284)", () => {
  it("buildAllowlistedEnv copies only allowlisted keys; a caller allowlist is honored; extra overlays; undefined dropped", () => {
    const parent = { HOME: "/home/node", SECRET_TOKEN: "sk-should-not-copy", PATH: "/usr/bin", CUSTOM: "keep" };
    expect(buildAllowlistedEnv(parent, SUBPROCESS_CLI_ENV_ALLOWLIST)).toEqual({ HOME: "/home/node", PATH: "/usr/bin" });
    expect(buildAllowlistedEnv(parent, ["HOME", "CUSTOM"], { EXTRA: "v", HOME: "/override" })).toEqual({
      HOME: "/override",
      CUSTOM: "keep",
      EXTRA: "v",
    });
    expect(buildAllowlistedEnv({ A: undefined }, ["A"], { B: undefined })).toEqual({});
  });

  it("redactSecrets strips every SECRET_PATTERNS family + caller-supplied known secrets (length-guarded)", () => {
    expect(redactSecrets("key sk-abcdefghijklmnop123")).toBe("key [redacted]");
    expect(redactSecrets("tok ghp_ABCDEFGHIJKLMNOPQRSTUV")).toBe("tok [redacted]");
    expect(redactSecrets("pat github_pat_ABCDEFGHIJKLMNOPQRST")).toBe("pat [redacted]");
    expect(redactSecrets("jwt eyJhbGciOi.eyJzdWIiO.SflKxwRJSM")).toBe("jwt [redacted]");
    expect(redactSecrets("aws AKIAIOSFODNN7EXAMPLE")).toBe("aws [redacted]");
    expect(redactSecrets("value=supersecretvalue", ["supersecretvalue"])).toBe("value=[redacted]");
    expect(redactSecrets("t and t again", ["t"])).toBe("t and t again"); // short known secret NOT stripped
  });

  it("SECRET_PATTERNS carries the full ported regex family", () => {
    expect(SECRET_PATTERNS).toHaveLength(5);
  });
});
