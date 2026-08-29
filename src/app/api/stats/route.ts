import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const logs = await prisma.verificationLog.findMany({ orderBy: { createdAt: "asc" } });

  const totalScreened = logs.length;
  const byDecision = { CLEAR: 0, SECONDARY_REVIEW: 0, DENY: 0 } as Record<string, number>;
  const byRiskLevel = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<string, number>;

  for (const log of logs) {
    byDecision[log.decision] = (byDecision[log.decision] ?? 0) + 1;
    byRiskLevel[log.riskLevel] = (byRiskLevel[log.riskLevel] ?? 0) + 1;
  }

  const averageRiskScore = totalScreened > 0 ? Math.round(logs.reduce((sum, l) => sum + l.riskScore, 0) / totalScreened) : 0;

  const timeline = logs.map((l) => ({
    createdAt: l.createdAt,
    riskScore: l.riskScore,
    riskLevel: l.riskLevel,
  }));

  const [personCount, blacklistCount] = await Promise.all([
    prisma.personRecord.count(),
    prisma.blacklistEntry.count(),
  ]);

  return NextResponse.json({
    totalScreened,
    byDecision,
    byRiskLevel,
    averageRiskScore,
    timeline,
    personCount,
    blacklistCount,
  });
}
