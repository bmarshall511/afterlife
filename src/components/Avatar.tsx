/** Team avatar: engine ids (TEAM_AVATARS) → glyph on the team color. Unknown ids fall back to the initial. */
const GLYPH: Record<string, string> = {
  calavera: "💀", marigold: "🌼", candle: "🕯️", "papel-picado": "🎏", catrina: "👒", alebrije: "🐉",
  "pan-de-muerto": "🍞", butterfly: "🦋", "sugar-skull": "☠️", xolo: "🐕", hummingbird: "🐦", guitar: "🎸",
};
export function Avatar({ id, color, name, className }: { id: string; color: string; name: string; className?: string }) {
  return (
    <span className={className} style={{ background: color }} aria-hidden="true">
      {GLYPH[id] ?? (name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
