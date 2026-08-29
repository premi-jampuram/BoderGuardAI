import OpenAI from "openai";
import { BoundingBox, DocumentType, ExtractedFields, FaceMatchResult, LivenessResult, PortraitQualityResult, TamperingResult } from "./types";

/**
 * Boxes are requested from the model as 0-100 integer percentages (more reliable for
 * vision models to produce consistently than raw 0-1 decimals), then normalized here:
 * clamped to range, reordered so x1<=x2/y1<=y2 (models sometimes swap corners), and
 * rejected if degenerate (near-zero area, usually a hallucinated point rather than a box).
 */
function parseBoundingBox(value: unknown): BoundingBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const raw = value.map(Number);
  if (raw.some((n) => Number.isNaN(n))) return null;

  const scale = raw.some((n) => n > 1) ? 100 : 1;
  const norm = raw.map((n) => Math.min(1, Math.max(0, n / scale)));

  const x1 = Math.min(norm[0], norm[2]);
  const x2 = Math.max(norm[0], norm[2]);
  const y1 = Math.min(norm[1], norm[3]);
  const y2 = Math.max(norm[1], norm[3]);

  if (x2 - x1 < 0.02 || y2 - y1 < 0.02) return null;

  return [x1, y1, x2, y2];
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

const EXTRACTION_PROMPT = `You are a document examiner. Different document types follow different standards, and not all of them use a machine-readable zone (MRZ) — do not assume one is present:
- Passports follow ICAO Document 9303 TD3 format (2 MRZ lines of 44 characters).
- Visas may carry an ICAO 9303 MRV-A/MRV-B zone, or none at all if visa-controlled purely through a database record.
- National IDs sometimes carry an ICAO 9303 Part 5 TD1 zone (3 lines of 30 characters) if issued as a travel-usable ID, but many national IDs have no MRZ.
- Driving licenses are governed by ISO/IEC 18013 and, in the US/Canada, AAMVA — most encode data in a PDF417 barcode rather than a printed MRZ, so mrzLine1-3 will typically be null.
- Permits are largely country-specific (e.g. EU Reg 1030/2002 for EU residence permits) with no standard machine-readable zone.

Only fill mrzLine1/2/3 if you can actually see printed monospaced machine-readable text on the document — never infer or fabricate MRZ lines just because a document type can sometimes have one.
Analyze the provided identity/travel document image and extract all visible fields as JSON only, matching exactly this schema:

{
  "documentType": "PASSPORT" | "VISA" | "NATIONAL_ID" | "DRIVING_LICENSE" | "PERMIT",
  "fullName": string or null,
  "documentNumber": string or null,
  "nationality": string or null (3-letter ICAO/ISO country code if visible),
  "dateOfBirth": string or null (ISO 8601 YYYY-MM-DD),
  "dateOfIssue": string or null (ISO 8601 YYYY-MM-DD),
  "dateOfExpiry": string or null (ISO 8601 YYYY-MM-DD),
  "gender": "M" | "F" | "X" or null,
  "issuingCountry": string or null,
  "visaType": string or null (e.g. Tourist, Business, Transit, Student, Work, Diplomatic),
  "visaNumber": string or null,
  "entryValidUntil": string or null (ISO 8601 date),
  "stayDurationDays": number or null,
  "mrzLine1": string or null (verbatim machine-readable zone line 1 if visible, uppercase, using < for fillers),
  "mrzLine2": string or null (verbatim machine-readable zone line 2 if visible),
  "mrzLine3": string or null (verbatim machine-readable zone line 3, only present on 3-line TD1-format documents),
  "rawNotes": string or null (anything else worth noting about legibility or ambiguity),
  "documentBoundingBox": [x1, y1, x2, y2] — the tight bounding box of the physical document itself within the image, as INTEGER PERCENTAGES 0-100 of image width/height (0,0 = top-left corner, 100,100 = bottom-right corner), EXCLUDING background/table/hands. Always provide your best-effort estimate for this one, even a rough guess — only omit it if the document truly fills the entire frame edge-to-edge (then use [0,0,100,100]),
  "photoBoundingBox": [x1, y1, x2, y2] or null — the bounding box of the holder's portrait photo printed on the document, same 0-100 percentage scale. Null only if the document type has no printed portrait visible,
  "mrzBoundingBox": [x1, y1, x2, y2] or null — the bounding box of the machine-readable zone block (the row(s) of monospaced A-Z0-9< text), same 0-100 percentage scale. Null only if no MRZ is visible on this document
}

Respond with raw JSON only, no markdown fences, no commentary.`;

export async function extractDocumentFields(imageBase64: string, mimeType: string): Promise<ExtractedFields> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 1200,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(stripJsonFence(raw));

  return {
    documentType: (parsed.documentType ?? "PASSPORT") as DocumentType,
    fullName: parsed.fullName ?? null,
    documentNumber: parsed.documentNumber ?? null,
    nationality: parsed.nationality ?? null,
    dateOfBirth: parsed.dateOfBirth ?? null,
    dateOfIssue: parsed.dateOfIssue ?? null,
    dateOfExpiry: parsed.dateOfExpiry ?? null,
    gender: parsed.gender ?? null,
    issuingCountry: parsed.issuingCountry ?? null,
    visaType: parsed.visaType ?? null,
    visaNumber: parsed.visaNumber ?? null,
    entryValidUntil: parsed.entryValidUntil ?? null,
    stayDurationDays: parsed.stayDurationDays ?? null,
    mrzLine1: parsed.mrzLine1 ?? null,
    mrzLine2: parsed.mrzLine2 ?? null,
    mrzLine3: parsed.mrzLine3 ?? null,
    rawNotes: parsed.rawNotes ?? null,
    documentBoundingBox: parseBoundingBox(parsed.documentBoundingBox) ?? [0, 0, 1, 1],
    photoBoundingBox: parseBoundingBox(parsed.photoBoundingBox),
    mrzBoundingBox: parseBoundingBox(parsed.mrzBoundingBox),
  };
}

const TAMPERING_PROMPT = `You are a forensic document examiner specializing in detecting tampering in identity and travel documents, per ICAO Document 9303 security guidance.
Examine the image closely for signs of:
- Photo replacement or substitution (edge halos, mismatched lighting/resolution around the photo, ghosting)
- Text manipulation (inconsistent fonts, spacing, alignment, or font weight in printed fields)
- Stamp or seal forgery (blurred, misaligned, or inconsistently colored official stamps/holograms)
- Digital splicing artifacts (compression inconsistencies, unnatural edges, color banding)

Respond with raw JSON only, matching exactly:
{
  "tamperingScore": number (0-100, where 0 = no signs of tampering, 100 = certain tampering),
  "flags": [{"area": string, "description": string, "severity": "LOW" | "MEDIUM" | "HIGH", "boundingBox": [x1, y1, x2, y2] or null (the region of the image where this issue is visible, as INTEGER PERCENTAGES 0-100 of image width/height — always include your best-effort box for every flag you raise)}],
  "summary": string (2-3 sentences)
}

No markdown fences, no commentary outside the JSON.`;

export async function analyzeTampering(imageBase64: string, mimeType: string): Promise<TamperingResult> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: TAMPERING_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 800,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(stripJsonFence(raw));

  const flags = Array.isArray(parsed.flags)
    ? parsed.flags.map((f: Record<string, unknown>) => ({
        area: String(f.area ?? "Unspecified"),
        description: String(f.description ?? ""),
        severity: (f.severity as "LOW" | "MEDIUM" | "HIGH") ?? "LOW",
        boundingBox: parseBoundingBox(f.boundingBox),
      }))
    : [];

  return {
    tamperingScore: typeof parsed.tamperingScore === "number" ? parsed.tamperingScore : 0,
    flags,
    summary: parsed.summary ?? "No summary provided.",
    metadataFlags: [],
  };
}

const FACE_MATCH_PROMPT = `You are assisting a border security screening prototype. You are given two images: the first is a photo extracted from an identity document, the second is a live-captured photo of the person presenting the document.
Assess visually whether these two photos plausibly depict the same individual, considering facial structure, proportions, and features while allowing for differences in age, lighting, and angle.

Respond with raw JSON only, matching exactly:
{
  "similarityScore": number (0-100, confidence the two photos show the same person),
  "reasoning": string (2-3 sentences explaining your visual assessment)
}

This is a prototype-grade visual estimate, not a biometric-grade match. No markdown fences, no commentary outside the JSON.`;

export async function compareFaces(docImageBase64: string, docMime: string, selfieBase64: string, selfieMime: string): Promise<FaceMatchResult> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: FACE_MATCH_PROMPT },
          { type: "image_url", image_url: { url: `data:${docMime};base64,${docImageBase64}` } },
          { type: "image_url", image_url: { url: `data:${selfieMime};base64,${selfieBase64}` } },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 400,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(stripJsonFence(raw));

  return {
    performed: true,
    similarityScore: typeof parsed.similarityScore === "number" ? parsed.similarityScore : null,
    reasoning: parsed.reasoning ?? "No reasoning provided.",
  };
}

const PORTRAIT_QUALITY_PROMPT = `You are a biometric quality examiner applying ISO/IEC 19794-5 (the international standard for facial images on machine-readable travel documents) to the portrait photo printed on this identity document.
Assess the portrait against ISO/IEC 19794-5's core criteria:
- Frontal pose, eyes open, neutral expression, no head tilt/rotation
- Uniform, even lighting with no strong shadows, glare or red-eye
- Plain, uncluttered background (no other people or objects visible)
- No obstruction of the face (sunglasses, hand, hair, heavy shadow) and no head covering except for documented religious/medical reasons
- Adequate sharpness/resolution and correct head size/framing within the photo

Respond with raw JSON only, matching exactly:
{
  "conformant": boolean (true if the portrait meets ISO/IEC 19794-5 expectations overall),
  "qualityScore": number (0-100, overall conformance score),
  "issues": string[] (short list of specific non-conformances found; empty array if none),
  "reasoning": string (2-3 sentences)
}

No markdown fences, no commentary outside the JSON.`;

export async function assessPortraitQuality(imageBase64: string, mimeType: string): Promise<PortraitQualityResult> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PORTRAIT_QUALITY_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(stripJsonFence(raw));

  return {
    performed: true,
    conformant: typeof parsed.conformant === "boolean" ? parsed.conformant : null,
    qualityScore: typeof parsed.qualityScore === "number" ? parsed.qualityScore : null,
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    reasoning: parsed.reasoning ?? "No reasoning provided.",
  };
}

const LIVENESS_PROMPT = `You are a biometric anti-spoofing examiner applying the ISO/IEC 30107 Presentation Attack Detection (PAD) framework to a live-capture photo submitted for identity verification.
Look for presentation-attack indicators such as:
- Screen bezels, moire/pixel-grid patterns, or glare consistent with photographing a phone/monitor screen
- Print artifacts (paper texture, cut edges, staple holes, a photo held by a visible hand)
- Unnatural flatness, lack of depth cues, or a second face/photo visible behind the main subject
- Mask-like or unnaturally uniform skin texture

Respond with raw JSON only, matching exactly:
{
  "livenessScore": number (0-100, confidence this is a genuine live capture rather than a presentation attack; 100 = confidently live),
  "attackIndicators": string[] (specific indicators observed; empty array if none),
  "reasoning": string (2-3 sentences)
}

This is a prototype-grade heuristic, not a certified ISO/IEC 30107-3 laboratory test. No markdown fences, no commentary outside the JSON.`;

export async function assessLiveness(selfieBase64: string, mimeType: string): Promise<LivenessResult> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: LIVENESS_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${selfieBase64}` } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 400,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(stripJsonFence(raw));

  return {
    performed: true,
    livenessScore: typeof parsed.livenessScore === "number" ? parsed.livenessScore : null,
    attackIndicators: Array.isArray(parsed.attackIndicators) ? parsed.attackIndicators.map(String) : [],
    reasoning: parsed.reasoning ?? "No reasoning provided.",
  };
}
