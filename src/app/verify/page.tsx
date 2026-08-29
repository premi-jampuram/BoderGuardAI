"use client";

import { useEffect, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import DecisionBanner from "@/components/DecisionBanner";
import DocumentImageWithBoxes from "@/components/DocumentImageWithBoxes";
import ResultPanels from "@/components/ResultPanels";
import type { VerificationResponse } from "@/lib/types";

function FileDrop({
  label,
  file,
  preview,
  onChange,
  required,
}: {
  label: string;
  file: File | null;
  preview: string | null;
  onChange: (f: File | null, preview: string | null) => void;
  required?: boolean;
}) {
  return (
    <label className="flex-1 border border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-foreground transition-colors bg-surface block">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onChange(f, f ? URL.createObjectURL(f) : null);
        }}
      />
      <div className="text-sm font-medium mb-2">
        {label} {required && <span>*</span>}
      </div>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={label} className="rounded-lg max-h-48 mx-auto object-contain" />
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-muted">
          <Upload size={22} className="mb-2" />
          <span className="text-xs">{file ? file.name : "Click to upload an image"}</span>
        </div>
      )}
    </label>
  );
}

// Verify is a client component, so its state is lost whenever the sidebar navigates away and the
// component unmounts. Persisting the last result to sessionStorage (private to this tab, cleared only
// when a new screening is run) lets a reviewer check the dashboard or records and come straight back to
// what they were looking at.
const LAST_RESULT_KEY = "borderguard:lastVerification";

interface PersistedVerification {
  result: VerificationResponse;
  documentPreview: string | null;
}

export default function VerifyPage() {
  const [document, setDocument] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResponse | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return;
    try {
      const saved: PersistedVerification = JSON.parse(raw);
      // sessionStorage only exists client-side, so this can't be read during the initial render without
      // causing a server/client hydration mismatch — it has to be an effect, not a lazy useState init.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(saved.result);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocumentPreview(saved.documentPreview);
    } catch {
      sessionStorage.removeItem(LAST_RESULT_KEY);
    }
  }, []);

  async function handleSubmit() {
    if (!document) return;
    setLoading(true);
    setError(null);
    setResult(null);
    sessionStorage.removeItem(LAST_RESULT_KEY);

    try {
      const formData = new FormData();
      formData.append("document", document);
      if (selfie) formData.append("selfie", selfie);

      const res = await fetch("/api/verify", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Verification failed.");
      }

      setResult(data);
      sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify({ result: data, documentPreview } satisfies PersistedVerification));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleNewScreening() {
    setDocument(null);
    setDocumentPreview(null);
    setSelfie(null);
    setSelfiePreview(null);
    setResult(null);
    setError(null);
    sessionStorage.removeItem(LAST_RESULT_KEY);
  }

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Screen a Document</h1>
      <p className="text-muted text-sm mb-6">
        Upload a passport, visa, national ID, driving license or permit. Optionally add a live-captured photo
        for face verification.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <FileDrop
          label="Identity Document"
          file={document}
          preview={documentPreview}
          onChange={(f, p) => {
            setDocument(f);
            setDocumentPreview(p);
          }}
          required
        />
        <FileDrop
          label="Live Photo (optional)"
          file={selfie}
          preview={selfiePreview}
          onChange={(f, p) => {
            setSelfie(f);
            setSelfiePreview(p);
          }}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!document || loading}
        className="inline-flex items-center gap-2 bg-accent hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity text-background text-sm font-medium px-5 py-2.5 rounded-lg"
      >
        {loading && <Loader2 className="animate-spin" size={16} />}
        {loading ? "Analyzing document..." : "Run Screening"}
      </button>

      {error && (
        <div className="mt-6 border-2 border-foreground text-foreground rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <DecisionBanner decision={result.decision} riskScore={result.riskScore} />
            <button
              onClick={handleNewScreening}
              className="shrink-0 inline-flex items-center gap-2 border border-border hover:border-foreground transition-colors text-sm font-medium px-4 py-2.5 rounded-lg"
            >
              New Screening
            </button>
          </div>

          {documentPreview && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="font-medium mb-1">Document Regions</h3>
              <p className="text-xs text-muted mb-3">
                {result.mrzBoxMeasured ? "MRZ box and " : "No MRZ detected by OCR. "}
                {result.fieldBoxes.length > 0 ? "labeled field boxes" : ""} are measured directly from real OCR
                pixel data (Tesseract). The outer document/photo outlines are the vision model&apos;s approximate
                estimate for reference only — not used in scoring.
              </p>
              <DocumentImageWithBoxes
                src={documentPreview}
                documentBox={result.extracted.documentBoundingBox}
                photoBox={result.extracted.photoBoundingBox}
                mrzBox={result.extracted.mrzBoundingBox}
                fieldBoxes={result.fieldBoxes}
                tamperingFlags={result.tampering.flags}
              />
            </div>
          )}

          <ResultPanels
            extracted={result.extracted}
            validation={result.validation}
            tampering={result.tampering}
            faceMatch={result.faceMatch}
            portraitQuality={result.portraitQuality}
            liveness={result.liveness}
            databaseMatch={result.databaseMatch}
            riskBreakdown={result.riskBreakdown}
            riskLevel={result.riskLevel}
          />
        </div>
      )}
    </div>
  );
}
