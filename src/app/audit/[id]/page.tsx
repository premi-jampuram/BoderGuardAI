"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DecisionBanner from "@/components/DecisionBanner";
import ResultPanels from "@/components/ResultPanels";
import type {
  DatabaseMatch,
  ExtractedFields,
  FaceMatchResult,
  LivenessResult,
  PortraitQualityResult,
  RiskBreakdownItem,
  TamperingResult,
  ValidationResult,
} from "@/lib/types";

interface LogDetail {
  id: string;
  documentType: string;
  extractedData: ExtractedFields;
  mrzRaw: string | null;
  validationResult: ValidationResult;
  tamperingResult: TamperingResult;
  faceMatchResult: FaceMatchResult;
  portraitQualityResult: PortraitQualityResult;
  livenessResult: LivenessResult;
  databaseMatch: DatabaseMatch;
  riskBreakdown: RiskBreakdownItem[];
  riskScore: number;
  riskLevel: string;
  decision: string;
  createdAt: string;
}

export default function AuditDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [log, setLog] = useState<LogDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/logs/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setLog)
      .catch(() => setNotFound(true));
  }, [params.id]);

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <button
        onClick={() => router.push("/audit")}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={15} /> Back to audit trail
      </button>

      {notFound ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-muted text-sm">
          This screening could not be found — it may have been from a database that&apos;s since been reset.
        </div>
      ) : !log ? (
        <p className="text-muted text-sm">Loading screening...</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">
              {log.extractedData.fullName ?? "Unnamed"} — {log.documentType}
            </h1>
            <p className="text-muted text-sm">
              Screened {new Date(log.createdAt).toLocaleString()}
              {log.mrzRaw && " · MRZ captured"}
            </p>
          </div>

          <DecisionBanner decision={log.decision} riskScore={log.riskScore} />

          <ResultPanels
            extracted={log.extractedData}
            validation={log.validationResult}
            tampering={log.tamperingResult}
            faceMatch={log.faceMatchResult}
            portraitQuality={log.portraitQualityResult}
            liveness={log.livenessResult}
            databaseMatch={log.databaseMatch}
            riskBreakdown={log.riskBreakdown}
            riskLevel={log.riskLevel}
          />
        </div>
      )}
    </div>
  );
}
