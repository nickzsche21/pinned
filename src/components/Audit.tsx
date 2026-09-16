"use client";

import { useCallback, useState } from "react";
import { parseTarget, auditRepo, AuditError, fixLine, resolveSha, type AuditResult } from "@/lib/github";
import type { Severity, Use } from "@/lib/parse";

const TONE: Record<Severity, { color: string; label: string }> = {
  critical: { color: "var(--color-crit)", label: "critical" },
  high: { color: "var(--color-high)", label: "high" },
  medium: { color: "var(--color-med)", label: "medium" },
  ok: { color: "var(--color-ok)", label: "pinned" },
};

const EXAMPLES = ["vercel/next.js", "sindresorhus/got", "expressjs/express"];

export default function Audit() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const run = useCallback(async (raw: string) => {
    const target = parseTarget(raw);
    if (!target) { setErr("That does not look like a repository. Try owner/repo, or paste a GitHub URL."); return; }
    setBusy(true); setErr(null); setResult(null); setFixes({}); setProgress(null);
    try {
      const r = await auditRepo(target, { onProgress: (d, t) => setProgress([d, t]) });
      setResult(r);
    } catch (e) {
      setErr(e instanceof AuditError ? e.message : "Something went wrong reading that repository.");
    } finally {
      setBusy(false); setProgress(null);
    }
  }, []);

  async function pinIt(u: Use) {
    if (!u.repo || !u.ref) return;
    const key = `${u.repo}@${u.ref}`;
    if (fixes[key]) return;
    const sha = await resolveSha(u.repo, u.ref);
    setFixes((f) => ({ ...f, [key]: sha ?? "" }));
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard unavailable */ }
  }

  const s = result?.summary;
  const risky = result?.reports.flatMap((r) => r.uses.filter((u) => u.severity !== "ok").map((u) => ({ ...u, file: r.file }))) ?? [];

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void run(input); }} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="owner/repo  ·  or paste a GitHub URL"
          spellCheck={false}
          className="mono min-w-0 flex-1 rounded-lg border border-line bg-panel px-4 py-3 text-[14px] text-ink outline-none placeholder:text-faint focus:border-accent/60"
        />
        <button type="submit" disabled={busy}
          className="mono shrink-0 rounded-lg border border-accent/45 bg-accent/10 px-5 py-3 text-[13px] text-accent transition-colors hover:bg-accent/15 disabled:opacity-40">
          {busy ? (progress ? `reading ${progress[0]}/${progress[1]}…` : "fetching…") : "check it"}
        </button>
      </form>

      <div className="mono mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
        <span>try</span>
        {EXAMPLES.map((e) => (
          <button key={e} onClick={() => { setInput(e); void run(e); }}
            className="underline decoration-line underline-offset-4 hover:text-accent">{e}</button>
        ))}
      </div>

      {err && (
        <div className="mt-5 rounded-lg border px-4 py-3 text-[13.5px] leading-relaxed"
          style={{ borderColor: "color-mix(in srgb, var(--color-crit) 35%, transparent)", background: "color-mix(in srgb, var(--color-crit) 6%, transparent)", color: "var(--color-ink)" }}>
          {err}
        </div>
      )}

      {result && s && (
        <div className="mt-8">
          {/* Headline */}
          <div className="rounded-xl border border-line bg-panel p-6">
            <div className="mono mb-3 text-[11px] uppercase tracking-[0.16em] text-faint">
              {result.target.owner}/{result.target.repo}
              {result.defaultBranch && <span className="text-line"> · {result.defaultBranch}</span>}
            </div>

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="mono text-[54px] font-semibold leading-none tracking-[-0.03em]"
                style={{ color: s.pinnedPct === 100 ? "var(--color-ok)" : s.pinnedPct >= 50 ? "var(--color-med)" : "var(--color-crit)" }}>
                {s.pinned}<span className="text-dim">/{s.external}</span>
              </span>
              <span className="text-[18px] leading-snug text-ink">
                borrowed actions are pinned to a commit
              </span>
            </div>

            <p className="mt-3 max-w-[70ch] text-[14px] leading-[1.65] text-dim">
              {s.external === 0 ? (
                <>This repository&rsquo;s workflows only use actions from inside the repository itself, so there is nothing external to pin.</>
              ) : s.pinnedPct === 100 ? (
                <>Every action is pinned to a commit SHA. Nobody can change what runs here by moving a tag.</>
              ) : (
                <>
                  <span className="mono text-ink">{s.external - s.pinned}</span> of them follow a tag or a
                  branch. Those are pointers, not versions — whoever owns the action decides what runs on
                  your next build, with whatever secrets that job can see.
                </>
              )}
            </p>

            <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
              {([
                ["pinned", s.pinned, "var(--color-ok)"],
                ["critical", s.critical, "var(--color-crit)"],
                ["high", s.high, "var(--color-high)"],
                ["medium", s.medium, "var(--color-med)"],
              ] as const).map(([k, v, c]) => (
                <div key={k} className="bg-panel px-4 py-3">
                  <div className="mono text-[22px] font-semibold leading-none" style={{ color: v ? c : "var(--color-faint)" }}>{v}</div>
                  <div className="mono mt-1.5 text-[10px] uppercase tracking-[0.14em] text-faint">{k}</div>
                </div>
              ))}
            </div>

            <p className="mono mt-3 text-[11px] text-faint">
              {result.reports.length} workflow{result.reports.length === 1 ? "" : "s"} read in your browser ·
              {" "}{result.rate.remaining ?? "?"}/{result.rate.limit ?? 60} GitHub requests left this hour
            </p>
          </div>

          {/* What to fix */}
          {risky.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-3 text-[17px] font-medium tracking-[-0.015em]">What to change</h3>
              <div className="overflow-hidden rounded-xl border border-line">
                {risky.map((u, i) => {
                  const key = `${u.repo}@${u.ref}`;
                  const sha = fixes[key];
                  return (
                    <div key={`${u.file}-${u.line}-${i}`} className={`bg-panel px-5 py-4 ${i ? "border-t border-line" : ""}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="mono rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                          style={{ color: TONE[u.severity].color, background: `color-mix(in srgb, ${TONE[u.severity].color} 12%, transparent)` }}>
                          {TONE[u.severity].label}
                        </span>
                        <code className="mono text-[13px] text-ink">{u.raw}</code>
                        <span className="mono text-[11px] text-faint">{u.file}:{u.line}</span>
                      </div>
                      <p className="mt-2 max-w-[78ch] text-[13px] leading-[1.6] text-dim">{u.why}</p>

                      {u.repo && u.ref && (
                        <div className="mt-3">
                          {sha === undefined ? (
                            <button onClick={() => void pinIt(u)}
                              className="mono rounded-md border border-line bg-raise px-3 py-1.5 text-[11.5px] text-dim hover:border-accent/45 hover:text-accent">
                              show me the pinned line
                            </button>
                          ) : sha === "" ? (
                            <span className="mono text-[11.5px] text-faint">could not resolve that ref just now</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-line bg-raise px-3 py-2 text-[12px]"
                                style={{ color: "var(--color-ok)" }}>
                                uses: {fixLine(u.raw, sha)}
                              </code>
                              <button onClick={() => void copy(`uses: ${fixLine(u.raw, sha)}`, key)}
                                className="mono shrink-0 rounded-md border border-line bg-raise px-3 py-2 text-[11.5px] text-faint hover:text-ink">
                                {copied === key ? "copied" : "copy"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Workflow-level findings */}
          {result.reports.some((r) => r.findings.some((f) => f.id === "pull-request-target" || f.id === "no-permissions")) && (
            <div className="mt-5">
              <h3 className="mb-3 text-[17px] font-medium tracking-[-0.015em]">Beyond pinning</h3>
              <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
                {result.reports.flatMap((r) =>
                  r.findings.filter((f) => f.id === "pull-request-target" || f.id === "no-permissions")
                    .map((f) => (
                      <div key={`${r.file}-${f.id}`} className="bg-panel px-5 py-4">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="mono rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                            style={{ color: TONE[f.severity].color, background: `color-mix(in srgb, ${TONE[f.severity].color} 12%, transparent)` }}>
                            {f.severity}
                          </span>
                          <span className="text-[14px] text-ink">{f.title}</span>
                          <span className="mono text-[11px] text-faint">{r.file}</span>
                        </div>
                        <p className="mt-2 max-w-[78ch] text-[13px] leading-[1.6] text-dim">{f.detail}</p>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
