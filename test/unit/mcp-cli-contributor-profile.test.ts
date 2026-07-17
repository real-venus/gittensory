// #6737: the CLI mirror for loopover_get_contributor_profile. The MCP tool and GET /v1/contributors/:login/profile
// already served this; only the local CLI surface was missing. These pin the three things that can silently rot:
// both surfaces hit the same route, `contributor-profile --json` stays byte-identical to the API payload, and the
// login resolves via --login / LOOPOVER_LOGIN / GITHUB_LOGIN exactly like decision-pack.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Any CLI command that calls the API must go through runAsync: the fixture server lives in this process, so
// run()'s execFileSync would block the event loop and the child's fetch would abort before a response.
import { closeFixtureServer, contributorProfileFixture, run, runAsync, runExpectingFailure, startFixtureServer } from "./support/mcp-cli-harness";

let apiUrl: string;
let capturedRequests: Array<{ url: string; method: string }>;

beforeEach(async () => {
  capturedRequests = [];
  apiUrl = await startFixtureServer({
    onApiRequest: (request) => {
      if (request.url && request.url.includes("/profile")) {
        capturedRequests.push({ url: request.url ?? "", method: request.method ?? "GET" });
      }
    },
  });
});
afterEach(closeFixtureServer);

describe("loopover-mcp contributor-profile CLI (#6737)", () => {
  it("--json emits exactly the payload GET /v1/contributors/:login/profile returns (mirror parity)", async () => {
    const out = await runAsync(["contributor-profile", "--login", "JSONbored", "--json"], { LOOPOVER_API_URL: apiUrl, LOOPOVER_TOKEN: "session-token" });
    expect(JSON.parse(out)).toEqual(contributorProfileFixture());
    expect(capturedRequests.length).toBe(1);
    expect(capturedRequests[0]!.url).toContain("/v1/contributors/JSONbored/profile");
    expect(capturedRequests[0]!.method).toBe("GET");
  });

  it("prints the login header and the API summary on the plain-text path", async () => {
    const out = await runAsync(["contributor-profile", "--login", "JSONbored"], { LOOPOVER_API_URL: apiUrl, LOOPOVER_TOKEN: "session-token" });
    expect(out).toContain("Contributor profile: JSONbored");
    expect(out).toContain(contributorProfileFixture().summary);
  });

  it("resolves the login from LOOPOVER_LOGIN, then GITHUB_LOGIN, the way decision-pack does", async () => {
    const viaLoopover = await runAsync(["contributor-profile", "--json"], { LOOPOVER_API_URL: apiUrl, LOOPOVER_TOKEN: "session-token", LOOPOVER_LOGIN: "JSONbored" });
    expect(JSON.parse(viaLoopover)).toEqual(contributorProfileFixture());
    const viaGithub = await runAsync(["contributor-profile", "--json"], { LOOPOVER_API_URL: apiUrl, LOOPOVER_TOKEN: "session-token", GITHUB_LOGIN: "JSONbored" });
    expect(JSON.parse(viaGithub)).toEqual(contributorProfileFixture());
  });

  it("fails with the shared login-required message when no login is resolvable", () => {
    const failure = runExpectingFailure(["contributor-profile"], { LOOPOVER_API_URL: apiUrl, LOOPOVER_TOKEN: "session-token", LOOPOVER_LOGIN: "", GITHUB_LOGIN: "" });
    expect(failure.status).toBe(1);
    expect(`${failure.stdout}${failure.stderr}`).toMatch(/Pass --login <github-login> or set LOOPOVER_LOGIN\./);
  });

  it("prints help before requiring a login or hitting the network", () => {
    const out = run(["contributor-profile", "--help"], { LOOPOVER_API_URL: apiUrl });
    expect(out).toContain("Usage: loopover-mcp contributor-profile");
    expect(capturedRequests.length).toBe(0);
  });
});
