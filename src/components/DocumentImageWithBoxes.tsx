"use client";

import { useState } from "react";
import type { BoundingBox, FieldBox, TamperingFlag } from "@/lib/types";

interface Props {
  src: string;
  documentBox: BoundingBox | null;
  photoBox: BoundingBox | null;
  mrzBox: BoundingBox | null;
  fieldBoxes: FieldBox[];
  tamperingFlags: TamperingFlag[];
}

function boxStyle(box: BoundingBox): React.CSSProperties {
  const [x1, y1, x2, y2] = box;
  return {
    left: `${x1 * 100}%`,
    top: `${y1 * 100}%`,
    width: `${(x2 - x1) * 100}%`,
    height: `${(y2 - y1) * 100}%`,
  };
}

export default function DocumentImageWithBoxes({ src, documentBox, photoBox, mrzBox, fieldBoxes, tamperingFlags }: Props) {
  const [showOverlays, setShowOverlays] = useState(true);
  const flagsWithBoxes = tamperingFlags.filter((f) => f.boundingBox);

  const hasAnyBox = documentBox || photoBox || mrzBox || fieldBoxes.length > 0 || flagsWithBoxes.length > 0;

  return (
    <div>
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Screened document" className="rounded-lg max-h-96 mx-auto object-contain border border-border" />
        {showOverlays && (
          <>
            {documentBox && (
              <div className="absolute border-2 border-foreground pointer-events-none" style={boxStyle(documentBox)}>
                <span className="absolute -top-5 left-0 text-[10px] font-mono bg-foreground text-background px-1">DOCUMENT</span>
              </div>
            )}
            {photoBox && (
              <div className="absolute border-2 border-dashed border-foreground pointer-events-none" style={boxStyle(photoBox)}>
                <span className="absolute -top-5 left-0 text-[10px] font-mono bg-surface border border-border px-1">PHOTO</span>
              </div>
            )}
            {mrzBox && (
              <div className="absolute border border-dotted border-foreground pointer-events-none" style={boxStyle(mrzBox)}>
                <span className="absolute -top-5 left-0 text-[10px] font-mono bg-surface border border-border px-1">MRZ</span>
              </div>
            )}
            {fieldBoxes.map((fb, i) => (
              <div key={i} className="absolute border border-[var(--muted)] pointer-events-none" style={boxStyle(fb.box)}>
                <span className="absolute -top-4 left-0 text-[9px] font-mono bg-surface-alt border border-border text-foreground px-1 whitespace-nowrap">
                  {fb.label}
                </span>
              </div>
            ))}
            {flagsWithBoxes.map((f, i) => (
              <div key={i} className="absolute border-2 border-foreground border-dashed pointer-events-none" style={boxStyle(f.boundingBox!)}>
                <span className="absolute -bottom-5 left-0 text-[10px] font-mono bg-foreground text-background px-1 whitespace-nowrap">
                  {f.severity}: {f.area}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
      {hasAnyBox && (
        <button
          onClick={() => setShowOverlays((v) => !v)}
          className="mt-2 text-xs text-muted hover:text-foreground underline underline-offset-2"
        >
          {showOverlays ? "Hide" : "Show"} detected regions
        </button>
      )}
    </div>
  );
}
