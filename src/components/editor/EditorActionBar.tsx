"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type ActionBarItem = {
  id: string;
  label: string;
  active?: boolean;
  danger?: boolean;
};

type EditorActionBarProps = {
  items: ActionBarItem[];
  /** Preferred anchor in viewport coordinates (center of selection). */
  anchorClient: { x: number; y: number } | null;
  onAction: (id: string) => void;
};

/**
 * Compact selection action bar. Repositions so it does not cover the anchor.
 */
export function EditorActionBar({
  items,
  anchorClient,
  onAction,
}: EditorActionBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    left: "50%",
    bottom: "max(12px, env(safe-area-inset-bottom))",
    transform: "translateX(-50%)",
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || items.length === 0) return;

    const frame = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const pad = 12;

      if (!anchorClient) {
        setStyle({
          left: "50%",
          bottom: "max(12px, env(safe-area-inset-bottom))",
          transform: "translateX(-50%)",
          top: "auto",
        });
        return;
      }

      let left = anchorClient.x - rect.width / 2;
      let top = anchorClient.y - rect.height - 16;
      left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
      if (top < pad) {
        top = anchorClient.y + 16;
      }
      if (top + rect.height > window.innerHeight - pad) {
        top = window.innerHeight - rect.height - pad;
      }
      if (
        anchorClient.y >= top &&
        anchorClient.y <= top + rect.height &&
        anchorClient.x >= left &&
        anchorClient.x <= left + rect.width
      ) {
        top = Math.min(
          window.innerHeight - rect.height - pad,
          anchorClient.y + 24,
        );
      }
      setStyle({ left, top, bottom: "auto", transform: "none" });
    });

    return () => cancelAnimationFrame(frame);
  }, [anchorClient, items]);

  if (items.length === 0) return null;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection actions"
      className="pointer-events-auto fixed z-[70] flex max-w-[calc(100vw-1.5rem)] gap-1 overflow-x-auto rounded-lg border border-border/80 bg-elevated/95 p-1 shadow-card backdrop-blur-sm"
      style={style}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={[
            "inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-sm px-3 text-sm font-medium",
            item.active
              ? "bg-navy text-paper"
              : item.danger
                ? "text-danger hover:bg-danger/5"
                : "text-navy hover:bg-tinted",
          ].join(" ")}
          onClick={() => onAction(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
