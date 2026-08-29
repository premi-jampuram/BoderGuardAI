import { prisma } from "./prisma";
import { DatabaseMatch, ExtractedFields } from "./types";

export function normalizeDocumentNumber(documentNumber: string): string {
  return documentNumber.toUpperCase().replace(/</g, "").trim();
}

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

const NEAR_BLACKLIST_MATCH_MAX_DISTANCE = 2;

/**
 * An exact documentNumber lookup misses a blacklisted document that's been altered by a character or
 * two, or a genuine blacklist hit that OCR misread by one digit — both are common in practice and both
 * are exactly the case a fraud screen most needs to catch. Small reference table, so a full scan per
 * screening is fine at this scale.
 */
async function findNearBlacklistMatch(docNumber: string) {
  const entries = await prisma.blacklistEntry.findMany({ select: { documentNumber: true, fullName: true } });
  let best: { documentNumber: string; fullName: string; distance: number } | null = null;

  for (const entry of entries) {
    if (entry.documentNumber === docNumber) continue;
    const distance = levenshteinDistance(docNumber, entry.documentNumber);
    if (distance <= NEAR_BLACKLIST_MATCH_MAX_DISTANCE && (!best || distance < best.distance)) {
      best = { documentNumber: entry.documentNumber, fullName: entry.fullName, distance };
    }
  }

  return best;
}

export async function matchAgainstDatabase(extracted: ExtractedFields): Promise<DatabaseMatch> {
  const result: DatabaseMatch = {
    found: false,
    status: null,
    blacklisted: false,
    blacklistReason: null,
    blacklistSource: null,
    possibleAlias: false,
    aliasDetail: null,
    recordFlagged: false,
    recordFlagReason: null,
    nearBlacklistMatch: null,
  };

  if (!extracted.documentNumber) {
    return result;
  }

  const docNumber = normalizeDocumentNumber(extracted.documentNumber);

  const blacklistHit = await prisma.blacklistEntry.findUnique({ where: { documentNumber: docNumber } });
  if (blacklistHit) {
    result.blacklisted = true;
    result.blacklistReason = `${blacklistHit.reason} (severity: ${blacklistHit.severity})`;
    result.blacklistSource = blacklistHit.source;
  } else {
    result.nearBlacklistMatch = await findNearBlacklistMatch(docNumber);
  }

  const record = await prisma.personRecord.findUnique({ where: { documentNumber: docNumber } });
  if (record) {
    result.found = true;
    result.status = record.status;
  }

  if (extracted.dateOfBirth) {
    const dob = new Date(extracted.dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const startOfDay = new Date(Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()));
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const sameDobDifferentDoc = await prisma.personRecord.findMany({
        where: {
          dateOfBirth: { gte: startOfDay, lt: endOfDay },
          documentNumber: { not: docNumber },
        },
      });

      if (sameDobDifferentDoc.length > 0) {
        result.possibleAlias = true;
        result.aliasDetail = `Found ${sameDobDifferentDoc.length} other record(s) sharing this date of birth under a different document number: ${sameDobDifferentDoc
          .map((r) => `${r.fullName} (${r.documentNumber})`)
          .join(", ")}.`;
      }
    }
  }

  return result;
}

/**
 * Persists a visa-rule violation onto the matched reference record so it shows up for anyone who looks
 * the person up later, not just in this one screening's audit log. Only writes when the record isn't
 * already FLAGGED, so re-screening the same overstayed visa doesn't repeatedly touch the row.
 */
export async function flagPersonRecordForVisaViolation(documentNumber: string): Promise<boolean> {
  const docNumber = normalizeDocumentNumber(documentNumber);
  const record = await prisma.personRecord.findUnique({ where: { documentNumber: docNumber } });
  if (!record || record.status === "FLAGGED") return false;

  await prisma.personRecord.update({ where: { documentNumber: docNumber }, data: { status: "FLAGGED" } });
  return true;
}
