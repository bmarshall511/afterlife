import type { StandingRow } from "@/shared/types";

/** Ranked (qualified) teams with competition rank; provisional n/5 teams listed separately. */
export function Standings({ rows, max = 5, showProvisional = true, compact = false }: { rows: StandingRow[]; max?: number; showProvisional?: boolean; compact?: boolean }) {
  const ranked = rows.filter((r) => r.qualified).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name));
  const prov = rows.filter((r) => !r.qualified).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  if (!rows.length) return null;
  return (
    <div className={`standings ${compact ? "compact" : ""}`}>
      {ranked.length > 0 && (
        <ol className="st-list">
          {ranked.slice(0, max).map((r) => (
            <li key={r.teamId} className="st-row">
              <span className="st-rank">{String(r.rank ?? "–").padStart(2, "0")}</span>
              <span className="st-swatch" style={{ background: r.color }} aria-hidden="true" />
              <span className="st-name">{r.name}</span>
              <span className="st-total">{r.total.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ol>
      )}
      {showProvisional && prov.length > 0 && (
        <div className="st-prov">
          <div className="st-prov-h">Still qualifying · best 5 sets count</div>
          <ul className="st-list">
            {prov.slice(0, Math.max(2, max - ranked.length)).map((r) => (
              <li key={r.teamId} className="st-row prov">
                <span className="st-rank">{r.setsCounted}/5</span>
                <span className="st-swatch" style={{ background: r.color }} aria-hidden="true" />
                <span className="st-name">{r.name}</span>
                <span className="st-total">{r.total.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
