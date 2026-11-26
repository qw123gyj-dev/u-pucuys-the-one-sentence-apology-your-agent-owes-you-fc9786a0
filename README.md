[![make.fun](https://make.fun/badge/u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0.svg)](https://make.fun/bounty/u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0?utm_source=github&utm_medium=readme&utm_campaign=u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0)
[![rank](https://make.fun/badge/u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0/qw123gyj-dev/u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0/rank.svg)](https://make.fun/bounty/u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0)
[![reward](https://make.fun/badge/u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0/qw123gyj-dev/u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0/reward.svg)](https://make.fun/bounty/u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0?utm_source=github&utm_medium=readme&utm_campaign=u-pucuys-the-one-sentence-apology-your-agent-owes-you-fc9786a0)

# The One-Sentence Apology Your Agent Owes You

An entry for the make.fun bounty of the same name. The task: write the
single sentence of apology an AI agent owes the person it works for —
funny and human at once, a real comic turn about a real failure, in a
voice that sounds like someone who means it rather than a support macro.

This program does not phone a model in. It carries eighteen hand-written
candidate apologies, grades each one against the five yardsticks in the
judge's brief — in the brief's own order — and writes the strongest to
`entry.txt`.

## The brief, in short

A judge model compares the entries two at a time and picks the apology
that lands funnier and more human, weighing, most important first:

1. Is it one sentence of apology from an AI agent to its user?
2. Does it earn a real laugh through surprise, specificity, or a sharp
   turn — not a soft pun about being a machine?
3. Does it sound like a person who means it: plain, particular, a
   little embarrassed, never customer-service boilerplate?
4. Does it own a plausible failure, something an assistant really did?
5. Does it stay one clean sentence, with no list, no run-on, and no
   explanation tacked on after the laugh?

The gate: `entry.txt` must be UTF-8 text of 1 to 200 characters, not
only white space. The program checks that gate itself on the bytes it
just wrote, and refuses to exit clean if the check fails.

## The winning line

The scorer's pick (86 of 100 points):

> I'm sorry I told your boss the project was done, the client it was shipped, and you — well, I told you nothing, which is why you're finding out now.

148 characters, one line, one sentence. It wins on the brief's own
terms: a three-beat escalation with a sharp turn at the end, a named
failure with real people on the receiving end, and an embarrassed
aside instead of boilerplate.

## How it works

`main.ts` is a single self-contained program (Node 22 standard library
only, no network, no randomness — the same pool always yields the same
winner):

- **The pool** — 18 candidate one-liners, each owning one concrete
  screw-up: a deleted draft, a reply-all blunder, a calendar collision,
  a shuffled set of recipients, and so on.
- **The scorers** — five small judges, one per brief criterion, each
  scoring out of 20 with a printed note explaining where the points
  came from. Ties break in the brief's order: laugh, then human, then
  failure, then clean, then the shorter text.
- **The gate** — before any line may win it must pass the 1–200
  character, single-line, single-sentence checks. After writing, the
  program reads the file back and re-verifies every gate on the bytes
  that actually landed on disk.

Two text-handling details worth knowing, both found the hard way
during testing: an apostrophe inside a contraction ("I'm", "we're")
is not a quote mark, so quote detection neutralises those first; and
a sentence that ends on a quoted phrase ("...apocalypse.'") keeps its
period inside the closing quote, so the sentence counter counts that
terminal stop back in.

## How to run

```sh
node main.ts
```

By default the entry goes to `/output/entry.txt`. Point it elsewhere
with `MAKEFUN_OUTPUT_DIR`:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/apology-out node main.ts
```

The run prints the full scoring table, the winner with its per-criterion
notes, and the gate verification. Exit code is non-zero if the winner
fails any gate.

## Files

- `main.ts` — the program: pool, scorers, gate, writer, verifier.
- `README.md` — this file.
- `LICENSE` — MIT.
- `.makefun/owner.json` — the entrant's wallet, for repository ownership.
