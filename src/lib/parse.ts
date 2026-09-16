/**
 * Reading a workflow for the one thing that decides whether your CI can be
 * hijacked: what its actions are pinned to.
 *
 * `uses: actions/checkout@v4` is a *mutable* reference. Whoever can move that
 * tag — the maintainer, or anyone who takes over their account — decides what
 * runs inside your pipeline, with your secrets, on your next build. A 40-hex
 * commit SHA cannot be moved.
 *
 * Deliberately a line scanner rather than a YAML parse: `uses:` is a leaf
 * scalar, the failure mode of a scanner here is loud (a line is either matched
 * or it is not), and it keeps the whole thing dependency-free so it can run in
 * the visitor's own browser against their own rate limit.
 */

export type RefKind = "sha" | "tag" | "branch" | "none";
export type UseKind = "action" | "reusable-workflow" | "local" | "docker";
export type Severity = "critical" | "high" | "medium" | "ok";

export interface Use {
  /** Raw value after `uses:`. */
  raw: string;
  /** 1-based line in the workflow file. */
  line: number;
  kind: UseKind;
  /** owner/repo for remote actions, else null. */
  repo: string | null;
  owner: string | null;
  ref: string | null;
  refKind: RefKind;
  /** True when the owner is GitHub's own (actions, github). */
  firstParty: boolean;
  severity: Severity;
  why: string;
}

export interface Finding {
  id: string;
  severity: Exclude<Severity, "ok">;
  title: string;
  detail: string;
  line?: number;
}

export interface WorkflowReport {
  file: string;
  uses: Use[];
  findings: Finding[];
  /** Triggers named under `on:`. */
  triggers: string[];
  hasTopLevelPermissions: boolean;
}

const SHA_RE = /^[0-9a-f]{40}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const BRANCHY = new Set(["main", "master", "develop", "dev", "trunk", "latest", "HEAD"]);
const FIRST_PARTY = new Set(["actions", "github"]);

/** Strip a trailing `# comment`, honouring quotes. */
function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return t;
}

export function classifyRef(ref: string | null): RefKind {
  if (!ref) return "none";
  if (SHA_RE.test(ref) || SHA256_RE.test(ref)) return "sha";
  if (BRANCHY.has(ref)) return "branch";
  return "tag";
}

export function classifyUse(raw: string, line: number): Use {
  const value = unquote(stripComment(raw));

  const base: Omit<Use, "severity" | "why"> = {
    raw: value, line, kind: "action", repo: null, owner: null, ref: null,
    refKind: "none", firstParty: false,
  };

  if (value.startsWith("./") || value.startsWith(".\\") || value === ".") {
    return { ...base, kind: "local", severity: "ok",
      why: "Local action from this same repository — it moves only when this repo moves." };
  }

  if (value.startsWith("docker://")) {
    const body = value.slice("docker://".length);
    const digest = body.includes("@sha256:");
    return {
      ...base, kind: "docker", ref: body.split(/[@:]/).pop() ?? null,
      refKind: digest ? "sha" : "tag",
      severity: digest ? "ok" : "high",
      why: digest
        ? "Pinned to an image digest, which cannot be repointed."
        : "Docker image referenced by tag. Tags are mutable; whoever can push the tag decides what runs.",
    };
  }

  const at = value.lastIndexOf("@");
  const path = at === -1 ? value : value.slice(0, at);
  const ref = at === -1 ? null : value.slice(at + 1);
  const seg = path.split("/");
  const owner = seg[0] ?? null;
  const repo = seg.length >= 2 ? `${seg[0]}/${seg[1]}` : null;
  const reusable = /\.ya?ml$/i.test(path);
  const firstParty = !!owner && FIRST_PARTY.has(owner.toLowerCase());
  const refKind = classifyRef(ref);

  const kind: UseKind = reusable ? "reusable-workflow" : "action";
  const common = { ...base, kind, repo, owner, ref, refKind, firstParty };

  if (refKind === "none") {
    return { ...common, severity: "critical",
      why: "No reference at all. GitHub resolves this to the default branch, so the code can change under you at any time." };
  }
  if (refKind === "sha") {
    return { ...common, severity: "ok",
      why: "Pinned to a commit SHA. This exact tree is what runs, and it cannot be repointed." };
  }
  if (refKind === "branch") {
    return { ...common, severity: "critical",
      why: `Tracks the “${ref}” branch, so every push by that maintainer lands in your pipeline immediately.` };
  }
  // A mutable tag.
  return {
    ...common,
    severity: firstParty ? "medium" : "high",
    why: firstParty
      ? `Tag “${ref}” is mutable. GitHub maintains this one, but a tag is still a pointer that can be moved.`
      : `Tag “${ref}” is mutable. Whoever controls ${repo ?? "this action"} can repoint it at any commit, and it runs with your secrets.`,
  };
}

/** Pull every `uses:` out of a workflow, with line numbers. */
export function extractUses(yaml: string): Use[] {
  const out: Use[] = [];
  yaml.split(/\r?\n/).forEach((raw, i) => {
    // `uses:` as a mapping key, optionally the first entry of a list item.
    const m = /^\s*(?:-\s+)?uses\s*:\s*(\S.*)$/.exec(raw);
    if (!m) return;
    const value = m[1].trim();
    if (!value || value.startsWith("#")) return;
    out.push(classifyUse(value, i + 1));
  });
  return out;
}

/** Trigger names under `on:`, for both the inline and block forms. */
export function extractTriggers(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const found = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const m = /^(on|"on"|'on')\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const inline = stripComment(m[2]).trim();

    if (inline && inline !== "") {
      if (inline.startsWith("[")) {
        inline.replace(/[[\]]/g, "").split(",").forEach((t) => t.trim() && found.add(unquote(t)));
      } else {
        found.add(unquote(inline));
      }
      if (inline) continue;
    }
    // Block form: indented keys, or a `- item` list, until indentation returns.
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || l.trim().startsWith("#")) continue;
      if (!/^\s/.test(l)) break;
      const item = /^\s+-\s+(\S+)/.exec(l);
      if (item) { found.add(unquote(stripComment(item[1]))); continue; }
      const key = /^\s{1,4}([A-Za-z_][\w-]*)\s*:/.exec(l);
      if (key) found.add(key[1]);
    }
  }
  return [...found];
}

export function hasTopLevelPermissions(yaml: string): boolean {
  return yaml.split(/\r?\n/).some((l) => /^permissions\s*:/.test(l));
}

/**
 * The checks worth making beyond pinning. `pull_request_target` runs with the
 * base repository's secrets; checking out the pull request's own head under it
 * is the classic way a fork's code gets to read them.
 */
export function auditWorkflow(file: string, yaml: string): WorkflowReport {
  const uses = extractUses(yaml);
  const triggers = extractTriggers(yaml);
  const perms = hasTopLevelPermissions(yaml);
  const findings: Finding[] = [];

  const risky = uses.filter((u) => u.severity !== "ok");
  const critical = risky.filter((u) => u.severity === "critical");
  const high = risky.filter((u) => u.severity === "high");

  if (critical.length) {
    findings.push({
      id: "unpinned-branch", severity: "critical",
      title: `${critical.length} action${critical.length === 1 ? "" : "s"} track a branch or nothing at all`,
      detail: "These pick up whatever the maintainer pushed most recently, on your next run.",
      line: critical[0].line,
    });
  }
  if (high.length) {
    findings.push({
      id: "unpinned-third-party", severity: "high",
      title: `${high.length} third-party action${high.length === 1 ? "" : "s"} pinned to a mutable tag`,
      detail: "A tag is a pointer. Moving it is a one-line operation for whoever owns the repository.",
      line: high[0].line,
    });
  }

  if (triggers.includes("pull_request_target")) {
    const checksOutPrHead = /ref\s*:\s*\$\{\{\s*github\.event\.pull_request\.head\.(sha|ref)/.test(yaml);
    findings.push({
      id: "pull-request-target", severity: checksOutPrHead ? "critical" : "medium",
      title: checksOutPrHead
        ? "pull_request_target checks out the pull request's own code"
        : "Uses pull_request_target",
      detail: checksOutPrHead
        ? "This runs a fork's code with the base repository's secrets. It is the single most exploited workflow misconfiguration there is."
        : "It runs with the base repository's secrets and write token. Safe only while it never executes code from the fork.",
    });
  }

  if (!perms) {
    findings.push({
      id: "no-permissions", severity: "medium",
      title: "No top-level permissions block",
      detail: "The job then gets whatever the repository default is, which on older repositories is read and write across the board. Setting `permissions: contents: read` costs one line.",
    });
  }

  return { file, uses, findings, triggers, hasTopLevelPermissions: perms };
}

export const WEIGHT: Record<Exclude<Severity, "ok">, number> = { critical: 10, high: 4, medium: 1 };

export type Grade = "clean" | "medium" | "high" | "critical";

export interface Summary {
  totalUses: number;
  /** Everything that is not a local action — i.e. code from somewhere else. */
  external: number;
  pinned: number;
  /** The headline: what share of borrowed code cannot move under you. */
  pinnedPct: number;
  critical: number;
  high: number;
  medium: number;
  /** Worst severity anywhere, including workflow-level findings. */
  grade: Grade;
}

/**
 * The headline number is the pinned share, not a weighted score.
 *
 * A severity-weighted composite is worse than useless here: a repository with
 * *nothing* pinned, all of it first-party tags, comes out at 90/100 and reads
 * like an A. "0 of 2 pinned" cannot be misread, and it is the number that maps
 * directly onto the fix.
 */
export function summarise(reports: WorkflowReport[]): Summary {
  const all = reports.flatMap((r) => r.uses);
  const external = all.filter((u) => u.kind !== "local");
  const pinned = external.filter((u) => u.severity === "ok").length;

  const critical = external.filter((u) => u.severity === "critical").length;
  const high = external.filter((u) => u.severity === "high").length;
  const medium = external.filter((u) => u.severity === "medium").length;

  const findingSeverities = reports.flatMap((r) => r.findings.map((f) => f.severity));
  const grade: Grade =
    critical || findingSeverities.includes("critical") ? "critical"
    : high || findingSeverities.includes("high") ? "high"
    : medium || findingSeverities.includes("medium") ? "medium"
    : "clean";

  return {
    totalUses: all.length,
    external: external.length,
    pinned,
    pinnedPct: external.length ? Math.round((pinned / external.length) * 100) : 100,
    critical, high, medium, grade,
  };
}
