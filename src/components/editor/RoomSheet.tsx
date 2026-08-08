"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { MeasureField } from "@/components/editor/MeasureField";
import { formatMeasure, parseMeasure } from "@/lib/measure";

export type RoomSheetMode =
  | { kind: "add" }
  | {
      kind: "edit";
      roomId: string;
      name: string;
      widthIn: number;
      depthIn: number;
    }
  | {
      kind: "adjoin";
      wallId: string;
      defaultWidthIn: number;
    };

type RoomSheetProps = {
  mode: RoomSheetMode;
  onClose: () => void;
  onConfirmAdd: (widthIn: number, depthIn: number) => void;
  onConfirmAdjoin: (wallId: string, widthIn: number, depthIn: number) => void;
  onConfirmEdit: (roomId: string, widthIn: number, depthIn: number) => void;
  onDelete: (roomId: string) => void;
  onTypingChange: (typing: boolean) => void;
};

function initialWidth(mode: RoomSheetMode): string {
  if (mode.kind === "edit") return formatMeasure(mode.widthIn);
  if (mode.kind === "adjoin") return formatMeasure(mode.defaultWidthIn);
  return "";
}

function initialDepth(mode: RoomSheetMode): string {
  if (mode.kind === "edit") return formatMeasure(mode.depthIn);
  return "";
}

/**
 * Add / edit / adjoin room sheet — bottom sheet on mobile, centered panel on desktop.
 * Remount via `key` when mode changes so fields reset without an effect.
 */
export function RoomSheet({
  mode,
  onClose,
  onConfirmAdd,
  onConfirmAdjoin,
  onConfirmEdit,
  onDelete,
  onTypingChange,
}: RoomSheetProps) {
  const [widthText, setWidthText] = useState(() => initialWidth(mode));
  const [depthText, setDepthText] = useState(() => initialDepth(mode));

  const widthParsed = parseMeasure(widthText);
  const depthParsed = parseMeasure(depthText);
  const canSubmit = widthParsed.ok && depthParsed.ok;

  const title =
    mode.kind === "add"
      ? "Add room"
      : mode.kind === "adjoin"
        ? "Add room here"
        : mode.name;
  const submitLabel =
    mode.kind === "edit" ? "Update size" : "Add room";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!widthParsed.ok || !depthParsed.ok) return;
    onTypingChange(false);
    if (mode.kind === "add") {
      onConfirmAdd(widthParsed.inches, depthParsed.inches);
    } else if (mode.kind === "adjoin") {
      onConfirmAdjoin(mode.wallId, widthParsed.inches, depthParsed.inches);
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

        {mode.kind === "adjoin" ? (
          <p className="text-sm text-fg-muted">
            Width defaults to the selected wall. Depth is how far the new room
            extends outward.
          </p>
        ) : null}

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
            autoFocus={mode.kind !== "adjoin"}
          />
          <MeasureField
            label="Depth"
            value={depthText}
            onChange={setDepthText}
            autoFocus={mode.kind === "adjoin"}
          />

          <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full sm:w-auto"
            >
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
