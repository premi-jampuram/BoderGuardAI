import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractDocumentFields, analyzeTampering, compareFaces, assessPortraitQuality, assessLiveness } from "@/lib/openai";
import { crossVerifyMrzWithOcr, crossVerifyVisaExpiry, validateExtractedFields } from "@/lib/icao9303";
import { analyzeImageMetadata } from "@/lib/metadata";
import { matchAgainstDatabase, flagPersonRecordForVisaViolation } from "@/lib/dbMatch";
import { computeRiskScore } from "@/lib/riskScore";
import { findMrzLines, locateFieldValue, OcrWord, runOcr, unionBox } from "@/lib/ocrEngine";
import { ExtractedFields, FaceMatchResult, FieldBox, LivenessResult, VerificationResponse } from "@/lib/types";

export const runtime = "nodejs";

async function fileToBase64(file: File): Promise<{ base64: string; mime: string; buffer: Buffer }> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { base64: buffer.toString("base64"), mime: file.type || "image/jpeg", buffer };
}

const LOCATABLE_FIELDS: { field: keyof ExtractedFields; label: string }[] = [
  { field: "fullName", label: "Name" },
  { field: "documentNumber", label: "Document No." },
  { field: "nationality", label: "Nationality" },
  { field: "dateOfBirth", label: "Date of Birth" },
  { field: "dateOfIssue", label: "Date of Issue" },
  { field: "dateOfExpiry", label: "Date of Expiry" },
  { field: "visaNumber", label: "Visa No." },
  { field: "visaType", label: "Visa Type" },
  { field: "entryValidUntil", label: "Entry Valid Until" },
];

function locateFieldBoxes(extracted: ExtractedFields, words: OcrWord[]): FieldBox[] {
  const boxes: FieldBox[] = [];
  for (const { field, label } of LOCATABLE_FIELDS) {
    const value = extracted[field];
    if (typeof value !== "string" || !value.trim()) continue;
    const box = locateFieldValue(words, value);
    if (box) boxes.push({ field, label, box });
  }
  return boxes;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const documentFile = formData.get("document") as File | null;
    const selfieFile = formData.get("selfie") as File | null;

    if (!documentFile) {
      return NextResponse.json({ error: "A document image is required." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 500 });
    }

    const { base64: docBase64, mime: docMime, buffer: docBuffer } = await fileToBase64(documentFile);

    const [extracted, tamperingRaw, metadataFlags, portraitQuality, ocrResult] = await Promise.all([
      extractDocumentFields(docBase64, docMime),
      analyzeTampering(docBase64, docMime),
      analyzeImageMetadata(docBuffer),
      assessPortraitQuality(docBase64, docMime),
      runOcr(docBuffer).catch(() => ({ fullText: "", lines: [], words: [] })),
    ]);

    const tampering = { ...tamperingRaw, metadataFlags };

    // Tesseract's own pixel-measured boxes replace the vision model's guessed MRZ box whenever it
    // actually finds MRZ-shaped text — real geometry beats an AI estimate wherever we can get it.
    const ocrMrzLines = findMrzLines(ocrResult.lines);
    if (ocrMrzLines.length > 0) {
      extracted.mrzBoundingBox = unionBox(ocrMrzLines.map((l) => l.box));
    }

    const fieldBoxes = locateFieldBoxes(extracted, ocrResult.words);

    const validation = validateExtractedFields(extracted);
    const crossCheck = crossVerifyMrzWithOcr(extracted, ocrMrzLines);
    if (crossCheck) validation.checks.push(crossCheck);

    const visaExpiryCheck = crossVerifyVisaExpiry(extracted, tampering);
    if (visaExpiryCheck) validation.checks.push(visaExpiryCheck);

    if (crossCheck || visaExpiryCheck) {
      validation.passCount = validation.checks.filter((c) => c.pass).length;
      validation.failCount = validation.checks.length - validation.passCount;
      validation.score = Math.round((validation.passCount / validation.checks.length) * 100);
    }

    const databaseMatch = await matchAgainstDatabase(extracted);

    if (visaExpiryCheck && !visaExpiryCheck.pass && extracted.documentNumber && databaseMatch.found) {
      const flagged = await flagPersonRecordForVisaViolation(extracted.documentNumber);
      if (flagged) {
        databaseMatch.recordFlagged = true;
        databaseMatch.recordFlagReason = visaExpiryCheck.detail;
        databaseMatch.status = "FLAGGED";
      }
    }

    let faceMatch: FaceMatchResult = { performed: false, similarityScore: null, reasoning: "No selfie image was provided for comparison." };
    let liveness: LivenessResult = { performed: false, livenessScore: null, attackIndicators: [], reasoning: "No selfie image was provided for liveness assessment." };

    if (selfieFile) {
      const { base64: selfieBase64, mime: selfieMime } = await fileToBase64(selfieFile);
      [faceMatch, liveness] = await Promise.all([
        compareFaces(docBase64, docMime, selfieBase64, selfieMime),
        assessLiveness(selfieBase64, selfieMime),
      ]);
    }

    const risk = computeRiskScore({ validation, tampering, faceMatch, portraitQuality, liveness, databaseMatch });

    const log = await prisma.verificationLog.create({
      data: {
        documentType: extracted.documentType,
        extractedData: JSON.stringify(extracted),
        mrzRaw: extracted.mrzLine1 && extracted.mrzLine2 ? `${extracted.mrzLine1}\n${extracted.mrzLine2}` : null,
        validationResult: JSON.stringify(validation),
        tamperingResult: JSON.stringify(tampering),
        faceMatchResult: JSON.stringify(faceMatch),
        portraitQualityResult: JSON.stringify(portraitQuality),
        livenessResult: JSON.stringify(liveness),
        databaseMatch: JSON.stringify(databaseMatch),
        riskBreakdown: JSON.stringify(risk.breakdown),
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        decision: risk.decision,
      },
    });

    const response: VerificationResponse = {
      extracted,
      validation,
      tampering,
      faceMatch,
      portraitQuality,
      liveness,
      databaseMatch,
      mrzBoxMeasured: ocrMrzLines.length > 0,
      fieldBoxes,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      decision: risk.decision,
      riskBreakdown: risk.breakdown,
      logId: log.id,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Verification failed", error);
    const message = error instanceof Error ? error.message : "Unknown error during verification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
