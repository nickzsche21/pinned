import Audit from "@/components/Audit";
import TagDemo from "@/components/TagDemo";
import ThemeToggle from "@/components/ThemeToggle";

export default function Page() {
  return (
    <main>
      <div className="relative overflow-hidden px-5 pt-16 pb-10">
        <div className="paper pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-8 flex items-center justify-between">
            <span className="label text-muted">github actions · supply chain</span>
            <ThemeToggle />
          </div>
          <h1 className="text-[clamp(42px,8vw,80px)] font-semibold leading-[0.9] tracking-[-0.05em]">
            PINNED
          </h1>
          <p className="mt-5 max-w-[30ch] text-[clamp(21px,3.4vw,31px)] font-medium leading-[1.16] tracking-[-0.03em]">
            Is your CI running the code you chose?
          </p>

          <p className="mono mt-6 overflow-x-auto rounded-lg border border-edge bg-surface px-4 py-3 text-[12.5px] leading-[1.9]">
            <span className="text-muted">uses:</span> <span style={{ color: "var(--crit)" }}>actions/checkout@v4</span>          <span className="text-muted"># a pointer</span><br />
            <span className="text-muted">uses:</span> <span style={{ color: "var(--ok)" }}>actions/checkout@08c6903cb8…</span>  <span className="text-muted"># a commit</span>
          </p>

          <p className="mt-6 max-w-[64ch] text-[15.5px] leading-[1.68] text-muted">
            A tag is not a version. It is a name that points at a commit, and the person who owns the
            action can move it whenever they like — at which point different code runs inside your
            pipeline, on your next build, with whatever secrets that job can read. A commit SHA
            cannot be moved.
          </p>

          <div className="mt-8">
            <div className="label mb-2.5 text-muted">move the tag yourself</div>
            <TagDemo />
          </div>

          <div className="mt-10">
            <Audit />
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-3xl border-t border-edge px-5 py-14">
        <div className="mono mb-3 text-[11px] uppercase tracking-[0.18em] text-muted">why now</div>
        <h2 className="text-[26px] font-medium leading-[1.18] tracking-[-0.025em]">
          This is the week it stopped being theoretical.
        </h2>
        <div className="mt-5 space-y-4 text-[15px] leading-[1.7] text-muted">
          <p>
            Hacker News has spent the past several days on very little else: agents from a frontier lab
            found and used a caching vulnerability in <span className="text-fg">RubyGems</span>, and
            someone walked through getting{" "}
            <span className="text-fg">admin access to Baseten&rsquo;s production GitHub</span>. Both
            stories are the same shape — the code you did not write, running somewhere you trusted.
          </p>
          <p>
            A mutable action tag is the cheapest version of that attack, which is what the rail above
            is doing: no exploit, no CVE, just a pointer moved by the person who owns it.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl border-t border-edge px-5 py-14">
        <div className="mono mb-3 text-[11px] uppercase tracking-[0.18em] text-muted">how it reads</div>
        <h2 className="text-[26px] font-medium leading-[1.18] tracking-[-0.025em]">
          What counts as pinned, and what does not.
        </h2>
        <div className="mt-6 overflow-hidden rounded-xl border border-edge">
          {[
            ["ok", "owner/action@08c6903cb8…", "A 40-character commit SHA. This exact tree runs, and it cannot be repointed."],
            ["medium", "actions/checkout@v4", "A tag owned by GitHub. Still a movable pointer, but GitHub is the one holding it."],
            ["high", "some-vendor/deploy@v1", "A tag owned by someone else. Moving it is a one-line operation for them."],
            ["critical", "some-vendor/deploy@main", "A branch. Every push they make lands in your pipeline on your next run."],
            ["critical", "some-vendor/deploy", "No reference at all — GitHub resolves this to their default branch."],
            ["ok", "./.github/actions/thing", "Local to your repository. It moves only when you move it."],
          ].map(([sev, code, why], i) => (
            <div key={code} className={`flex flex-col gap-1.5 bg-card px-5 py-4 sm:flex-row sm:items-baseline sm:gap-5 ${i ? "border-t border-edge" : ""}`}>
              <span className="mono shrink-0 text-[10px] uppercase tracking-[0.14em] sm:w-[70px]"
                style={{ color: `var(--color-${sev === "ok" ? "ok" : sev === "medium" ? "med" : sev === "high" ? "high" : "crit"})` }}>
                {sev === "ok" ? "pinned" : sev}
              </span>
              <code className="mono shrink-0 text-[12.5px] text-fg sm:w-[218px]">{code}</code>
              <span className="text-[13px] leading-[1.6] text-muted">{why}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-[72ch] text-[13.5px] leading-[1.7] text-muted">
          It also flags two things that have nothing to do with pinning but everything to do with the
          same risk: a <span className="mono text-muted">pull_request_target</span> workflow that checks
          out the pull request&rsquo;s own code — which runs a stranger&rsquo;s branch with your
          secrets — and a missing top-level <span className="mono text-muted">permissions</span> block,
          which on older repositories leaves the token with write access to everything.
        </p>
      </section>

      <footer className="mx-auto max-w-3xl border-t border-edge px-5 py-8">
        <div className="mono flex flex-col gap-2 text-[11.5px] text-muted sm:flex-row sm:justify-between">
          <span>PINNED · MIT · no server, no token, no account</span>
          <span>reads public repositories from your own browser</span>
        </div>
      </footer>
    </main>
  );
}
