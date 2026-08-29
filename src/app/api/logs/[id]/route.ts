import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await prisma.verificationLog.findUnique({ where: { id } });

  if (!log) {
    return NextResponse.json({ error: "Screening not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: log.id,
    documentType: log.documentType,
    extractedData: JSON.parse(log.extractedData),
    mrzRaw: log.mrzRaw,
    validationResult: JSON.parse(log.validationResult),
    tamperingResult: JSON.parse(log.tamperingResult),
    faceMatchResult: log.faceMatchResult ? JSON.parse(log.faceMatchResult) : null,
    portraitQualityResult: log.portraitQualityResult ? JSON.parse(log.portraitQualityResult) : null,
    livenessResult: log.livenessResult ? JSON.parse(log.livenessResult) : null,
    databaseMatch: log.databaseMatch ? JSON.parse(log.databaseMatch) : null,
    riskBreakdown: JSON.parse(log.riskBreakdown),
    riskScore: log.riskScore,
    riskLevel: log.riskLevel,
    decision: log.decision,
    createdAt: log.createdAt,
  });
}
