"use client";

import {
  ROOM_TYPE_PICKER_ORDER,
  roomTypeDisplayName,
  type PlanRoomType,
} from "@/lib/plan/room-types";

type RoomTypePickerProps = {
  currentType: PlanRoomType;
  onSelect: (type: PlanRoomType) => void;
  onClose: () => void;
};

/**
 * Fast room-type chips — bottom sheet on mobile, side panel on desktop.
 * One tap selects and closes (handled by parent).
 */
export function RoomTypePicker({
  currentType,
  onSelect,
  onClose,
}: RoomTypePickerProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-stretch sm:justify-end"
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
        aria-labelledby="room-type-picker-title"
        className={[
          "relative z-10 flex w-full flex-col gap-4",
          "rounded-t-lg border border-border bg-elevated p-5 shadow-card",
          "sm:h-full sm:max-w-sm sm:rounded-none sm:border-l sm:border-t-0",
          "max-h-[85dvh] overflow-y-auto sm:max-h-none",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="room-type-picker-title"
            className="text-lg font-semibold tracking-tight text-navy"
          >
            Room type
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

        <div className="flex flex-wrap gap-2" role="list">
          {ROOM_TYPE_PICKER_ORDER.map((type) => {
            const selected = type === currentType;
            return (
              <button
                key={type}
                type="button"
                role="listitem"
                onClick={() => onSelect(type)}
                className={[
                  "inline-flex min-h-[var(--sp-touch-min)] items-center rounded-sm border px-3 text-sm font-medium",
                  selected
                    ? "border-accent bg-tinted text-accent"
                    : "border-border bg-elevated text-navy hover:bg-tinted",
                ].join(" ")}
              >
                {roomTypeDisplayName(type)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
