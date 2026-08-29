# BorderGuard AI — Fake Identity & Document Screening System

Prototype built for the SIH hackathon problem statement *"AI-Based Fake Identity & Document Screening System"*.
It screens passports, visas, national IDs, driving licenses and permits by running OCR extraction, ICAO
Document 9303 rule validation, AI-driven tampering detection, and face verification, then combines all four
into a single risk score and decision (Clear / Secondary Review / Deny).

This is an **idea/prototype submission**, not a production system. The database is a small seeded dummy
dataset, and detection thresholds are tuned for demo clarity rather than operational accuracy.

## How it maps to the problem statement

| Module | Implementation |
|---|---|
| Module 1 — OCR Extraction | Hybrid pipeline: `src/lib/openai.ts` (GPT-4o-class vision) reads and structures the fields (name, document number, dates, visa fields, etc.), while `src/lib/ocrEngine.ts` runs **Tesseract** — a real, deterministic OCR engine — over the same image to get pixel-measured text geometry independent of the LLM. Each extracted field value is then located in Tesseract's real word grid (`locateFieldValue`, with date-format candidates generated for ISO dates like `dateOfBirth`) so the `/verify` view can draw a precisely-measured box around *where that field actually is on the page* — a field is only boxed when a real OCR match clears the similarity threshold, never guessed. A production deployment would swap Tesseract for a cloud OCR/document-AI API (e.g. Google Cloud Vision / Document AI) for higher accuracy; the interface (`runOcr`) is isolated in one file specifically so that swap is a single-file change. |
| Module 2 — Document Validation | `src/lib/icao9303.ts` dispatches by document type against the standard that actually governs it (see **Standards referenced** below), not one blanket rulebook: TD3 MRZ check-digit arithmetic for passports, TD1 MRZ arithmetic for national IDs/permits (ICAO 9303 Part 5) and driving licences (ISO/IEC 18013, same TD1 math, correctly cited as a different standard), and field-level rules for visas. |
| Module 3 — Tampering Detection | `src/lib/openai.ts` (`analyzeTampering`) for AI-based photo/text/stamp forensic analysis with per-finding bounding boxes, plus `src/lib/metadata.ts` for EXIF-based editing-software/timestamp anomaly checks, plus an **independent OCR cross-check**: Tesseract re-reads the MRZ on its own and is compared character-for-character against the vision model's transcription (`crossVerifyMrzWithOcr`) — disagreement between two independent readings is itself a tampering/quality signal, and is only raised when Tesseract actually found MRZ-shaped text (never asserted on a guess). |
| Module 4 — Face Verification | `compareFaces` (visual similarity vs. a live photo), `assessPortraitQuality` (ISO/IEC 19794-5 portrait conformance — pose, lighting, background, obstruction), and `assessLiveness` (ISO/IEC 30107 presentation-attack heuristics — screen/print/replay indicators on the live capture). All three are prototype-grade LLM visual estimates, not certified biometric-grade measurements. |
| Risk scoring | `src/lib/riskScore.ts` combines all of the above plus a database/blacklist cross-check (`src/lib/dbMatch.ts`, modeled on INTERPOL's SLTD watchlist concept) into a 0–100 score and a Clear/Secondary Review/Deny decision. Thresholds are deliberately narrow around the middle band so most screenings resolve to a confident Clear or Deny rather than defaulting to Secondary Review. |

## Standards referenced

Different document types are genuinely governed by different standards — the validation logic cites the one that actually applies to each, rather than applying ICAO 9303 everywhere:

| Standard | Used for |
|---|---|
| **ICAO Doc 9303** (Parts 3–5) | MRZ check-digit arithmetic and field rules for passports (TD3), national IDs and permits (TD1) |
| **ISO/IEC 18013** | Driving licence MRZ layout/validation (reuses the TD1 check-digit math ICAO defined, correctly attributed to the licence standard rather than the passport one) |
| **ISO/IEC 7810** | Physical ID-1/ID-3 card and booklet-page dimensions |
| **ISO/IEC 19794-5** | Facial portrait quality (pose, lighting, background, obstruction) applied to the document photo |
| **ISO/IEC 30107** (Presentation Attack Detection) | Anti-spoofing/liveness heuristics applied to the live-capture selfie |
| **INTERPOL SLTD** (Stolen and Lost Travel Documents database) | Conceptual model for the blacklist's `source` attribution — the seeded data is fictional, but the schema distinguishes a "national watchlist" hit from a "simulated INTERPOL SLTD" hit the way a real deployment would |

## Tech stack

- **Frontend/Backend:** Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Database:** SQLite via Prisma ORM (dummy, file-based — zero setup)
- **AI:** OpenAI GPT-4o-class vision model (field structuring, tampering/portrait/liveness analysis, face comparison)
- **OCR:** Tesseract.js (real pixel-measured text + geometry, independent cross-check against the vision model)
- **Charts:** Recharts

## Prerequisites

- Node.js 20+
- An OpenAI API key with access to a vision-capable chat model (default: `gpt-4o-mini`)

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your OpenAI key:

```bash
cp .env.example .env
```

```env
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
DATABASE_URL="file:./prisma/dev.db"
```

## 3. Seed the dummy database

The system ships with a small SQLite database containing fabricated passport records and blacklist entries,
used only to demonstrate database cross-checking (record match, expired-document detection, blacklist hits,
and multiple-identity/alias detection). No real personal data is used.

```bash
npm run db:push    # creates prisma/dev.db from the schema
npm run db:seed    # populates it with dummy records
```

To wipe and reseed later:

```bash
npm run db:reset
```

You can inspect the data visually at any time with:

```bash
npm run db:studio
```

### Seeded scenarios

- `P1234567` — ARJUN RAJESH SHARMA, active Indian passport
- `P9871234` — RAVI KUMAR SHARMA, same date of birth as the record above but a different document number
  (demonstrates the "multiple identities used by the same person" flag)
- `P1122334` — MOHAMMED AASIF KHAN, expired **and** on the blacklist (demonstrates a hard Deny decision)
- `P5566778`, `N3344556` — blacklist-only entries (stolen passport / forged national ID history)

## 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Screen Document** (`/verify`) — upload a document image (and optionally a live photo) to run the full
  pipeline.
- **Risk Dashboard** (`/dashboard`) — aggregate stats and charts across all screenings.
- **Reference Records** (`/records`) — browse the dummy person and blacklist database.
- **Audit Trail** (`/audit`) — every screening is logged for investigation/intelligence purposes.

### Trying it without a real document

`testimages/` in this repo has six synthetic sample documents (fictional "Republic of Testland" issuer) with
correctly computed MRZ check digits, ready to drag into `/verify`:

| File | Scenario |
|---|---|
| `passport_valid_active.png` | Clean passport, matches a seeded active record — expect a Clear decision |
| `passport_blacklisted_expired.png` | Expired **and** blacklisted passport — expect a hard Deny |
| `passport_tampered_demo.png` | Passport with a deliberately broken MRZ expiry check digit and an inconsistent font on the passport-number field — expect validation failures and a lower tampering score |
| `national_id_valid.png` | National ID with a valid TD1 (3-line) MRZ, and a date of birth that matches another seeded record under a different document number — demonstrates the multiple-identity/alias flag |
| `visa_valid.png` | Visa with no MRZ — exercises the visa field-level validation path (visa number/type, entry validity, stay duration) |
| `driving_license_valid.png` | Driving licence with no MRZ — exercises the ISO/IEC 18013 field-level path |

Any clear photo of a real ID-like document also works. For the MRZ checksum checks to pass, the document needs
a machine-readable zone with correctly computed check digits — most real passports, and many national ID
cards, already have this.

## 5. Build for production

```bash
npm run build
npm run start
```

## Deployment notes

This prototype is built to run anywhere Next.js runs (Node.js server), for example:

- **Vercel** — works for the app itself, but SQLite (`prisma/dev.db`) does **not** persist on Vercel's
  serverless filesystem. For a persistent hosted demo, swap `DATABASE_URL` for a hosted Postgres/MySQL
  instance (e.g. Neon, Supabase, Railway) and update `prisma/schema.prisma`'s `provider` accordingly — the
  rest of the code is database-agnostic through Prisma.
- **Railway / Render / a VM** — SQLite works as-is since the filesystem persists between requests.

## Project structure

```
prisma/
  schema.prisma       Person, blacklist, and verification-log models
  seed.ts              Dummy data seeding script
testimages/            Synthetic sample documents for demoing every screening scenario
src/
  lib/
    openai.ts          GPT-4o vision calls: field extraction, tampering/portrait/liveness analysis, face comparison
    ocrEngine.ts         Real Tesseract OCR: pixel-measured text boxes + MRZ line detection + text-similarity scoring
    icao9303.ts         MRZ checksum (TD3 + TD1) + per-document-type field validation rules + OCR cross-verification
    metadata.ts         EXIF-based tampering heuristics
    dbMatch.ts           Database/blacklist/alias cross-checking
    riskScore.ts         Combines all signals into a risk score and decision
  app/
    verify/             Document screening UI
    dashboard/          Risk statistics dashboard
    records/            Dummy database browser
    audit/              Verification log / audit trail
    api/                 verify, records, logs, stats endpoints
```

## Limitations (by design, for this prototype)

- Face verification, tampering detection, portrait quality and liveness all rely on an LLM's visual reasoning
  rather than a dedicated biometric/forensic model — good enough to demonstrate the concept, not a certified
  measurement. Tesseract OCR is the one component that's a real, deterministic engine rather than an LLM guess.
- MRZ checksum validation covers TD3 (passports) and TD1 (national IDs/permits/driving licences); visas are
  validated on field-level rules only (no MRV-A/MRV-B checksum arithmetic yet).
- The document/photo outline boxes drawn over the image are the vision model's approximate estimate for
  visual reference only, and are **not** used in scoring — only the MRZ box, when Tesseract actually measures
  it from real pixel data, is treated as precise. An earlier version scored an AI-guessed document aspect
  ratio as a pass/fail check; it was removed because an unreliable estimate presented as a precise measurement
  is worse than not measuring it at all.
- The seeded database is fictional and small, intended purely to demonstrate cross-checking logic.
- First run downloads Tesseract's English language data from a CDN (a few MB, cached afterward) — needs
  internet access the first time `/verify` is used.
