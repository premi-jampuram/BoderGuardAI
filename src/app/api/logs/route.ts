import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const logs = await prisma.verificationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const parsed = logs.map((log) => ({
    id: log.id,
    documentType: log.documentType,
    extractedData: JSON.parse(log.extractedData),
    validationResult: JSON.parse(log.validationResult),
    tamperingResult: JSON.parse(log.tamperingResult),
    faceMatchResult: log.faceMatchResult ? JSON.parse(log.faceMatchResult) : null,
    databaseMatch: log.databaseMatch ? JSON.parse(log.databaseMatch) : null,
    riskScore: log.riskScore,
    riskLevel: log.riskLevel,
    decision: log.decision,
    createdAt: log.createdAt,
  }));

  return NextResponse.json({ logs: parsed });
}
