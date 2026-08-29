import Link from "next/link";
import { ScanLine, FileCheck2, Fingerprint, ShieldAlert, ArrowRight } from "lucide-react";

const modules = [
  {
    icon: FileCheck2,
    title: "Module 1 — OCR Extraction",
    description:
      "Extracts name, document number, nationality, dates, gender, visa type and MRZ data from passports, visas, national IDs, driving licenses and permits using GPT-4 vision.",
  },
  {
    icon: ShieldAlert,
    title: "Module 2 — Document Validation",
    description:
      "Cross-checks extracted fields against ICAO Document 9303 rules: MRZ checksum digits, date logic, country codes and validity windows.",
  },
  {
    icon: ScanLine,
    title: "Module 3 — Tampering Detection",
    description:
      "AI-driven forensic scan for photo replacement, text manipulation, stamp forgery and splicing artifacts, plus image metadata analysis.",
  },
  {
    icon: Fingerprint,
    title: "Module 4 — Face Verification",
    description:
      "Compares the document photo against a live capture to flag likely identity mismatches and impersonation attempts.",
  },
];

export default function Home() {
  return (
    <div className="p-10 max-w-6xl mx-auto">
      <div className="mb-10">
        <span className="inline-block text-xs font-medium tracking-wide text-accent bg-accent-soft px-3 py-1 rounded-full mb-4">
          SIH Hackathon Prototype
        </span>
        <h1 className="text-3xl font-semibold tracking-tight mb-3">
          AI-Based Fake Identity &amp; Document Screening System
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Border checkpoints screen thousands of identity and travel documents daily. This platform automates
          OCR extraction, standards-aware field validation (ICAO 9303, ISO/IEC 18013 and country-specific rules
          depending on document type), tampering detection and face verification into a single risk score —
          helping personnel make faster, more consistent decisions.
        </p>
        <Link
          href="/verify"
          className="inline-flex items-center gap-2 mt-6 bg-accent hover:opacity-80 transition-opacity text-background text-sm font-medium px-5 py-2.5 rounded-lg"
        >
          Screen a Document <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {modules.map(({ icon: Icon, title, description }) => (
          <div key={title} className="bg-surface border border-border rounded-xl p-5">
            <Icon className="text-accent mb-3" size={22} />
            <h3 className="font-medium mb-1.5">{title}</h3>
            <p className="text-sm text-muted leading-relaxed">{description}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-medium mb-3">Expected Impact</h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted">
          <li>&bull; Verification time reduced from minutes to seconds</li>
          <li>&bull; Improved detection of forged and tampered documents</li>
          <li>&bull; Standardized, auditable screening decisions</li>
          <li>&bull; Digital trail for investigations and intelligence analysis</li>
        </ul>
      </div>
    </div>
  );
}
