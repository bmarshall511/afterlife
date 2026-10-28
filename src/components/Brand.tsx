import type { GameFamily } from "@/shared/types";

export function Wordmark({ size = "md", tagline = true }: { size?: "sm" | "md" | "lg"; tagline?: boolean }) {
  return (
    <div className={`wordmark wm-${size}`}>
      <div className="wm-name">AFTERLIFE</div>
      <span className="wm-dot" aria-hidden="true" />
      {tagline && <div className="wm-tag">A Día de los Muertos party game</div>}
    </div>
  );
}

export const FAMILY: Record<GameFamily, { title: string; sub: string; how: string; icon: string }> = {
  memory: { title: "La Memoria", sub: "Look closely. Remember everything.", how: "A scene appears for a few seconds. Then it vanishes — and we ask about it.", icon: "eye" },
  truth: { title: "¿Verdad o Inventado?", sub: "True, or invented?", how: "Read the statement. Decide with your family: real tradition, or made up?", icon: "scale" },
  difference: { title: "Las Diferencias", sub: "Something changed.", how: "Compare the two altars. Pick the region where they differ.", icon: "split" },
  reveal: { title: "La Revelación", sub: "Watch it appear.", how: "The picture sharpens over time. Lock in as soon as you know.", icon: "sparkle" },
  altar: { title: "El Altar", sub: "Read the ofrenda.", how: "Study the altar and the clue. Find the offering that belongs.", icon: "candle" },
  family: { title: "La Familia", sub: "Know your crowd.", how: "First, pick your family's favorite. Then guess what most families chose.", icon: "people" },
};
