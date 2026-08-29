import { createWorker, Worker } from "tesseract.js";
import { imageSize } from "image-size";
import { BoundingBox } from "./types";

export interface OcrLine {
  text: string;
  box: BoundingBox;
}

export interface OcrWord {
  text: string;
  box: BoundingBox;
}

export interface OcrResult {
  fullText: string;
  lines: OcrLine[];
  words: OcrWord[];
}

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

/**
 * Real, deterministic OCR (Tesseract) run against the actual pixel grid — used to get
 * genuinely measured bounding boxes and to independently cross-check the vision model's
 * MRZ transcription, rather than trusting a single LLM's guess for either.
 */
export async function runOcr(buffer: Buffer): Promise<OcrResult> {
  const dimensions = imageSize(buffer);
  const width = dimensions.width || 1;
  const height = dimensions.height || 1;

  const worker = await getWorker();
  const { data } = await worker.recognize(buffer, {}, { text: true, blocks: true });

  const lines: OcrLine[] = [];
  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = line.text.trim();
        if (text) {
          lines.push({
            text,
            box: [line.bbox.x0 / width, line.bbox.y0 / height, line.bbox.x1 / width, line.bbox.y1 / height],
          });
        }
        for (const word of line.words ?? []) {
          const wordText = word.text.trim();
          if (!wordText) continue;
          words.push({
            text: wordText,
            box: [word.bbox.x0 / width, word.bbox.y0 / height, word.bbox.x1 / width, word.bbox.y1 / height],
          });
        }
      }
    }
  }

  return { fullText: data.text ?? "", lines, words };
}

const MRZ_CANDIDATE_PATTERN = /^[A-Z0-9<]{20,44}$/;

/** MRZ lines are the only lines in an ID document made purely of A-Z0-9< in a monospaced block — easy to identify reliably from real OCR output without any AI guessing. */
export function findMrzLines(lines: OcrLine[]): OcrLine[] {
  return lines
    .map((l) => ({ ...l, text: l.text.toUpperCase().replace(/\s/g, "") }))
    .filter((l) => l.text.length >= 28 && MRZ_CANDIDATE_PATTERN.test(l.text))
    .sort((a, b) => a.box[1] - b.box[1]);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/** 1.0 = identical after normalizing whitespace/case; 0.0 = completely different. */
export function mrzSimilarity(a: string, b: string): number {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9<]/g, "");
  const ca = clean(a);
  const cb = clean(b);
  if (!ca && !cb) return 1;
  const dist = levenshtein(ca, cb);
  return 1 - dist / Math.max(ca.length, cb.length, 1);
}

export function unionBox(boxes: BoundingBox[]): BoundingBox {
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

function cleanForMatch(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** GPT normalizes dates to ISO, but the document prints them however the issuer formats dates.
 * Generate the plausible printed forms so a real ISO value can still be located on the page. */
function candidateSearchStrings(value: string): string[] {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!isoMatch) return [value];

  const [, year, month, day] = isoMatch;
  const monthAbbr = MONTH_ABBR[Number(month) - 1] ?? month;

  return [value, `${day}${monthAbbr}${year}`, `${day}${month}${year}`, `${month}${day}${year}`, `${year}${month}${day}`];
}

/**
 * Locates a specific extracted field's value in the real OCR word grid by sliding a window over
 * consecutive words and scoring the concatenation against the value (and, for dates, against the
 * plausible printed formats). Returns null rather than a low-confidence guess when nothing clears
 * the match threshold — a missing box is preferable to a wrong one.
 */
export function locateFieldValue(words: OcrWord[], value: string, maxWindow = 6): BoundingBox | null {
  if (!value || words.length === 0) return null;

  const targets = candidateSearchStrings(value).map(cleanForMatch).filter((t) => t.length >= 1);
  if (targets.length === 0) return null;

  let best: { score: number; box: BoundingBox } | null = null;
  const MATCH_THRESHOLD = 0.75;

  for (let start = 0; start < words.length; start++) {
    let concatenated = "";
    for (let len = 1; len <= maxWindow && start + len <= words.length; len++) {
      concatenated += cleanForMatch(words[start + len - 1].text);
      if (concatenated.length === 0) continue;

      for (const target of targets) {
        if (concatenated.length < target.length * 0.6 || concatenated.length > target.length * 1.8) continue;
        const score = mrzSimilarity(concatenated, target);
        if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
          best = { score, box: unionBox(words.slice(start, start + len).map((w) => w.box)) };
        }
      }
    }
  }

  return best ? best.box : null;
}
