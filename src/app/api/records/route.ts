import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [persons, blacklist] = await Promise.all([
    prisma.personRecord.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.blacklistEntry.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return NextResponse.json({ persons, blacklist });
}

const VALID_STATUSES = ["ACTIVE", "EXPIRED", "FLAGGED"];

/** Lets an operator manually correct a reference record's status — e.g. clearing a false FLAGGED after
 * investigation, or flagging a record the automated checks didn't catch. This is a human-in-the-loop
 * override sitting on top of the automated matching in dbMatch.ts, not a replacement for it. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id;
  const status = body?.status;

  if (typeof id !== "string" || typeof status !== "string" || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `id and status (one of ${VALID_STATUSES.join(", ")}) are required.` }, { status: 400 });
  }

  const record = await prisma.personRecord.findUnique({ where: { id } });
  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const updated = await prisma.personRecord.update({ where: { id }, data: { status } });
  return NextResponse.json({ record: updated });
}
