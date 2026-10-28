"use client";

/** Renders a tribute exactly as the TV lays it out: photo left (contain/cover + focal), name and remembrance beside. */
export interface PreviewProps {
  photoUrl: string | null;
  personName: string;
  remembrance: string;
  attribution: string;
  fit: "contain" | "cover";
  focalX: number;
  focalY: number;
  onPhotoTap?: (x: number, y: number) => void;
}

export default function TributePreview(p: PreviewProps) {
  return (
    <div className="tp" aria-label="Preview of how this will appear on the party TV">
      <div className="tp-inner">
        <div
          className="tp-photo"
          onClick={(e) => {
            if (!p.onPhotoTap) return;
            const r = e.currentTarget.getBoundingClientRect();
            p.onPhotoTap((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          }}
          style={{ cursor: p.onPhotoTap && p.fit === "cover" ? "crosshair" : undefined }}
        >
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.photoUrl}
              alt={p.personName ? `Photo of ${p.personName}` : "Selected photo"}
              style={{ objectFit: p.fit, objectPosition: `${(p.focalX * 100).toFixed(1)}% ${(p.focalY * 100).toFixed(1)}%` }}
            />
          ) : null}
        </div>
        <div className="tp-text">
          <div className="tp-head">Siempre presentes · Always remembered</div>
          <div className="tp-name">{p.personName || "Their name"}</div>
          {p.remembrance ? <div className="tp-rem">{p.remembrance}</div> : null}
          {p.attribution ? <div className="tp-attr">— {p.attribution}</div> : null}
        </div>
      </div>
    </div>
  );
}
