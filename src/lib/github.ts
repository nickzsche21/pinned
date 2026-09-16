/**
 * Fetching workflows straight from the visitor's browser.
 *
 * GitHub's API and raw host both send `access-control-allow-origin: *`, so this
 * needs no server, no token and no secret. It also means each visitor spends
 * their own unauthenticated budget (60 requests an hour, per IP) rather than
 * sharing one — and nothing about what you audit reaches anyone else.
 */

import { auditWorkflow, summarise, type WorkflowReport, type Summary } from "./parse";

export interface Target { owner: string; repo: string }

/** Accepts `owner/repo`, a full GitHub URL, or a `git@` remote. */
export function parseTarget(input: string): Target | null {
  const s = input.trim().replace(/\s+/g, "");
  if (!s) return null;

  const url = /github\.com[/:]([^/]+)\/([^/#?]+)/i.exec(s);
  const pair = /^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/.exec(s);
  const m = url ?? pair;
  if (!m) return null;

  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, "");
  if (!owner || !repo || owner === "." || repo === ".") return null;
  return { owner, repo };
}

export interface RateInfo { remaining: number | null; limit: number | null; resetAt: Date | null }

function rateFrom(res: Response): RateInfo {
  const n = (k: string) => {
    const v = res.headers.get(k);
    return v === null ? null : Number(v);
  };
  const reset = n("x-ratelimit-reset");
  return {
    remaining: n("x-ratelimit-remaining"),
    limit: n("x-ratelimit-limit"),
    resetAt: reset ? new Date(reset * 1000) : null,
  };
}

export class AuditError extends Error {
  constructor(message: string, readonly kind: "not-found" | "rate-limited" | "no-workflows" | "network") {
    super(message);
  }
}

export interface AuditResult {
  target: Target;
  defaultBranch: string | null;
  reports: WorkflowReport[];
  summary: Summary;
  rate: RateInfo;
}

interface ContentEntry { name: string; type: string; download_url: string | null }

export async function auditRepo(
  target: Target,
  opts: { maxFiles?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<AuditResult> {
  const { owner, repo } = target;
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  let listRes: Response;
  try {
    listRes = await fetch(`${base}/contents/.github/workflows`, {
      headers: { accept: "application/vnd.github+json" },
    });
  } catch {
    throw new AuditError("Could not reach GitHub from this browser.", "network");
  }

  const rate = rateFrom(listRes);

  if (listRes.status === 403 && rate.remaining === 0) {
    const when = rate.resetAt ? rate.resetAt.toLocaleTimeString() : "shortly";
    throw new AuditError(
      `GitHub's unauthenticated limit is ${rate.limit ?? 60} requests an hour and this browser has used them all. It resets at ${when}.`,
      "rate-limited"
    );
  }
  if (listRes.status === 404) {
    throw new AuditError(
      `No .github/workflows in ${owner}/${repo} — either it has no GitHub Actions, or it is private. This reads only public repositories.`,
      "not-found"
    );
  }
  if (!listRes.ok) throw new AuditError(`GitHub returned ${listRes.status} for ${owner}/${repo}.`, "network");

  const entries = (await listRes.json()) as ContentEntry[];
  const files = (Array.isArray(entries) ? entries : [])
    .filter((e) => e.type === "file" && /\.ya?ml$/i.test(e.name) && e.download_url)
    .slice(0, opts.maxFiles ?? 25);

  if (!files.length) throw new AuditError(`${owner}/${repo} has a workflows folder but no YAML in it.`, "no-workflows");

  const reports: WorkflowReport[] = [];
  let done = 0;
  for (const f of files) {
    try {
      const r = await fetch(f.download_url!);
      if (r.ok) reports.push(auditWorkflow(f.name, await r.text()));
    } catch {
      // One unreadable file should not sink the audit; it simply is not reported.
    }
    opts.onProgress?.(++done, files.length);
  }

  let defaultBranch: string | null = null;
  try {
    const meta = await fetch(base, { headers: { accept: "application/vnd.github+json" } });
    if (meta.ok) defaultBranch = ((await meta.json()) as { default_branch?: string }).default_branch ?? null;
  } catch { /* cosmetic only */ }

  return { target, defaultBranch, reports, summary: summarise(reports), rate };
}

/** The exact replacement line, for copy-paste. */
export function fixLine(raw: string, sha: string): string {
  const at = raw.lastIndexOf("@");
  const path = at === -1 ? raw : raw.slice(0, at);
  const oldRef = at === -1 ? "" : raw.slice(at + 1);
  return `${path}@${sha}${oldRef ? ` # ${oldRef}` : ""}`;
}

/** Resolve a mutable ref to the commit it points at right now. */
export async function resolveSha(repo: string, ref: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
      headers: { accept: "application/vnd.github.sha" },
    });
    if (!r.ok) return null;
    const text = (await r.text()).trim();
    return /^[0-9a-f]{40}$/i.test(text) ? text : null;
  } catch {
    return null;
  }
}
