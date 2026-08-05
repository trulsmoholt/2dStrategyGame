# ABSTRACT

A minimal 2D turn-based tactics game: 5v5 on a 16×16 grid, player versus a
greedy AI. TypeScript + Vite + Vitest, zero runtime dependencies. The sim is
pure and deterministic, so a whole game is reproducible from `(seed, log)`.

```bash
npm run dev     # play it
npm test        # full suite, including a 100-seed self-play determinism proof
```

## Where things are written down

The four documents are split by **kind**, not by topic or by version. Each
answers a different question, and nothing is described in two of them.

| File | Answers | Read it when |
| --- | --- | --- |
| [SPEC.md](SPEC.md) | *What are the rules, and why these?* | Before making a design decision, or when a rule surprises you |
| [ROADMAP.md](ROADMAP.md) | *What is planned but not built?* | Before starting new feature work |
| [CLAUDE.md](CLAUDE.md) | *What spans the layers?* | Commands, and architecture facts no single file shows |
| [src/render/CLAUDE.md](src/render/CLAUDE.md) | *What looks like a renderer bug but isn't?* | While editing `src/render/` |

The code answers everything else. Type declarations, function signatures and
algorithm steps live in the source and are deliberately **not** restated in
prose — restating them means editing the same fact twice, and the copy goes
stale the first time someone forgets.

## Where new documentation goes

Apply in order; the first match wins.

1. **Could someone re-derive this by reading the code?** Then don't write it
   down. Improve the code or its comments instead.
2. **Is it a decision, and would someone reasonably choose otherwise?**
   SPEC.md — with the rationale, and the alternative that was rejected. A
   decision without its "why" gets re-litigated.
3. **Is it not built yet?** ROADMAP.md. Never SPEC.md, however certain the
   plan feels: mixing "is" with "will be" is what makes a spec untrustworthy.
4. **Would it read as a bug to someone who didn't write it?** The CLAUDE.md
   nearest the code — the directory-scoped one if it's confined to a layer,
   the root one if it spans layers.

Version history is not documentation. `git log -p SPEC.md` is exact and never
drifts; a hand-maintained changelog inside a document is neither.
