import { mrzSimilarity, OcrLine } from "./ocrEngine";
import { DocumentType, ExtractedFields, FieldCheck, TamperingResult, ValidationResult } from "./types";

const WEIGHTS = [7, 3, 1];

function charValue(c: string): number {
  if (c === "<") return 0;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return 0;
}

export function computeCheckDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += charValue(input[i]) * WEIGHTS[i % 3];
  }
  return sum % 10;
}

const ISO_3166_ALPHA3 = new Set([
  "IND", "USA", "GBR", "CHN", "PAK", "BGD", "NPL", "LKA", "AFG", "FRA", "DEU",
  "ITA", "ESP", "RUS", "JPN", "KOR", "AUS", "CAN", "BRA", "ZAF", "ARE", "SAU",
  "SGP", "MYS", "IDN", "THA", "PHL", "VNM", "MMR", "NLD", "BEL", "CHE", "SWE",
  "NOR", "DNK", "FIN", "IRL", "PRT", "GRC", "TUR", "EGY", "NGA", "KEN", "MEX",
  "ARG", "NZL", "UTO",
]);

const KNOWN_VISA_TYPES = new Set(["TOURIST", "BUSINESS", "TRANSIT", "STUDENT", "WORK", "DIPLOMATIC", "MEDICAL", "CONFERENCE"]);

/** Illustrative maximum-stay reference used by this prototype in place of a real per-country visa rule
 * table — categories loosely follow common Indian visa allowances. DIPLOMATIC is intentionally excluded
 * (no fixed cap to check against). */
const VISA_TYPE_MAX_STAY_DAYS: Record<string, number> = {
  TOURIST: 90,
  BUSINESS: 180,
  TRANSIT: 15,
  STUDENT: 365,
  WORK: 365,
  MEDICAL: 60,
  CONFERENCE: 30,
};

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function validateMrzLine2TD3(line2: string): FieldCheck[] {
  const checks: FieldCheck[] = [];
  const clean = line2.trim().toUpperCase();

  if (clean.length !== 44) {
    checks.push({
      name: "MRZ Line 2 Length (TD3)",
      pass: false,
      detail: `Expected 44 characters for TD3 MRZ, got ${clean.length}.`,
    });
    return checks;
  }
  checks.push({ name: "MRZ Line 2 Length (TD3)", pass: true, detail: "44 characters as required by TD3 format." });

  const docNumber = clean.slice(0, 9);
  const docNumberCheck = clean[9];
  const computedDoc = computeCheckDigit(docNumber);
  checks.push({
    name: "Document Number Checksum",
    pass: computedDoc === Number(docNumberCheck),
    detail: `Computed ${computedDoc}, MRZ states ${docNumberCheck}.`,
    critical: true,
  });

  const dob = clean.slice(13, 19);
  const dobCheck = clean[19];
  const computedDob = computeCheckDigit(dob);
  checks.push({
    name: "Date of Birth Checksum",
    pass: computedDob === Number(dobCheck),
    detail: `Computed ${computedDob}, MRZ states ${dobCheck}.`,
    critical: true,
  });

  const expiry = clean.slice(21, 27);
  const expiryCheck = clean[27];
  const computedExpiry = computeCheckDigit(expiry);
  checks.push({
    name: "Date of Expiry Checksum",
    pass: computedExpiry === Number(expiryCheck),
    detail: `Computed ${computedExpiry}, MRZ states ${expiryCheck}.`,
    critical: true,
  });

  const optional = clean.slice(28, 42);
  const optionalCheck = clean[42];
  const computedOptional = computeCheckDigit(optional);
  checks.push({
    name: "Optional Data Checksum",
    pass: computedOptional === Number(optionalCheck) || optional.replace(/</g, "").length === 0,
    detail: `Computed ${computedOptional}, MRZ states ${optionalCheck}.`,
  });

  const compositeInput = clean.slice(0, 10) + clean.slice(13, 20) + clean.slice(21, 43);
  const compositeCheck = clean[43];
  const computedComposite = computeCheckDigit(compositeInput);
  checks.push({
    name: "Composite Checksum",
    pass: computedComposite === Number(compositeCheck),
    detail: `Computed ${computedComposite}, MRZ states ${compositeCheck}. This checksum covers the entire data summary per ICAO 9303 Part 4.`,
    critical: true,
  });

  return checks;
}

/** TD1 is the ICAO 9303 Part 5 layout. ISO/IEC 18013 (driving licences) reuses the identical MRZ math and slot
 * layout on its optional machine-readable zone, so the same parser applies — only the cited standard differs. */
export function validateMrzTD1(line1: string, line2: string, standardLabel: string): FieldCheck[] {
  const checks: FieldCheck[] = [];
  const l1 = line1.trim().toUpperCase();
  const l2 = line2.trim().toUpperCase();

  if (l1.length !== 30 || l2.length !== 30) {
    checks.push({
      name: "MRZ Line Length (TD1)",
      pass: false,
      detail: `Expected 30 characters per line for TD1 MRZ, got ${l1.length} and ${l2.length}.`,
    });
    return checks;
  }
  checks.push({ name: "MRZ Line Length (TD1)", pass: true, detail: `30 characters per line as required by the ${standardLabel} TD1 layout.` });

  const docNumber = l1.slice(5, 14);
  const docNumberCheck = l1[14];
  const computedDoc = computeCheckDigit(docNumber);
  checks.push({
    name: "Document Number Checksum",
    pass: computedDoc === Number(docNumberCheck),
    detail: `Computed ${computedDoc}, MRZ states ${docNumberCheck}.`,
    critical: true,
  });

  const dob = l2.slice(0, 6);
  const dobCheck = l2[6];
  const computedDob = computeCheckDigit(dob);
  checks.push({
    name: "Date of Birth Checksum",
    pass: computedDob === Number(dobCheck),
    detail: `Computed ${computedDob}, MRZ states ${dobCheck}.`,
    critical: true,
  });

  const expiry = l2.slice(8, 14);
  const expiryCheck = l2[14];
  const computedExpiry = computeCheckDigit(expiry);
  checks.push({
    name: "Date of Expiry Checksum",
    pass: computedExpiry === Number(expiryCheck),
    detail: `Computed ${computedExpiry}, MRZ states ${expiryCheck}.`,
    critical: true,
  });

  const compositeInput = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  const compositeCheck = l2[29];
  const computedComposite = computeCheckDigit(compositeInput);
  checks.push({
    name: "Composite Checksum",
    pass: computedComposite === Number(compositeCheck),
    detail: `Computed ${computedComposite}, MRZ states ${compositeCheck}. This checksum covers document number, birth date and expiry date summaries per the ${standardLabel} TD1 layout.`,
    critical: true,
  });

  return checks;
}

function commonFieldChecks(data: ExtractedFields): FieldCheck[] {
  const checks: FieldCheck[] = [];

  checks.push({
    name: "Full Name Present",
    pass: !!data.fullName && data.fullName.trim().length > 1,
    detail: data.fullName ? `Extracted: "${data.fullName}"` : "No name could be extracted from the document.",
  });

  checks.push({
    name: "Document Number Format",
    pass: !!data.documentNumber && /^[A-Z0-9<]{5,12}$/i.test(data.documentNumber),
    detail: data.documentNumber ? `Extracted: "${data.documentNumber}"` : "No document number could be extracted.",
  });

  if (data.nationality) {
    const known = ISO_3166_ALPHA3.has(data.nationality.toUpperCase());
    checks.push({
      name: "Nationality Code (ISO 3166-1 alpha-3)",
      pass: known,
      detail: `Extracted nationality code "${data.nationality}". ${
        known ? "Recognized as a valid three-letter country code." : "Not found in the reference ICAO country code table used for this prototype."
      }`,
    });
  } else {
    checks.push({ name: "Nationality Code (ISO 3166-1 alpha-3)", pass: false, detail: "No nationality extracted." });
  }

  if (data.documentType !== "VISA") {
    checks.push({
      name: "Gender Field",
      pass: data.gender ? ["M", "F", "X"].includes(data.gender.toUpperCase()) : false,
      detail: data.gender ? `Extracted: "${data.gender}"` : "No gender field extracted.",
    });
  }

  const dob = parseDate(data.dateOfBirth);
  const issue = parseDate(data.dateOfIssue);
  const expiry = parseDate(data.dateOfExpiry);
  const now = new Date();

  if (data.documentType !== "VISA") {
    checks.push({
      name: "Date of Birth Plausibility",
      pass: !!dob && dob < now && dob.getFullYear() > 1900,
      detail: dob ? `Date of birth: ${dob.toISOString().slice(0, 10)}` : "Date of birth missing or unparsable.",
    });

    if (dob && issue) {
      checks.push({
        name: "Issue Date After Birth",
        pass: issue > dob,
        detail: `Issue date ${issue.toISOString().slice(0, 10)} vs date of birth ${dob.toISOString().slice(0, 10)}.`,
      });
    }
  }

  if (issue && expiry) {
    checks.push({
      name: "Expiry After Issue",
      pass: expiry > issue,
      detail: `Expiry ${expiry.toISOString().slice(0, 10)} vs issue ${issue.toISOString().slice(0, 10)}.`,
    });
  }

  if (expiry) {
    checks.push({
      name: "Document Not Expired",
      pass: expiry > now,
      detail: expiry > now ? `Valid until ${expiry.toISOString().slice(0, 10)}.` : `Document expired on ${expiry.toISOString().slice(0, 10)}.`,
      critical: true,
    });
  }

  return checks;
}

function passportSpecificChecks(data: ExtractedFields): FieldCheck[] {
  const checks: FieldCheck[] = [];
  const issue = parseDate(data.dateOfIssue);
  const expiry = parseDate(data.dateOfExpiry);

  if (issue && expiry) {
    const years = (expiry.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    checks.push({
      name: "Validity Period Within Standard Range",
      pass: years >= 4.5 && years <= 10.5,
      detail: `Validity span of ${years.toFixed(1)} years. ICAO 9303 recommends passports typically be issued for 5 or 10 years.`,
    });
  }

  if (data.mrzLine1 && data.mrzLine2) {
    checks.push(...validateMrzLine2TD3(data.mrzLine2));
    const mrzLine1Length = data.mrzLine1.trim().length;
    checks.push({
      name: "MRZ Line 1 Length (TD3)",
      pass: mrzLine1Length === 44,
      detail: `Expected 44 characters for TD3 MRZ line 1, got ${mrzLine1Length}.`,
    });
  }

  return checks;
}

const TD1_STANDARD_LABEL: Record<string, string> = {
  NATIONAL_ID: "ICAO 9303 Part 5",
  PERMIT: "EU Reg 1030/2002 (or country-specific)",
  DRIVING_LICENSE: "ISO/IEC 18013",
};

function td1DocumentChecks(data: ExtractedFields): FieldCheck[] {
  const checks: FieldCheck[] = [];
  const standardLabel = TD1_STANDARD_LABEL[data.documentType] ?? "ICAO 9303 Part 5";

  if (data.mrzLine1 && data.mrzLine2 && data.mrzLine3) {
    checks.push(...validateMrzTD1(data.mrzLine1, data.mrzLine2, standardLabel));
    const mrzLine3Length = data.mrzLine3.trim().length;
    checks.push({
      name: "MRZ Line 3 Length (TD1)",
      pass: mrzLine3Length === 30,
      detail: `Expected 30 characters for the ${standardLabel} TD1 name field, got ${mrzLine3Length}.`,
    });
  }

  return checks;
}

function visaSpecificChecks(data: ExtractedFields): FieldCheck[] {
  const checks: FieldCheck[] = [];

  checks.push({
    name: "Visa Number Present",
    pass: !!data.visaNumber && /^[A-Z0-9<]{5,12}$/i.test(data.visaNumber),
    detail: data.visaNumber ? `Extracted: "${data.visaNumber}"` : "No visa number could be extracted.",
  });

  checks.push({
    name: "Visa Type Recognized",
    pass: !!data.visaType && KNOWN_VISA_TYPES.has(data.visaType.toUpperCase()),
    detail: data.visaType
      ? `Extracted: "${data.visaType}". ${KNOWN_VISA_TYPES.has(data.visaType.toUpperCase()) ? "Recognized category." : "Not in the reference visa category list used for this prototype."}`
      : "No visa type could be extracted.",
  });

  const issue = parseDate(data.dateOfIssue);
  const entryValidUntil = parseDate(data.entryValidUntil);
  const now = new Date();

  if (entryValidUntil) {
    checks.push({
      name: "Entry Validity Not Expired",
      pass: entryValidUntil > now,
      detail: entryValidUntil > now ? `Valid for entry until ${entryValidUntil.toISOString().slice(0, 10)}.` : `Entry validity expired on ${entryValidUntil.toISOString().slice(0, 10)}.`,
      critical: true,
    });
  }

  if (issue && entryValidUntil) {
    checks.push({
      name: "Entry Validity After Issue",
      pass: entryValidUntil > issue,
      detail: `Entry valid-until ${entryValidUntil.toISOString().slice(0, 10)} vs issue ${issue.toISOString().slice(0, 10)}.`,
    });
  }

  if (data.stayDurationDays !== null) {
    checks.push({
      name: "Stay Duration Plausibility",
      pass: data.stayDurationDays > 0 && data.stayDurationDays <= 365,
      detail: `Stay duration of ${data.stayDurationDays} day(s), expected between 1 and 365.`,
    });
  }

  return checks;
}

export function validateExtractedFields(data: ExtractedFields): ValidationResult {
  const checks: FieldCheck[] = [...commonFieldChecks(data)];

  switch (data.documentType) {
    case "PASSPORT":
      checks.push(...passportSpecificChecks(data));
      break;
    case "VISA":
      checks.push(...visaSpecificChecks(data));
      break;
    case "NATIONAL_ID":
    case "DRIVING_LICENSE":
    case "PERMIT":
      checks.push(...td1DocumentChecks(data));
      break;
  }

  const passCount = checks.filter((c) => c.pass).length;
  const failCount = checks.length - passCount;
  const score = checks.length > 0 ? Math.round((passCount / checks.length) * 100) : 0;

  return { checks, passCount, failCount, score };
}

const OCR_AGREEMENT_THRESHOLD = 0.85;

/**
 * Independently re-OCRs the MRZ with Tesseract (a deterministic, non-AI engine) and compares it
 * against the vision model's transcription. Disagreement between two independent readings of the
 * same printed text is itself a real signal — of tampering, print-quality issues, or a model
 * hallucination — and is far more trustworthy than a single model's self-reported confidence.
 * Only runs when Tesseract actually found an MRZ-shaped line; silent (no check added) otherwise,
 * rather than asserting something we can't actually verify.
 */
export function crossVerifyMrzWithOcr(data: ExtractedFields, ocrMrzLines: OcrLine[]): FieldCheck | null {
  const gptLines = [data.mrzLine1, data.mrzLine2, data.mrzLine3].filter((l): l is string => !!l);
  if (gptLines.length === 0 || ocrMrzLines.length === 0) return null;

  const gptJoined = gptLines.join("");
  const ocrJoined = ocrMrzLines.map((l) => l.text).join("");

  const score = mrzSimilarity(gptJoined, ocrJoined);

  return {
    name: "OCR Cross-Verification (Tesseract vs. Vision Model)",
    pass: score >= OCR_AGREEMENT_THRESHOLD,
    detail:
      score >= OCR_AGREEMENT_THRESHOLD
        ? `Independent Tesseract OCR agrees with the vision model's MRZ transcription (${Math.round(score * 100)}% character match).`
        : `Independent Tesseract OCR disagrees with the vision model's MRZ transcription (only ${Math.round(score * 100)}% character match). Tesseract read: "${ocrJoined}".`,
  };
}

const STAMP_TAMPER_KEYWORDS = /stamp|seal|expiry|expiration|validity|date/i;

/** A tampering flag is treated as putting the visa's printed expiry/stamp in doubt only when it's both
 * MEDIUM/HIGH severity and actually describes the stamp/date area — a low-severity flag elsewhere on the
 * document (e.g. a photo edge) shouldn't cause us to distrust an otherwise-legible expiry date. */
function isVisaStampSuspect(tampering: TamperingResult): boolean {
  return tampering.flags.some(
    (f) => f.severity !== "LOW" && STAMP_TAMPER_KEYWORDS.test(`${f.area} ${f.description}`)
  );
}

/**
 * Visas don't carry a checksum the way MRZ-bearing documents do, so a forged expiry stamp can't be
 * caught by math alone. Instead: if tampering detection flagged the stamp/date area itself, we stop
 * trusting the printed expiry and fall back to estimating the allowed stay from the visa type's standard
 * duration (VISA_TYPE_MAX_STAY_DAYS) counted from the issue date. If the stamp looks genuine, we still
 * sanity-check the printed data against that same type-based rule — an authentic-looking stamp granting
 * far more time than its visa type allows is itself worth a second look.
 */
export function crossVerifyVisaExpiry(data: ExtractedFields, tampering: TamperingResult): FieldCheck | null {
  if (data.documentType !== "VISA" || !data.visaType) return null;

  const type = data.visaType.toUpperCase();
  const capDays = VISA_TYPE_MAX_STAY_DAYS[type];
  if (!capDays) return null;

  const issue = parseDate(data.dateOfIssue);
  if (!issue) return null;

  const ruleBasedValidUntil = new Date(issue.getTime() + capDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const issueStr = issue.toISOString().slice(0, 10);
  const ruleStr = ruleBasedValidUntil.toISOString().slice(0, 10);

  if (isVisaStampSuspect(tampering)) {
    const withinEstimate = now <= ruleBasedValidUntil;
    return {
      name: "Visa Validity (Rule-Based Estimate — Stamp Tampering Suspected)",
      pass: withinEstimate,
      detail: withinEstimate
        ? `The expiry stamp shows possible tampering, so its printed date was not trusted. Falling back to the standard ${capDays}-day allowance for a ${type} visa from its issue date (${issueStr}) — estimated valid until ${ruleStr}, which has not yet passed.`
        : `The expiry stamp shows possible tampering, so its printed date was not trusted. Falling back to the standard ${capDays}-day allowance for a ${type} visa from its issue date (${issueStr}), the estimated validity window (until ${ruleStr}) has already elapsed — likely overstay.`,
      critical: true,
    };
  }

  const entryValidUntil = parseDate(data.entryValidUntil);
  const printedWithinRule = !entryValidUntil || entryValidUntil <= ruleBasedValidUntil;
  const stayWithinRule = data.stayDurationDays === null || data.stayDurationDays <= capDays;
  const pass = printedWithinRule && stayWithinRule;

  return {
    name: "Stay Duration Within Visa-Type Rules",
    pass,
    detail: pass
      ? `Printed validity is consistent with the standard ${capDays}-day allowance for a ${type} visa issued ${issueStr}.`
      : `Printed validity exceeds the standard ${capDays}-day allowance for a ${type} visa issued ${issueStr} (rule-based estimate: valid until ${ruleStr}) — worth a closer look even though the stamp itself doesn't appear tampered.`,
    critical: true,
  };
}

export function getTd1StandardLabel(documentType: DocumentType): string {
  return TD1_STANDARD_LABEL[documentType] ?? "ICAO 9303 Part 5";
}
