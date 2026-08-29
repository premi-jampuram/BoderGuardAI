import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const persons = [
  {
    fullName: "ARJUN RAJESH SHARMA",
    documentType: "PASSPORT",
    documentNumber: "P1234567",
    nationality: "IND",
    dateOfBirth: new Date("1994-03-12"),
    dateOfIssue: new Date("2021-05-01"),
    dateOfExpiry: new Date("2031-05-01"),
    gender: "M",
    status: "ACTIVE",
  },
  {
    fullName: "PRIYA VENKATESH IYER",
    documentType: "PASSPORT",
    documentNumber: "P7654321",
    nationality: "IND",
    dateOfBirth: new Date("1990-11-23"),
    dateOfIssue: new Date("2019-02-14"),
    dateOfExpiry: new Date("2029-02-14"),
    gender: "F",
    status: "ACTIVE",
  },
  {
    fullName: "MOHAMMED AASIF KHAN",
    documentType: "PASSPORT",
    documentNumber: "P1122334",
    nationality: "PAK",
    dateOfBirth: new Date("1988-07-04"),
    dateOfIssue: new Date("2014-01-10"),
    dateOfExpiry: new Date("2024-01-10"),
    gender: "M",
    status: "EXPIRED",
  },
  {
    fullName: "JOHN MICHAEL SMITH",
    documentType: "PASSPORT",
    documentNumber: "P9988776",
    nationality: "USA",
    dateOfBirth: new Date("1985-01-30"),
    dateOfIssue: new Date("2022-06-01"),
    dateOfExpiry: new Date("2032-06-01"),
    gender: "M",
    status: "ACTIVE",
  },
  {
    fullName: "WEI ZHANG",
    documentType: "PASSPORT",
    documentNumber: "E20334455",
    nationality: "CHN",
    dateOfBirth: new Date("1997-09-18"),
    dateOfIssue: new Date("2023-03-20"),
    dateOfExpiry: new Date("2033-03-20"),
    gender: "M",
    status: "ACTIVE",
  },
  {
    fullName: "RAVI KUMAR SHARMA",
    documentType: "PASSPORT",
    documentNumber: "P9871234",
    nationality: "IND",
    dateOfBirth: new Date("1994-03-12"),
    dateOfIssue: new Date("2022-08-15"),
    dateOfExpiry: new Date("2032-08-15"),
    gender: "M",
    status: "FLAGGED",
    aliasOf: "P1234567",
  },
  {
    // Matches testimages/visa_valid.png (document number V8899001) so the visa-rule cross-check and
    // its database write-back are demoable end to end: screening that image should flip this record
    // from ACTIVE to FLAGGED once the entry-validity/visa-type-allowance check fails.
    fullName: "JOHN MICHAEL SMITH",
    documentType: "VISA",
    documentNumber: "V8899001",
    nationality: "USA",
    dateOfBirth: new Date("1985-01-30"),
    dateOfIssue: new Date("2026-01-01"),
    dateOfExpiry: new Date("2026-07-01"),
    gender: "M",
    status: "ACTIVE",
  },
];

const blacklist = [
  {
    documentNumber: "P1122334",
    fullName: "MOHAMMED AASIF KHAN",
    reason: "Overstayed visa on prior entry; expired document",
    severity: "HIGH",
    source: "National Watchlist",
  },
  {
    documentNumber: "P5566778",
    fullName: "CARLOS EDUARDO SANTOS",
    reason: "Reported stolen passport",
    severity: "CRITICAL",
    source: "Simulated INTERPOL SLTD Database",
  },
  {
    documentNumber: "N3344556",
    fullName: "ELENA PETROVA",
    reason: "Prior use of forged national ID at checkpoint",
    severity: "CRITICAL",
    source: "National Watchlist",
  },
];

async function main() {
  await prisma.verificationLog.deleteMany();
  await prisma.blacklistEntry.deleteMany();
  await prisma.personRecord.deleteMany();

  for (const p of persons) {
    await prisma.personRecord.create({ data: p });
  }

  for (const b of blacklist) {
    await prisma.blacklistEntry.create({ data: b });
  }

  console.log(`Seeded ${persons.length} person records and ${blacklist.length} blacklist entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
