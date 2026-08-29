import { DatabaseMatch, FaceMatchResult, LivenessResult, PortraitQualityResult, RiskBreakdownItem, TamperingResult, ValidationResult } from "./types";

export interface RiskInput {
  validation: ValidationResult;
  tampering: TamperingResult;
  faceMatch: FaceMatchResult;
  portraitQuality: PortraitQualityResult;
  liveness: LivenessResult;
  databaseMatch: DatabaseMatch;
}

export interface RiskOutput {
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  decision: "CLEAR" | "SECONDARY_REVIEW" | "DENY";
  breakdown: RiskBreakdownItem[];
}

// Face similarity is continuous, not binary — this band is "too similar to be a stranger, not similar
// enough to be certain," which is exactly the range a look-alike or an identical twin using a relative's
// genuine document would land in. No amount of prompt-tuning the vision model resolves that ambiguity
// (even certified biometric systems have measurably higher false-accept rates for monozygotic twins), so
// instead of trusting a single continuous score, an ambiguous match puts a floor under the decision — it
// can't resolve to CLEAR on face similarity alone; it must be corroborated by everything else or kicked
// to a human.
const AMBIGUOUS_FACE_MATCH_MIN = 50;
const AMBIGUOUS_FACE_MATCH_MAX = 90;
const AMBIGUOUS_FACE_MATCH_SCORE_FLOOR = 30;

export function computeRiskScore(input: RiskInput): RiskOutput {
  const breakdown: RiskBreakdownItem[] = [];
  let score = 0;
  let scoreFloor = 0;

  const validationFailureShare = input.validation.checks.length > 0 ? input.validation.failCount / input.validation.checks.length : 0;
  const validationContribution = Math.round(validationFailureShare * 25);
  score += validationContribution;
  breakdown.push({
    factor: "Document Field Validation",
    contribution: validationContribution,
    detail: `${input.validation.failCount} of ${input.validation.checks.length} checks failed.`,
  });

  // A failed checksum, an expired validity date, or a blown visa-type allowance is disqualifying on its
  // own — averaging it in with minor extraction gaps (as validationContribution above does) would let a
  // handful of harmless failures mask one that actually matters. Each failed critical check adds a flat
  // 30 points, independent of how many other (non-critical) checks passed.
  const criticalFailures = input.validation.checks.filter((c) => c.critical && !c.pass);
  if (criticalFailures.length > 0) {
    const criticalContribution = Math.min(60, criticalFailures.length * 30);
    score += criticalContribution;
    breakdown.push({
      factor: "Critical Field Failure",
      contribution: criticalContribution,
      detail: criticalFailures.map((c) => c.name).join("; ") + ".",
    });
  }

  const tamperingContribution = Math.round((input.tampering.tamperingScore / 100) * 25);
  score += tamperingContribution;
  breakdown.push({
    factor: "Tampering Detection",
    contribution: tamperingContribution,
    detail: `AI-estimated tampering likelihood: ${input.tampering.tamperingScore}/100.`,
  });

  if (input.tampering.metadataFlags.length > 0) {
    const metadataContribution = Math.min(10, input.tampering.metadataFlags.length * 5);
    score += metadataContribution;
    breakdown.push({
      factor: "Image Metadata Anomalies",
      contribution: metadataContribution,
      detail: input.tampering.metadataFlags.join(" "),
    });
  }

  if (input.faceMatch.performed && input.faceMatch.similarityScore !== null) {
    const sim = input.faceMatch.similarityScore;
    const faceContribution = Math.round(((100 - sim) / 100) * 15);
    score += faceContribution;
    breakdown.push({
      factor: "Face Verification",
      contribution: faceContribution,
      detail: `Similarity score: ${sim}/100.`,
    });

    if (sim >= AMBIGUOUS_FACE_MATCH_MIN && sim < AMBIGUOUS_FACE_MATCH_MAX) {
      scoreFloor = Math.max(scoreFloor, AMBIGUOUS_FACE_MATCH_SCORE_FLOOR);
      breakdown.push({
        factor: "Face Match Inconclusive",
        contribution: 0,
        detail: `A similarity score of ${sim}/100 is high enough to plausibly be a close relative or lookalike (including an identical twin using a genuine relative's document) rather than a confirmed match — this alone rules out an automatic CLEAR.`,
      });
    }
  }

  if (input.portraitQuality.performed && input.portraitQuality.qualityScore !== null) {
    const portraitContribution = Math.round(((100 - input.portraitQuality.qualityScore) / 100) * 10);
    score += portraitContribution;
    breakdown.push({
      factor: "Portrait Quality (ISO/IEC 19794-5)",
      contribution: portraitContribution,
      detail: `Document photo conformance score: ${input.portraitQuality.qualityScore}/100.`,
    });
  }

  if (input.liveness.performed && input.liveness.livenessScore !== null) {
    const livenessContribution = Math.round(((100 - input.liveness.livenessScore) / 100) * 15);
    score += livenessContribution;
    breakdown.push({
      factor: "Liveness / Presentation Attack Detection (ISO/IEC 30107)",
      contribution: livenessContribution,
      detail: `Live-capture confidence: ${input.liveness.livenessScore}/100.`,
    });
  }

  if (input.databaseMatch.blacklisted) {
    score += 40;
    breakdown.push({
      factor: "Blacklist Match",
      contribution: 40,
      detail: input.databaseMatch.blacklistReason ?? "Document number found on blacklist.",
    });
  }

  if (input.databaseMatch.possibleAlias) {
    score += 20;
    breakdown.push({
      factor: "Possible Multiple Identity",
      contribution: 20,
      detail: input.databaseMatch.aliasDetail ?? "Biometric or identity overlap detected with another record.",
    });
  }

  if (input.databaseMatch.found && input.databaseMatch.status === "EXPIRED") {
    score += 10;
    breakdown.push({
      factor: "Document Status",
      contribution: 10,
      detail: "Matched database record is marked expired.",
    });
  }

  if (input.databaseMatch.nearBlacklistMatch) {
    const { documentNumber, fullName, distance } = input.databaseMatch.nearBlacklistMatch;
    const nearMatchContribution = 15;
    score += nearMatchContribution;
    breakdown.push({
      factor: "Near-Match to Blacklisted Document",
      contribution: nearMatchContribution,
      detail: `Document number is only ${distance} character(s) different from a blacklisted entry: ${fullName} (${documentNumber}) — not an exact hit, but close enough to warrant scrutiny (typo, alteration, or OCR misread).`,
    });
  }

  if (input.databaseMatch.blacklisted) {
    scoreFloor = Math.max(scoreFloor, 75);
  }

  score = Math.max(0, Math.min(100, Math.max(score, scoreFloor)));

  let riskLevel: RiskOutput["riskLevel"];
  let decision: RiskOutput["decision"];

  // Thresholds are deliberately narrow around the middle: the goal is to resolve most
  // screenings to a confident CLEAR or DENY and reserve SECONDARY_REVIEW for genuine
  // ambiguity, not as a default catch-all for anything less than a perfect score.
  if (score >= 65) {
    riskLevel = "CRITICAL";
    decision = "DENY";
  } else if (score >= 50) {
    riskLevel = "HIGH";
    decision = "SECONDARY_REVIEW";
  } else if (score >= 30) {
    riskLevel = "MEDIUM";
    decision = "SECONDARY_REVIEW";
  } else {
    riskLevel = "LOW";
    decision = "CLEAR";
  }

  return { riskScore: score, riskLevel, decision, breakdown };
}
