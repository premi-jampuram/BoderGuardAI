import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDocumentNumber } from "@/lib/dbMatch";

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Lets an operator add a screened document straight to the blacklist from the verification result —
 * closing the loop for the case automated matching can't cover on its own: a document that isn't a
 * database record at all, just one an operator has just determined is fraudulent. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const documentNumber = body?.documentNumber;
  const fullName = body?.fullName;
  const reason = body?.reason;
  const severity = VALID_SEVERITIES.includes(body?.severity) ? body.severity : "HIGH";
  const source = typeof body?.source === "string" && body.source.trim() ? body.source : "Manual Screening Flag";

  if (typeof documentNumber !== "string" || !documentNumber.trim() || typeof fullName !== "string" || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "documentNumber, fullName and reason are required." }, { status: 400 });
  }

  const docNumber = normalizeDocumentNumber(documentNumber);

  const existing = await prisma.blacklistEntry.findUnique({ where: { documentNumber: docNumber } });
  if (existing) {
    return NextResponse.json({ entry: existing, alreadyExisted: true });
  }

  const entry = await prisma.blacklistEntry.create({
    data: { documentNumber: docNumber, fullName: fullName || "Unknown", reason, severity, source },
  });

  return NextResponse.json({ entry, alreadyExisted: false });
}
