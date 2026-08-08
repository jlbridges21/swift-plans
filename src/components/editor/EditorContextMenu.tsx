"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ContextMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
};

type EditorContextMenuProps = {
  open: boolean;
  clientX: number;
  clientY: number;
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

/**
 * Shared long-press / right-click menu. Same items for touch and desktop.
 */
export function EditorContextMenu({
  open,
  clientX,
  clientY,
  items,
  onSelect,
  onClose,
}: EditorContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: clientX, top: clientY });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const safeL = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "env(safe-area-inset-left)",
      ) || "0",
    );
    const safeR = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "env(safe-area-inset-right)",
      ) || "0",
    );
    const safeT = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "env(safe-area-inset-top)",
      ) || "0",
    );
    const safeB = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "env(safe-area-inset-bottom)",
      ) || "0",
    );
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - pad - safeR) {
      left = window.innerWidth - rect.width - pad - safeR;
    }
    if (top + rect.height > window.innerHeight - pad - safeB) {
      top = window.innerHeight - rect.height - pad - safeB;
    }
    left = Math.max(pad + safeL, left);
    top = Math.max(pad + safeT, top);
    setPos({ left, top });
  }, [open, clientX, clientY, items]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    function onPointer(e: PointerEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, onClose]);

  if (!open || items.length === 0) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Canvas actions"
      className="fixed z-[80] min-w-[12rem] overflow-hidden rounded-lg border border-border bg-elevated py-1 shadow-card"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={[
            "flex w-full min-h-[44px] items-center px-4 text-left text-sm font-medium",
            item.danger ? "text-danger hover:bg-danger/5" : "text-navy hover:bg-tinted",
            item.disabled ? "opacity-40" : "",
          ].join(" ")}
          onClick={() => {
            if (item.disabled) return;
            onSelect(item.id);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
