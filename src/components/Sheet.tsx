"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

/**
 * App-style overlay used for every secondary screen on phones (photos, install, invite, scores, confirmations).
 * Slides up over the current screen instead of navigating away, so an installed app never feels like a website.
 * Closes with the ✕ button, the scrim, Escape, a downward swipe on the handle/header, or the phone's Back gesture
 * (we push a history entry while open). Locks page scroll and restores focus on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  size = "auto",
  role = "dialog",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "auto" | "full";
  role?: "dialog" | "alertdialog";
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [drag, setDrag] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const start = useRef<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Back gesture closes the sheet instead of leaving the app.
    let poppedByUs = false;
    history.pushState({ afterlifeSheet: true }, "");
    const onPop = () => { poppedByUs = true; closeRef.current(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => panel.current?.focus());
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (!poppedByUs && history.state?.afterlifeSheet) history.back();
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;

  const down = (e: React.PointerEvent) => { if ((e.target as Element).closest("button")) return; start.current = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (start.current != null) setDrag(Math.max(0, e.clientY - start.current)); };
  const up = () => { if (start.current == null) return; start.current = null; if (drag > 110) onClose(); setDrag(0); };

  return createPortal(
    <div className="sh-scrim" onClick={onClose}>
      <section
        ref={panel}
        tabIndex={-1}
        className={`sh-panel sh-${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        <header className="sh-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="sh-grip" aria-hidden="true" />
          <h2 className="sh-title" id={titleId}>{title}</h2>
          <button className="sh-close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="sh-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
