# PINNED

**Is your CI running the code you chose?**

```yaml
uses: actions/checkout@v4            # a pointer
uses: actions/checkout@08c6903cb8…   # a commit
```

A tag is not a version. It is a name that points at a commit, and whoever owns the action can move
it whenever they like — at which point different code runs inside your pipeline, on your next
build, with whatever secrets that job can read. A commit SHA cannot be moved.

Point PINNED at any public repo. It reads every workflow, tells you what share of borrowed code is
actually pinned, and hands you the exact replacement line.

**Live: https://pinned-swart.vercel.app**

---

## Why now

Hacker News spent this week on very little else: agents from a frontier lab found and used a
caching vulnerability in **RubyGems** (457 points), and someone walked through getting **admin
access to Baseten's production GitHub** (304 points, 16 Sep). Same shape both times — code you did
not write, running somewhere you trusted.

A mutable action tag is the cheapest version of that attack. There is no exploit to develop.
Whoever owns the repository force-pushes a tag and waits for everyone else's CI to pull it.

## What counts as pinned

| | reference | verdict |
|---|---|---|
| **pinned** | `owner/action@08c6903cb8…` | A 40-char commit SHA. This exact tree runs and cannot be repointed. |
| **medium** | `actions/checkout@v4` | A tag owned by GitHub. Still a movable pointer, but GitHub holds it. |
| **high** | `some-vendor/deploy@v1` | A tag owned by someone else. Moving it is a one-line operation for them. |
| **critical** | `some-vendor/deploy@main` | A branch. Every push they make lands in your pipeline on your next run. |
| **critical** | `some-vendor/deploy` | No reference at all — GitHub resolves this to their default branch. |
| **pinned** | `./.github/actions/thing` | Local to your repo. It moves only when you move it. |

It also flags two things that are not about pinning but carry the same risk: a
`pull_request_target` workflow that checks out the pull request's own code — a stranger's branch
running with your secrets, the single most exploited workflow misconfiguration there is — and a
missing top-level `permissions` block, which on older repositories leaves the token with write
access to everything.

## No server, no token, no account

GitHub's API and raw host both send `access-control-allow-origin: *`, so the whole audit runs in
your browser. Nothing about what you scan reaches anyone else, and each visitor spends their own
unauthenticated budget (60 requests an hour) rather than sharing one. The remaining count is shown
after every run.

## On the numbers

The headline is **the pinned share, not a score**. An earlier version used a severity-weighted
composite and it rated a repository with *nothing* pinned at 90/100, because all of its actions
were first-party tags. "0 of 2 pinned" cannot be misread, and it maps directly onto the fix. There
is a regression test for exactly that case.

Parsing is a line scanner rather than a YAML parse: `uses:` is a leaf scalar, a scanner's failure
mode is loud, and it keeps the tool dependency-free so it can run client-side. It handles quoting,
inline comments, `#` inside quotes, commented-out steps, reusable workflows, `docker://` refs and
local actions — all covered by tests.

```bash
npm install
npm test      # 59 assertions
npm run dev
```

Validated against real repositories: `vercel/next.js` 70/70 pinned, `expressjs/express` 23/23,
`axios/axios` 55/55, `sindresorhus/got` 0/2.

MIT.
