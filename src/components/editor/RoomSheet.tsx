"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { MeasureField } from "@/components/editor/MeasureField";
import { formatMeasure, parseMeasure } from "@/lib/measure";

export type RoomSheetMode =
  | { kind: "add" }
  | { kind: "edit"; roomId: string; name: string; widthIn: number; depthIn: number };

type RoomSheetProps = {
  mode: RoomSheetMode;
  onClose: () => void;
  onConfirmAdd: (widthIn: number, depthIn: number) => void;
  onConfirmEdit: (roomId: string, widthIn: number, depthIn: number) => void;
  onDelete: (roomId: string) => void;
  onTypingChange: (typing: boolean) => void;
};

function initialWidth(mode: RoomSheetMode): string {
  return mode.kind === "edit" ? formatMeasure(mode.widthIn) : "";
}

function initialDepth(mode: RoomSheetMode): string {
  return mode.kind === "edit" ? formatMeasure(mode.depthIn) : "";
}

/**
 * Add / edit room sheet — bottom sheet on mobile, centered panel on desktop.
 * Remount via `key` when mode changes so fields reset without an effect.
 */
export function RoomSheet({
  mode,
  onClose,
  onConfirmAdd,
  onConfirmEdit,
  onDelete,
  onTypingChange,
}: RoomSheetProps) {
  const [widthText, setWidthText] = useState(() => initialWidth(mode));
  const [depthText, setDepthText] = useState(() => initialDepth(mode));

  const widthParsed = parseMeasure(widthText);
  const depthParsed = parseMeasure(depthText);
  const canSubmit = widthParsed.ok && depthParsed.ok;

  const title = mode.kind === "add" ? "Add room" : mode.name;
  const submitLabel = mode.kind === "add" ? "Add room" : "Update size";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!widthParsed.ok || !depthParsed.ok) return;
    onTypingChange(false);
    if (mode.kind === "add") {
      onConfirmAdd(widthParsed.inches, depthParsed.inches);
    } else {
      onConfirmEdit(mode.roomId, widthParsed.inches, depthParsed.inches);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-navy/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-sheet-title"
        className={[
          "relative z-10 flex w-full max-w-md flex-col gap-5",
          "rounded-t-lg border border-border bg-elevated p-5 shadow-card",
          "sm:rounded-lg",
          "max-h-[90dvh] overflow-y-auto",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="room-sheet-title"
            className="text-lg font-semibold tracking-tight text-navy"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[var(--sp-touch-min)] min-w-[var(--sp-touch-min)] items-center justify-center rounded-sm text-fg-muted hover:bg-tinted hover:text-navy"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          onFocusCapture={() => onTypingChange(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              onTypingChange(false);
            }
          }}
        >
          <MeasureField
            label="Width"
            value={widthText}
            onChange={setWidthText}
            autoFocus
          />
          <MeasureField
            label="Depth"
            value={depthText}
            onChange={setDepthText}
          />

          <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
            <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
              {submitLabel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>

          {mode.kind === "edit" ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-danger hover:bg-danger/5"
              onClick={() => {
                onTypingChange(false);
                onDelete(mode.roomId);
              }}
            >
              Delete room
            </Button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
