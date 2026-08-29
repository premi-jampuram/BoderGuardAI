"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import RiskBadge from "@/components/RiskBadge";
import type {
  DatabaseMatch,
  DocumentType,
  ExtractedFields,
  FaceMatchResult,
  LivenessResult,
  PortraitQualityResult,
  RiskBreakdownItem,
  TamperingResult,
  ValidationResult,
} from "@/lib/types";

// The applicable field-validation standard differs by document type — passports and some
// national IDs/visas follow ICAO 9303, driving licenses follow ISO/IEC 18013 (AAMVA in the
// US/Canada), and permits are largely country-specific with no shared machine-readable standard.
export const VALIDATION_STANDARD_LABEL: Record<DocumentType, string> = {
  PASSPORT: "ICAO 9303 (TD3)",
  VISA: "ICAO 9303 / Visa Field",
  NATIONAL_ID: "ICAO 9303 Part 5 (TD1)",
  DRIVING_LICENSE: "ISO/IEC 18013",
  PERMIT: "Permit Field",
};

export const EXCLUDED_FIELD_KEYS = ["mrzLine1", "mrzLine2", "mrzLine3", "rawNotes", "documentBoundingBox", "photoBoundingBox", "mrzBoundingBox"];

function CheckRow({ pass, name, detail, critical }: { pass: boolean; name: string; detail: string; critical?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border last:border-b-0">
      {pass ? (
        <CheckCircle2 className="text-muted shrink-0 mt-0.5" size={16} />
      ) : (
        <XCircle className={`shrink-0 mt-0.5 ${critical ? "text-foreground" : "text-muted"}`} size={16} />
      )}
      <div className="text-sm">
        <div className={`font-medium ${!pass ? "text-foreground" : ""}`}>
          {name} {!pass && critical && <span className="text-xs font-semibold uppercase tracking-wide ml-1">critical</span>}
        </div>
        <div className="text-xs text-muted">{detail}</div>
      </div>
    </div>
  );
}

interface AddToBlacklistProps {
  documentNumber: string | null;
  fullName: string | null;
  riskLevel: string;
}

function AddToBlacklist({ documentNumber, fullName, riskLevel }: AddToBlacklistProps) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  if (!documentNumber) return null;

  async function handleAdd() {
    setState("saving");
    try {
      const res = await fetch("/api/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentNumber,
          fullName: fullName ?? "Unknown",
          reason: "Flagged manually by an operator after screening review.",
          severity: riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH",
          source: "Manual Screening Flag",
        }),
      });
      if (!res.ok) throw new Error();
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <span className="text-xs font-medium">Added to blacklist.</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleAdd}
        disabled={state === "saving"}
        className="text-xs font-medium border border-border rounded-md px-2.5 py-1 hover:border-foreground disabled:opacity-50 transition-colors"
      >
        {state === "saving" ? "Adding..." : "Add to Blacklist"}
      </button>
      {state === "error" && <span className="text-xs text-muted">Failed — try again.</span>}
    </div>
  );
}

interface ResultPanelsProps {
  extracted: ExtractedFields;
  validation: ValidationResult;
  tampering: TamperingResult;
  faceMatch: FaceMatchResult;
  portraitQuality: PortraitQualityResult;
  liveness: LivenessResult;
  databaseMatch: DatabaseMatch;
  riskBreakdown: RiskBreakdownItem[];
  riskLevel: string;
}

export default function ResultPanels({
  extracted,
  validation,
  tampering,
  faceMatch,
  portraitQuality,
  liveness,
  databaseMatch,
  riskBreakdown,
  riskLevel,
}: ResultPanelsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="font-medium mb-3">Extracted Fields</h3>
        <dl className="text-sm space-y-1.5">
          {Object.entries(extracted)
            .filter(([k]) => !EXCLUDED_FIELD_KEYS.includes(k))
            .map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt className="text-muted capitalize">{key.replace(/([A-Z])/g, " $1")}</dt>
                <dd className="font-mono text-right">{value === null || value === "" ? "—" : String(value)}</dd>
              </div>
            ))}
        </dl>
        {(extracted.mrzLine1 || extracted.mrzLine2 || extracted.mrzLine3) && (
          <div className="mt-3 pt-3 border-t border-border font-mono text-xs text-muted break-all space-y-1">
            <div>{extracted.mrzLine1}</div>
            <div>{extracted.mrzLine2}</div>
            {extracted.mrzLine3 && <div>{extracted.mrzLine3}</div>}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">{VALIDATION_STANDARD_LABEL[extracted.documentType]} Validation</h3>
          <span className="text-xs text-muted">{validation.score}% pass rate</span>
        </div>
        {validation.checks.map((c, i) => (
          <CheckRow key={i} pass={c.pass} name={c.name} detail={c.detail} critical={c.critical} />
        ))}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Tampering Detection</h3>
          <span className="text-xs text-muted">Score: {tampering.tamperingScore}/100</span>
        </div>
        <p className="text-sm text-muted mb-3">{tampering.summary}</p>
        {tampering.flags.length === 0 ? (
          <div className="text-sm text-muted flex items-center gap-2">
            <CheckCircle2 size={16} /> No tampering indicators detected.
          </div>
        ) : (
          <div className="space-y-2">
            {tampering.flags.map((f, i) => (
              <div key={i} className="text-sm border-l-2 border-foreground pl-3">
                <span className="font-medium">
                  {f.area} <span className="text-xs text-muted">({f.severity})</span>
                </span>
                <span className="text-muted"> — {f.description}</span>
              </div>
            ))}
          </div>
        )}
        {tampering.metadataFlags.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted space-y-1">
            {tampering.metadataFlags.map((m, i) => (
              <div key={i}>{m}</div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="font-medium mb-3">Face Verification</h3>
        {faceMatch.performed ? (
          <>
            <div className="text-2xl font-semibold mb-1">{faceMatch.similarityScore}/100</div>
            <p className="text-sm text-muted">{faceMatch.reasoning}</p>
          </>
        ) : (
          <p className="text-sm text-muted">{faceMatch.reasoning}</p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Portrait Quality</h3>
          <span className="text-xs text-muted">ISO/IEC 19794-5</span>
        </div>
        {portraitQuality.qualityScore !== null ? (
          <>
            <div className="text-2xl font-semibold mb-1">{portraitQuality.qualityScore}/100</div>
            <p className="text-sm text-muted mb-2">{portraitQuality.reasoning}</p>
            {portraitQuality.issues.length > 0 && (
              <ul className="text-xs text-muted list-disc list-inside space-y-0.5">
                {portraitQuality.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">Portrait quality could not be assessed.</p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Liveness / Anti-Spoofing</h3>
          <span className="text-xs text-muted">ISO/IEC 30107 (PAD)</span>
        </div>
        {liveness.performed && liveness.livenessScore !== null ? (
          <>
            <div className="text-2xl font-semibold mb-1">{liveness.livenessScore}/100</div>
            <p className="text-sm text-muted mb-2">{liveness.reasoning}</p>
            {liveness.attackIndicators.length > 0 && (
              <ul className="text-xs text-muted list-disc list-inside space-y-0.5">
                {liveness.attackIndicators.map((indicator, i) => (
                  <li key={i}>{indicator}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">{liveness.reasoning}</p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Database Cross-Check</h3>
          <AddToBlacklist documentNumber={extracted.documentNumber} fullName={extracted.fullName} riskLevel={riskLevel} />
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted">Record match:</span>
            <span className="font-medium">{databaseMatch.found ? databaseMatch.status : "Not found"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted">Blacklist:</span>
            {databaseMatch.blacklisted ? <RiskBadge level="CRITICAL" /> : <span className="text-muted">Clear</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted">Multiple identity signal:</span>
            {databaseMatch.possibleAlias ? <RiskBadge level="HIGH" /> : <span className="text-muted">None</span>}
          </div>
        </div>
        {databaseMatch.blacklistReason && (
          <p className="text-sm text-muted mt-2">
            {databaseMatch.blacklistReason}
            {databaseMatch.blacklistSource && ` — Source: ${databaseMatch.blacklistSource}`}
          </p>
        )}
        {databaseMatch.aliasDetail && <p className="text-sm text-muted mt-2">{databaseMatch.aliasDetail}</p>}
        {databaseMatch.recordFlagged && (
          <p className="text-sm text-muted mt-2">
            <span className="font-medium text-foreground">Reference record updated to FLAGGED</span> — {databaseMatch.recordFlagReason}
          </p>
        )}
        {databaseMatch.nearBlacklistMatch && (
          <p className="text-sm text-muted mt-2">
            <span className="font-medium text-foreground">Near-match to a blacklisted document</span> — {databaseMatch.nearBlacklistMatch.distance}{" "}
            character(s) different from {databaseMatch.nearBlacklistMatch.fullName} ({databaseMatch.nearBlacklistMatch.documentNumber}).
          </p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 lg:col-span-2">
        <h3 className="font-medium mb-3">Risk Score Breakdown</h3>
        <div className="space-y-2">
          {riskBreakdown.map((b, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-sm border-b border-border last:border-b-0 py-1.5">
              <div>
                <div className="font-medium">{b.factor}</div>
                <div className="text-xs text-muted">{b.detail}</div>
              </div>
              <div className="font-mono text-xs text-muted shrink-0 pt-0.5">+{b.contribution}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
