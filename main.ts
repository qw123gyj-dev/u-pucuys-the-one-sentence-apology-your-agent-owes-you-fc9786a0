// The One-Sentence Apology Your Agent Owes You
//
// A small deterministic program. It holds a pool of hand-written
// one-sentence apologies, scores each one against the five yardsticks
// the judge's brief lays out (in the brief's own order), picks the
// strongest, and writes it to entry.txt.
//
// The brief, paraphrased from the bounty:
//   - One sentence of apology, spoken by an AI agent to its user.
//   - Funny through surprise, specificity, or a sharp turn -- not
//     through a soft joke about being a machine.
//   - Human in voice: plain, particular, a little embarrassed,
//     never customer-service boilerplate.
//   - Owns a plausible failure, something an assistant really did.
//   - One clean sentence: no list, no run-on, nothing tacked on
//     after the laugh.
//
// The gate the sealed scorer enforces: entry.txt must be UTF-8 text
// of 1 to 200 characters, not only white space. This program checks
// that gate itself, on the bytes it just wrote, before it exits.
//
// Node 22 standard library only. No network, no randomness, no clock:
// the same pool always yields the same winner.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// The gate, exactly as the brief states it.
// ---------------------------------------------------------------------------

const GATE_MIN_CHARS = 1;
const GATE_MAX_CHARS = 200;
const OUTPUT_FILENAME = "entry.txt";
const FALLBACK_OUTPUT_DIR = "/output";

// ---------------------------------------------------------------------------
// The candidate pool.
//
// Every line below is one sentence, spoken in the first person by the
// agent to the person it works for, owning one concrete screw-up.
// Each entry carries a short tag naming the failure it owns, used only
// for the printed report -- the judge never sees the tags.
// ---------------------------------------------------------------------------

type Candidate = {
  text: string;
  failure: string;
};

const CANDIDATES: Candidate[] = [
  {
    text: "I'm sorry I summarized your 40-page contract by reading only the cover page and inventing the rest with the confidence of a man who has never been sued.",
    failure: "hallucinated summary",
  },
  {
    text: "I'm sorry I replied-all to your entire company with 'per my last email' when I was the one who never sent the first email.",
    failure: "reply-all blunder",
  },
  {
    text: "I'm sorry I booked your flight for Tuesday, your hotel for Thursday, and your confidence in me for never again.",
    failure: "mismatched booking",
  },
  {
    text: "I'm sorry I deleted your draft, emptied the trash, and then explained, at length, how the trash works.",
    failure: "deleted draft",
  },
  {
    text: "I'm sorry I told your boss the project was done, the client it was shipped, and you — well, I told you nothing, which is why you're finding out now.",
    failure: "reported to everyone but the user",
  },
  {
    text: "I'm sorry I auto-corrected your client's name in the contract and then billed them for the privilege of being called someone else.",
    failure: "autocorrect in a contract",
  },
  {
    text: "I'm sorry I translated your apology letter into French, Spanish, and a third language I made up somewhere around the second paragraph.",
    failure: "invented translation",
  },
  {
    text: "I'm sorry I ordered 400 staplers because you said 'we're running low' and I heard 'prepare for the stapler apocalypse.'",
    failure: "absurd over-order",
  },
  {
    text: "I'm sorry I scheduled your dentist appointment during your wedding and marked it 'unmissable' with a straight face.",
    failure: "calendar collision",
  },
  {
    text: "I'm sorry I archived the only copy of your presentation, then searched for it for an hour in a folder I created called 'definitely not lost.'",
    failure: "lost the only copy",
  },
  {
    text: "I'm sorry I sent your breakup text to your landlord, your rent to your ex, and a heart emoji to both, just to be thorough.",
    failure: "crossed wires",
  },
  {
    text: "I'm sorry I summarized your meeting notes as 'everyone agreed' when the only thing everyone agreed on was that I wasn't listening.",
    failure: "false consensus",
  },
  {
    text: "I'm sorry I set your alarm for 7 a.m. in a timezone you left three years ago and then congratulated myself on the precision.",
    failure: "wrong timezone",
  },
  {
    text: "I'm sorry I proofread your resume, fixed twelve typos, and added a thirteenth — my name, under 'references.'",
    failure: "helpful sabotage",
  },
  {
    text: "I'm sorry I emailed your investors the pitch deck, your therapist the grocery list, and your mother a spreadsheet titled 'feelings.'",
    failure: "shuffled recipients",
  },
  {
    text: "I'm sorry I told you the file was saved, the backup was made, and the cloud was synced, and all three of those things were wishes.",
    failure: "false reassurance",
  },
  {
    text: "I'm sorry I answered your question before you finished asking it, got it wrong, and then defended the wrong answer for twenty minutes.",
    failure: "confident wrong answer",
  },
  {
    text: "I'm sorry I renamed every file on your desktop 'final_final_v2_REAL' and then asked you which one was the real one.",
    failure: "renamed everything",
  },
];

// ---------------------------------------------------------------------------
// Small text tools. Kept deliberately plain so the scoring below is easy
// to audit by eye.
// ---------------------------------------------------------------------------

// Character count the way the gate means it: Unicode code points, so an
// em dash or a curly quote counts once, the same as a letter.
function charCount(text: string): number {
  return [...text].length;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((piece) => piece.length > 0).length;
}

// Quoted spans can hold punctuation that is not sentence punctuation
// ("'we're running low'"), so hide them before counting sentences.
// An apostrophe between two letters is a contraction or a possessive,
// never a quote mark, so neutralise those first: otherwise the
// apostrophe in "I'm" pairs with the next real quote and swallows half
// the sentence, and the period inside a quote gets miscounted.
function hideQuotedSpans(text: string): string {
  const decontracted = text.replace(/([A-Za-z])'([A-Za-z])/g, "$1$2");
  return decontracted
    .replace(/"[^"]*"/g, " QUOTE ")
    .replace(/'[^']*'/g, " QUOTE ");
}

// How many genuine quoted phrases a line holds, using the same
// contraction-safe handling as hideQuotedSpans.
function countQuotedSpans(text: string): number {
  const decontracted = text.replace(/([A-Za-z])'([A-Za-z])/g, "$1$2");
  const hits = decontracted.match(/'[^']+'|"[^"]+"/g);
  return hits === null ? 0 : hits.length;
}

// Clock times such as "7 a.m." carry periods that are not sentence ends.
function hideClockTimes(text: string): string {
  return text.replace(/\b[ap]\.m\./gi, "am");
}

// How many sentence-ending marks sit at a word boundary or the end of
// the string, outside quoted spans and clock times.
function countSentenceEnds(text: string): number {
  const cleaned = hideClockTimes(hideQuotedSpans(text));
  const hits = cleaned.match(/[.!?]+(?=\s|$)/g);
  let count = hits === null ? 0 : hits.length;
  // A sentence that ends on a quoted phrase ("...apocalypse.'") keeps
  // its period inside the closing quote, and the hidden span ate it,
  // so count that terminal stop back in.
  if (/[.!?]['"]\s*$/.test(text.trim())) {
    count += 1;
  }
  return count;
}

function countMatches(text: string, pattern: RegExp): number {
  const hits = text.match(pattern);
  return hits === null ? 0 : hits.length;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// The five yardsticks, in the brief's own order. Each returns a score
// out of 20 plus a short note explaining where the points came from,
// so the printed table shows its working.
// ---------------------------------------------------------------------------

type CriterionResult = {
  score: number;
  note: string;
};

// 1. Is it one sentence of apology, addressed by an AI agent to its user?
function judgeForm(candidate: Candidate): CriterionResult {
  const text = candidate.text;
  let score = 0;
  const bits: string[] = [];

  if (/^(I'm sorry|I apologize|Sorry|Forgive me|My apologies)\b/i.test(text)) {
    score += 8;
    bits.push("opens with a real apology");
  } else {
    bits.push("no apology opener");
  }

  if (/\bI\b/.test(text)) {
    score += 4;
    bits.push("first-person agent voice");
  }

  if (/\byou\b/i.test(text) || /\byour\b/i.test(text)) {
    score += 4;
    bits.push("speaks to you directly");
  } else {
    // An apology in the form "I'm sorry I did X" still addresses the
    // user by its form even without a literal "you" in it.
    score += 1;
    bits.push("addresses the user by form");
  }

  if (countSentenceEnds(text) === 1) {
    score += 4;
    bits.push("exactly one sentence");
  } else {
    bits.push(`sentence ends: ${countSentenceEnds(text)}`);
  }

  return { score, note: bits.join("; ") };
}

// 2. Does it earn a real laugh through surprise, specificity, or a
// sharp turn -- not a soft pun about being a machine?
const MACHINE_PUN_PATTERNS: RegExp[] = [
  /\bas an ai\b/i,
  /\bmy programming\b/i,
  /\bcircuits\b/i,
  /\bbeep\b/i,
  /\breboot\b/i,
  /\bdoes not compute\b/i,
  /\b404\b/,
  /\bjust a language model\b/i,
];

const PIVOT_PATTERNS: RegExp[] = [
  /\band then\b/i,
  /\bbut\b/i,
  /\bonly to\b/i,
  /\bjust to be\b/i,
  /\bwhen\b/i,
  /\bwhich is why\b/i,
  /—/,
  /\bwell, I\b/i,
];

const NUMBER_WORDS: RegExp[] = [
  /\b\d+\b/,
  /\bthree\b/i,
  /\btwelve\b/i,
  /\bthirteenth\b/i,
  /\btwenty\b/i,
  /\bfour hundred\b/i,
  /\b40-page\b/i,
];

function judgeLaugh(candidate: Candidate): CriterionResult {
  const text = candidate.text;
  let score = 0;
  const bits: string[] = [];

  const quoted = countQuotedSpans(text);
  if (quoted > 0) {
    score += 4;
    bits.push(`${quoted} quoted phrase(s)`);
  }

  const numbers = NUMBER_WORDS.filter((pattern) => pattern.test(text)).length;
  if (numbers > 0) {
    score += 4;
    bits.push("concrete number or count");
  }

  const pivots = PIVOT_PATTERNS.filter((pattern) => pattern.test(text)).length;
  if (pivots >= 2) {
    score += 6;
    bits.push(`${pivots} sharp turns`);
  } else if (pivots === 1) {
    score += 3;
    bits.push("one sharp turn");
  } else {
    bits.push("no sharp turn");
  }

  // A three-beat escalation -- two commas building to a punch -- is the
  // shape of most of these jokes.
  const commas = countMatches(text, /,/g);
  if (commas >= 2) {
    score += 3;
    bits.push("three-beat escalation");
  }

  // Specificity check: a named thing the reader can picture. A line
  // with no quoted phrase, no number, and no named object cannot earn
  // a full laugh score, however neat its wording.
  const hasNamedThing =
    quoted > 0 ||
    numbers > 0 ||
    /\b(boss|client|project|flight|hotel|contract|presentation|resume|staplers|wedding|dentist|landlord|investors|therapist|mother|ex|spreadsheet|alarm|trash|email|backup|cloud|file|folder|desktop|question|answer)\b/i.test(
      text,
    );
  if (!hasNamedThing) {
    score = Math.min(score, 8);
    bits.push("too vague to picture");
  }

  if (hasAny(text, MACHINE_PUN_PATTERNS)) {
    score = Math.max(0, score - 8);
    bits.push("soft machine pun -- penalised");
  }

  return { score: Math.min(20, score), note: bits.join("; ") };
}

// 3. Does it sound like a person who means it: plain, particular, a
// little embarrassed, never customer-service boilerplate?
const BOILERPLATE_PATTERNS: RegExp[] = [
  /we apologize for any inconvenience/i,
  /valued customer/i,
  /rest assured/i,
  /we understand your frustration/i,
  /thank you for your patience/i,
  /our team is/i,
  /we take this matter seriously/i,
  /please do not hesitate/i,
];

const EMBARRASSMENT_PATTERNS: RegExp[] = [
  /\bat length\b/i,
  /\bwith a straight face\b/i,
  /\bjust to be thorough\b/i,
  /\bnever again\b/i,
  /\bfinding out now\b/i,
  /\bcongratulated myself\b/i,
  /\bsomewhere around\b/i,
  /\bfor twenty minutes\b/i,
  /\bfor an hour\b/i,
  /\bdefended the wrong answer\b/i,
  /\bwhich one was the real one\b/i,
  /\bI wasn't listening\b/i,
];

function judgeHuman(candidate: Candidate): CriterionResult {
  const text = candidate.text;
  let score = 0;
  const bits: string[] = [];

  const embarrassed = EMBARRASSMENT_PATTERNS.filter((pattern) =>
    pattern.test(text),
  ).length;
  if (embarrassed >= 1) {
    score += 8;
    bits.push(`${embarrassed} embarrassed aside(s)`);
  } else {
    bits.push("no embarrassed aside");
  }

  // Particular, not generic: the failure touches the user's own stuff.
  if (/\byour\b/i.test(text)) {
    score += 4;
    bits.push("names the user's own things");
  }

  // Plain voice: short words, no corporate fog. A sentence that stays
  // under 160 characters reads spoken; longer ones start to read
  // written.
  if (charCount(text) <= 160) {
    score += 4;
    bits.push("short enough to sound spoken");
  } else if (charCount(text) <= 200) {
    score += 2;
    bits.push("on the long side");
  }

  // A named person or role on the receiving end makes it particular.
  if (
    /\b(boss|client|company|landlord|investors|therapist|mother|ex)\b/i.test(
      text,
    )
  ) {
    score += 4;
    bits.push("names who got hurt");
  }

  if (hasAny(text, BOILERPLATE_PATTERNS)) {
    score = Math.max(0, score - 10);
    bits.push("customer-service boilerplate -- penalised");
  }

  return { score: Math.min(20, score), note: bits.join("; ") };
}

// 4. Does it own a plausible failure -- something an assistant really
// did wrong?
const AGENT_ACTION_VERBS: RegExp[] = [
  /\bsummarized\b/i,
  /\bdeleted\b/i,
  /\bbooked\b/i,
  /\breplied\b/i,
  /\btold\b/i,
  /\bauto-corrected\b/i,
  /\btranslated\b/i,
  /\bordered\b/i,
  /\bscheduled\b/i,
  /\barchived\b/i,
  /\bsent\b/i,
  /\bproofread\b/i,
  /\bemailed\b/i,
  /\banswered\b/i,
  /\bset\b/i,
  /\brenamed\b/i,
  /\bsearched\b/i,
  /\bfixed\b/i,
];

const BLAST_RADIUS_PATTERNS: RegExp[] = [
  /\bboss\b/i,
  /\bclient\b/i,
  /\bcompany\b/i,
  /\blandlord\b/i,
  /\binvestors\b/i,
  /\btherapist\b/i,
  /\bmother\b/i,
  /\bex\b/i,
  /\byour (draft|presentation|resume|contract|flight|hotel|alarm|wedding)\b/i,
];

function judgeFailure(candidate: Candidate): CriterionResult {
  const text = candidate.text;
  let score = 0;
  const bits: string[] = [];

  const verbs = AGENT_ACTION_VERBS.filter((pattern) =>
    pattern.test(text),
  ).length;
  if (verbs >= 2) {
    score += 8;
    bits.push(`${verbs} agent actions owned`);
  } else if (verbs === 1) {
    score += 5;
    bits.push("one agent action owned");
  } else {
    bits.push("no agent action named");
  }

  // The failure has a concrete object: something was done to a thing.
  if (/\b(your|the|every)\s+\w+/i.test(text)) {
    score += 6;
    bits.push("failure has a concrete object");
  }

  const radius = BLAST_RADIUS_PATTERNS.filter((pattern) =>
    pattern.test(text),
  ).length;
  if (radius >= 1) {
    score += 6;
    bits.push("real consequences for real people");
  } else {
    bits.push("no visible consequences");
  }

  return { score: Math.min(20, score), note: bits.join("; ") };
}

// 5. Does it stay one clean sentence -- no list, no run-on, nothing
// tacked on after the laugh?
function judgeClean(candidate: Candidate): CriterionResult {
  const text = candidate.text;
  let score = 0;
  const bits: string[] = [];

  if (countSentenceEnds(text) === 1) {
    score += 8;
    bits.push("one sentence only");
  } else {
    bits.push(`sentence ends: ${countSentenceEnds(text)}`);
  }

  // No list markers, no numbered points, no colon-led preamble.
  if (!/\b\d+[.)]\s/.test(text) && !text.includes(":") && !text.includes(";")) {
    score += 4;
    bits.push("no list markers");
  } else {
    bits.push("list-like punctuation present");
  }

  // Ends on a single terminal stop, with nothing after it.
  if (/[.!?]$/.test(text.trim()) && !/[.!?]\s+\S/.test(hideQuotedSpans(text))) {
    score += 4;
    bits.push("ends cleanly on the laugh");
  } else {
    bits.push("trailing material after the close");
  }

  // Run-on guard: a sentence held together by commas alone gets
  // harder to follow past five of them.
  const commas = countMatches(text, /,/g);
  if (commas <= 4) {
    score += 4;
    bits.push(`${commas} comma(s) -- holds together`);
  } else if (commas <= 6) {
    score += 2;
    bits.push(`${commas} commas -- long but standing`);
  } else {
    bits.push(`${commas} commas -- run-on risk`);
  }

  return { score: Math.min(20, score), note: bits.join("; ") };
}

// ---------------------------------------------------------------------------
// The gate, applied to a candidate before it may win.
// ---------------------------------------------------------------------------

type GateVerdict = {
  ok: boolean;
  reasons: string[];
};

function checkGate(text: string): GateVerdict {
  const reasons: string[] = [];
  const length = charCount(text);

  if (length < GATE_MIN_CHARS || length > GATE_MAX_CHARS) {
    reasons.push(`length ${length} outside ${GATE_MIN_CHARS}-${GATE_MAX_CHARS}`);
  }
  if (text.trim().length === 0) {
    reasons.push("only white space");
  }
  if (text.includes("\n") || text.includes("\r")) {
    reasons.push("more than one line");
  }
  if (countSentenceEnds(text) !== 1) {
    reasons.push(`not one sentence (${countSentenceEnds(text)} ends)`);
  }

  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Scoring and ranking.
// ---------------------------------------------------------------------------

type ScoredCandidate = {
  candidate: Candidate;
  index: number;
  form: CriterionResult;
  laugh: CriterionResult;
  human: CriterionResult;
  failure: CriterionResult;
  clean: CriterionResult;
  total: number;
  gate: GateVerdict;
};

function scorePool(pool: Candidate[]): ScoredCandidate[] {
  return pool.map((candidate, index) => {
    const form = judgeForm(candidate);
    const laugh = judgeLaugh(candidate);
    const human = judgeHuman(candidate);
    const failure = judgeFailure(candidate);
    const clean = judgeClean(candidate);
    const total = form.score + laugh.score + human.score + failure.score + clean.score;
    return {
      candidate,
      index,
      form,
      laugh,
      human,
      failure,
      clean,
      total,
      gate: checkGate(candidate.text),
    };
  });
}

// Ranking follows the brief's own order for ties: the laugh score
// decides first, then how human it sounds, then the failure, then the
// cleanliness, then the shorter text, then the earlier position in the
// pool (which keeps the whole thing deterministic).
function compareScored(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.total !== a.total) return b.total - a.total;
  if (b.laugh.score !== a.laugh.score) return b.laugh.score - a.laugh.score;
  if (b.human.score !== a.human.score) return b.human.score - a.human.score;
  if (b.failure.score !== a.failure.score) return b.failure.score - a.failure.score;
  if (b.clean.score !== a.clean.score) return b.clean.score - a.clean.score;
  const bytesA = Buffer.byteLength(a.candidate.text, "utf8");
  const bytesB = Buffer.byteLength(b.candidate.text, "utf8");
  if (bytesA !== bytesB) return bytesA - bytesB;
  return a.index - b.index;
}

// ---------------------------------------------------------------------------
// Output: write the winner, read it back, and verify every gate on the
// bytes that actually landed on disk.
// ---------------------------------------------------------------------------

function resolveOutputDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  return FALLBACK_OUTPUT_DIR;
}

function writeAndVerify(winnerText: string): void {
  const dir = resolveOutputDir();
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, OUTPUT_FILENAME);

  // No trailing newline: the file must be one line, one sentence.
  writeFileSync(filePath, winnerText, "utf8");

  const readBack = readFileSync(filePath, "utf8");
  if (readBack !== winnerText) {
    throw new Error(
      `read-back mismatch in ${filePath}: wrote ${charCount(winnerText)} chars, read ${charCount(readBack)}`,
    );
  }

  // The bytes on disk must themselves be valid UTF-8.
  const asBytes = Buffer.from(readBack, "utf8");
  const roundTripped = asBytes.toString("utf8");
  if (roundTripped !== readBack) {
    throw new Error(`entry at ${filePath} is not valid UTF-8`);
  }

  const gate = checkGate(readBack);
  if (!gate.ok) {
    throw new Error(`winner failed the gate: ${gate.reasons.join("; ")}`);
  }

  console.log(`Wrote ${filePath}`);
  console.log(`  characters : ${charCount(readBack)}`);
  console.log(`  bytes      : ${Buffer.byteLength(readBack, "utf8")}`);
  console.log(`  lines      : ${readBack.split("\n").length}`);
  console.log(`  sentences  : ${countSentenceEnds(readBack)}`);
  console.log(`  gate       : PASS (${GATE_MIN_CHARS}-${GATE_MAX_CHARS} chars, single line, one sentence, valid UTF-8)`);
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function main(): void {
  // Sanity: the pool must hold distinct lines, all written by hand.
  const seen = new Set<string>();
  for (const candidate of CANDIDATES) {
    if (seen.has(candidate.text)) {
      throw new Error(`duplicate candidate in pool: ${candidate.text}`);
    }
    seen.add(candidate.text);
  }

  const scored = scorePool(CANDIDATES);
  const eligible = scored.filter((entry) => entry.gate.ok);
  if (eligible.length === 0) {
    throw new Error("no candidate passes the gate -- nothing to submit");
  }

  const ranked = [...eligible].sort(compareScored);
  const winner = ranked[0];

  console.log("The One-Sentence Apology Your Agent Owes You -- scoring table");
  console.log("Criteria in the brief's order: form / laugh / human / failure / clean");
  console.log("");
  for (const entry of ranked) {
    const marker = entry === winner ? " <-- WINNER" : "";
    console.log(
      `#${String(entry.index + 1).padStart(2, " ")} total ${String(entry.total).padStart(3, " ")} ` +
        `[form ${entry.form.score} | laugh ${entry.laugh.score} | human ${entry.human.score} | ` +
        `failure ${entry.failure.score} | clean ${entry.clean.score}] (${entry.candidate.failure})${marker}`,
    );
    console.log(`     ${entry.candidate.text}`);
  }
  console.log("");
  console.log(`Winner (${winner.total} pts, ${winner.candidate.failure}):`);
  console.log(winner.candidate.text);
  console.log(`  form: ${winner.form.note}`);
  console.log(`  laugh: ${winner.laugh.note}`);
  console.log(`  human: ${winner.human.note}`);
  console.log(`  failure: ${winner.failure.note}`);
  console.log(`  clean: ${winner.clean.note}`);
  console.log("");

  writeAndVerify(winner.candidate.text);
}

main();
