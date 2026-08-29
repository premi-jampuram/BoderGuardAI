export type DocumentType = "PASSPORT" | "VISA" | "NATIONAL_ID" | "DRIVING_LICENSE" | "PERMIT";

export type BoundingBox = [number, number, number, number];

export interface ExtractedFields {
  documentType: DocumentType;
  fullName: string | null;
  documentNumber: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  dateOfIssue: string | null;
  dateOfExpiry: string | null;
  gender: string | null;
  issuingCountry: string | null;
  visaType: string | null;
  visaNumber: string | null;
  entryValidUntil: string | null;
  stayDurationDays: number | null;
  mrzLine1: string | null;
  mrzLine2: string | null;
  mrzLine3: string | null;
  rawNotes: string | null;
  documentBoundingBox: BoundingBox;
  photoBoundingBox: BoundingBox | null;
  mrzBoundingBox: BoundingBox | null;
}

export interface FieldBox {
  field: string;
  label: string;
  box: BoundingBox;
}

export interface FieldCheck {
  name: string;
  pass: boolean;
  detail: string;
  /** Set on checks whose failure alone indicates a disqualifying problem (expired validity, a forged
   * checksum, a rule violation) rather than a minor extraction gap — these are weighted far more heavily
   * in the risk score than an average across all checks would give them. */
  critical?: boolean;
}

export interface ValidationResult {
  checks: FieldCheck[];
  passCount: number;
  failCount: number;
  score: number;
}

export interface TamperingFlag {
  area: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  boundingBox: BoundingBox | null;
}

export interface TamperingResult {
  tamperingScore: number;
  flags: TamperingFlag[];
  summary: string;
  metadataFlags: string[];
}

export interface FaceMatchResult {
  performed: boolean;
  similarityScore: number | null;
  reasoning: string;
}

/** ISO/IEC 19794-5 defines the portrait quality/pose/lighting requirements used for machine-readable travel documents. */
export interface PortraitQualityResult {
  performed: boolean;
  conformant: boolean | null;
  qualityScore: number | null;
  issues: string[];
  reasoning: string;
}

/** ISO/IEC 30107 (Biometric Presentation Attack Detection) framework applied heuristically to the live capture. */
export interface LivenessResult {
  performed: boolean;
  livenessScore: number | null;
  attackIndicators: string[];
  reasoning: string;
}

export interface NearBlacklistMatch {
  documentNumber: string;
  fullName: string;
  distance: number;
}

export interface DatabaseMatch {
  found: boolean;
  status: string | null;
  blacklisted: boolean;
  blacklistReason: string | null;
  blacklistSource: string | null;
  possibleAlias: boolean;
  aliasDetail: string | null;
  recordFlagged: boolean;
  recordFlagReason: string | null;
  /** Set when the document number wasn't an exact blacklist hit but is within a couple of edit-distance
   * characters of one — catches a typo'd/altered digit on a genuinely blacklisted number, or a forgery
   * derived from one, that an exact lookup alone would miss. */
  nearBlacklistMatch: NearBlacklistMatch | null;
}

export interface RiskBreakdownItem {
  factor: string;
  contribution: number;
  detail: string;
}

export interface VerificationResponse {
  extracted: ExtractedFields;
  validation: ValidationResult;
  tampering: TamperingResult;
  faceMatch: FaceMatchResult;
  portraitQuality: PortraitQualityResult;
  liveness: LivenessResult;
  databaseMatch: DatabaseMatch;
  /** true when mrzBoundingBox came from real Tesseract OCR measurement rather than a vision-model guess. */
  mrzBoxMeasured: boolean;
  /** Per-field boxes, real OCR-measured — only present for fields Tesseract actually located on the page. */
  fieldBoxes: FieldBox[];
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  decision: "CLEAR" | "SECONDARY_REVIEW" | "DENY";
  riskBreakdown: RiskBreakdownItem[];
  logId: string;
}
