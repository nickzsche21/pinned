import {
  classifyUse, classifyRef, extractUses, extractTriggers, hasTopLevelPermissions,
  auditWorkflow, summarise,
} from "./parse";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "  ok  " : " FAIL "} ${label}${cond || !detail ? "" : `\n         ${detail}`}`);
};
const u = (raw: string) => classifyUse(raw, 1);

console.log("\nReference classification");
ok("40-hex is a pinned SHA", classifyRef("de0fac2e4500dabe0009e67214ff5f5447ce83dd") === "sha");
ok("uppercase hex still a SHA", classifyRef("DE0FAC2E4500DABE0009E67214FF5F5447CE83DD") === "sha");
ok("64-hex (sha256) counts as pinned", classifyRef("a".repeat(64)) === "sha");
ok("v4 is a tag", classifyRef("v4") === "tag");
ok("v6.4.0 is a tag", classifyRef("v6.4.0") === "tag");
ok("main is a branch", classifyRef("main") === "branch");
ok("master is a branch", classifyRef("master") === "branch");
ok("a 39-char hex is NOT a SHA", classifyRef("a".repeat(39)) === "tag");
ok("a 41-char hex is NOT a SHA", classifyRef("a".repeat(41)) === "tag");
ok("hex-looking but with g is not a SHA", classifyRef("g".repeat(40)) === "tag");

console.log("\nThe headline case");
{
  const bad = u("actions/checkout@v4");
  const good = u("actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd");
  ok("actions/checkout@v4 is flagged", bad.severity !== "ok", bad.severity);
  ok("...and explains why in words", bad.why.includes("mutable"), bad.why);
  ok("the SHA-pinned form passes", good.severity === "ok");
  ok("owner and repo are parsed", good.owner === "actions" && good.repo === "actions/checkout");
}

console.log("\nSeverity reflects who can move the pointer");
ok("third-party mutable tag is high", u("some-vendor/deploy@v1").severity === "high");
ok("GitHub-owned mutable tag is medium, not high", u("actions/setup-node@v4").severity === "medium");
ok("github org also counts as first-party", u("github/codeql-action@v3").firstParty === true);
ok("branch tracking is critical", u("some-vendor/deploy@main").severity === "critical");
ok("no ref at all is critical", u("some-vendor/deploy").severity === "critical");
ok("...and says the default branch is what runs", u("some-vendor/deploy").why.includes("default branch"));

console.log("\nThings that are not a risk");
ok("local action is ok", u("./.github/actions/setup-rust").severity === "ok");
ok("local action is marked local", u("./.github/actions/setup-rust").kind === "local");
ok("bare dot is local", u(".").kind === "local");
ok("docker digest is ok", u("docker://alpine@sha256:" + "a".repeat(64)).severity === "ok");
ok("docker tag is high", u("docker://alpine:3.19").severity === "high");

console.log("\nReusable workflows follow the same rules");
{
  const r = u("owner/repo/.github/workflows/build.yml@v1");
  ok("recognised as a reusable workflow", r.kind === "reusable-workflow");
  ok("repo parsed past the path", r.repo === "owner/repo", String(r.repo));
  ok("mutable tag still flagged", r.severity === "high");
  const p = u("owner/repo/.github/workflows/build.yml@" + "b".repeat(40));
  ok("SHA-pinned reusable workflow passes", p.severity === "ok");
}

console.log("\nYAML surface: quotes and comments");
ok("double-quoted value", u('"actions/checkout@v4"').repo === "actions/checkout");
ok("single-quoted value", u("'actions/checkout@v4'").repo === "actions/checkout");
ok("trailing comment stripped", u("actions/checkout@" + "c".repeat(40) + " # v6.0.2").severity === "ok");
ok("a # inside quotes is not a comment", u('"weird/repo@v1#x"').ref === "v1#x", u('"weird/repo@v1#x"').ref ?? "");

console.log("\nExtraction from a real-shaped workflow");
{
  const yaml = [
    "name: build",
    "on:",
    "  push:",
    "    branches: [main]",
    "  pull_request_target:",
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ github.event.pull_request.head.sha }}",
    "      - name: node",
    "        uses: actions/setup-node@" + "d".repeat(40),
    "      # - uses: commented/out@v1",
    "      - uses: ./.github/actions/local",
    "      - uses: evil/thing@main",
  ].join("\n");

  const uses = extractUses(yaml);
  ok("finds every real uses: line", uses.length === 4, `found ${uses.length}: ${uses.map(x => x.raw).join(", ")}`);
  ok("ignores a commented-out uses:", !uses.some((x) => x.raw.includes("commented/out")));
  ok("line numbers are 1-based and correct", uses[0].line === 9, String(uses[0].line));

  const triggers = extractTriggers(yaml);
  ok("block-form triggers are found", triggers.includes("push") && triggers.includes("pull_request_target"),
     JSON.stringify(triggers));

  const rep = auditWorkflow("build.yml", yaml);
  const prt = rep.findings.find((f) => f.id === "pull-request-target");
  ok("pull_request_target is caught", !!prt);
  ok("...and escalated to critical because it checks out the PR head", prt?.severity === "critical");
  ok("missing permissions is flagged", rep.findings.some((f) => f.id === "no-permissions"));
  ok("branch-tracking action is flagged critical", rep.findings.some((f) => f.id === "unpinned-branch"));
}

console.log("\nTrigger forms");
ok("inline scalar", extractTriggers("on: push").includes("push"));
ok("inline array", extractTriggers("on: [push, pull_request]").includes("pull_request"));
ok("quoted on: key", extractTriggers('"on":\n  push:\n').includes("push"));
ok("permissions detected", hasTopLevelPermissions("permissions:\n  contents: read"));
ok("indented permissions is NOT top level", !hasTopLevelPermissions("jobs:\n  a:\n    permissions:\n      contents: read"));

console.log("\nScoring");
{
  const clean = auditWorkflow("a.yml", "permissions:\n  contents: read\non: push\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@" + "e".repeat(40));
  const dirty = auditWorkflow("b.yml", "on: push\njobs:\n  a:\n    steps:\n      - uses: evil/x@main\n      - uses: evil/y@main");
  ok("a fully pinned workflow is 100% pinned", summarise([clean]).pinnedPct === 100);
  ok("a branch-tracking workflow is 0% pinned", summarise([dirty]).pinnedPct === 0);
  ok("clean workflow grades clean", summarise([clean]).grade === "clean", summarise([clean]).grade);
  ok("branch tracking grades critical", summarise([dirty]).grade === "critical");

  // The bug this replaced: a severity-weighted score called 0-of-2-pinned a 90.
  const allFirstPartyTags = auditWorkflow("d.yml",
    "permissions:\n  contents: read\non: push\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4");
  const fp = summarise([allFirstPartyTags]);
  ok("nothing pinned reads as 0%, never as a passing score", fp.pinnedPct === 0, `${fp.pinnedPct}%`);
  ok("...and still grades medium rather than clean", fp.grade === "medium", fp.grade);

  const s = summarise([clean, dirty]);
  ok("counts externals, not locals", s.external === 3, String(s.external));
  ok("counts what is pinned", s.pinned === 1, String(s.pinned));
  ok("counts criticals", s.critical === 2, String(s.critical));
  console.log(`         → mixed set: ${s.pinned}/${s.external} pinned (${s.pinnedPct}%), grade ${s.grade}`);
}

console.log("\nGuards");
ok("empty file yields nothing rather than throwing", extractUses("").length === 0);
ok("no workflows is 100% rather than 0%", summarise([]).pinnedPct === 100);
ok("only-local actions counts as fully pinned",
   summarise([auditWorkflow("c.yml", "permissions:\n  contents: read\non: push\njobs:\n  a:\n    steps:\n      - uses: ./x")]).pinnedPct === 100);
ok("summarise of nothing is all zeroes", summarise([]).external === 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
