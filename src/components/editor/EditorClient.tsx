"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { EditorCanvas } from "@/components/editor/EditorCanvas";
import {
  RoomSheet,
  type RoomSheetMode,
} from "@/components/editor/RoomSheet";
import { RenameProjectForm } from "@/components/projects/ProjectManageForms";
import { Button } from "@/components/ui/Button";
import { saveFloorGeometry } from "@/lib/plan/actions";
import {
  addDoorOnWall,
  addOpeningOnWall,
  addRectangularRoom,
  addRoomAdjoiningWall,
  addStairs,
  addWindowOnWall,
  canAdjoinWall,
  deleteOpening,
  deleteRoom,
  deleteStairs,
  flipDoorHinge,
  flipDoorSwing,
  migrateGeometry,
  moveOpening,
  resizeRoom,
  resizeStairs,
  roomSizeInches,
  rotateStairs,
  setOpeningWidth,
  toggleStairsDirection,
  translateRoom,
  translateStairs,
} from "@/lib/plan/room-ops";
import { exteriorWallFloorSpan } from "@/lib/plan/derive-walls";
import { listOpenings } from "@/lib/plan/openings";
import { formatMeasure, parseMeasure } from "@/lib/measure";
import type { FloorGeometry } from "@/types/plan-geometry";

export type SaveStatus =
  | "saved"
  | "saving"
  | "dirty"
  | "error"
  | "error-retrying";

type FloorSummary = {
  id: string;
  name: string;
  sort_order: number;
};

type EditorClientProps = {
  projectId: string;
  projectName: string;
  floorId: string;
  floors: FloorSummary[];
  initialGeometry: FloorGeometry;
};

const SAVE_DEBOUNCE_MS = 1500;
const MAX_BACKOFF_MS = 15000;

function statusLabel(status: SaveStatus): string {
  switch (status) {
    case "saved":
      return "Saved";
    case "saving":
      return "Saving…";
    case "dirty":
      return "Unsaved changes";
    case "error":
      return "Couldn’t save — check your connection. Your edits are safe.";
    case "error-retrying":
      return "Save failed — retrying…";
  }
}

export function EditorClient({
  projectId,
  projectName,
  floorId,
  floors,
  initialGeometry,
}: EditorClientProps) {
  const migrated = migrateGeometry(initialGeometry);
  const [geometry, setGeometry] = useState<FloorGeometry>(migrated.geometry);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(
    null,
  );
  const [selectedStairsId, setSelectedStairsId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<RoomSheetMode | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [interacting, setInteracting] = useState(false);
  const [typing, setTyping] = useState(false);
  const needsMigrationSave = useRef(migrated.didMigrate);

  const geometryRef = useRef(geometry);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const failCountRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const loadReadyRef = useRef(false);
  const interactingRef = useRef(false);
  const typingRef = useRef(false);
  const performSaveRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    geometryRef.current = geometry;
  }, [geometry]);

  useEffect(() => {
    interactingRef.current = interacting;
  }, [interacting]);

  useEffect(() => {
    typingRef.current = typing;
  }, [typing]);

  useEffect(() => {
    loadReadyRef.current = true;
    if (needsMigrationSave.current) {
      needsMigrationSave.current = false;
      dirtyRef.current = true;
      setSaveStatus("dirty");
      saveTimerRef.current = setTimeout(() => {
        void performSaveRef.current();
      }, 400);
    }
  }, []);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const performSave = useCallback(async () => {
    if (!loadReadyRef.current || !dirtyRef.current || saveInFlightRef.current) {
      return;
    }
    if (interactingRef.current || typingRef.current) return;

    saveInFlightRef.current = true;
    setSaveStatus(failCountRef.current > 0 ? "error-retrying" : "saving");
    const snapshot = geometryRef.current;

    try {
      const result = await saveFloorGeometry(floorId, snapshot);
      if (result.ok) {
        if (geometryRef.current === snapshot) {
          dirtyRef.current = false;
        }
        failCountRef.current = 0;
        backoffRef.current = 1000;
        setSaveStatus(dirtyRef.current ? "dirty" : "saved");
        if (dirtyRef.current) {
          clearSaveTimer();
          saveTimerRef.current = setTimeout(() => {
            void performSaveRef.current();
          }, SAVE_DEBOUNCE_MS);
        }
      } else {
        failCountRef.current += 1;
        setSaveStatus(failCountRef.current >= 3 ? "error" : "error-retrying");
        const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        clearSaveTimer();
        saveTimerRef.current = setTimeout(() => {
          void performSaveRef.current();
        }, delay);
      }
    } catch {
      failCountRef.current += 1;
      setSaveStatus(failCountRef.current >= 3 ? "error" : "error-retrying");
      const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => {
        void performSaveRef.current();
      }, delay);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [clearSaveTimer, floorId]);

  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  const scheduleSave = useCallback(() => {
    if (!loadReadyRef.current) return;
    dirtyRef.current = true;
    setSaveStatus((s) =>
      s === "error" || s === "error-retrying" ? s : "dirty",
    );
    clearSaveTimer();
    if (interactingRef.current || typingRef.current) return;
    saveTimerRef.current = setTimeout(() => {
      void performSaveRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, [clearSaveTimer]);

  useEffect(() => {
    if (!loadReadyRef.current || !dirtyRef.current) return;
    if (interacting || typing) {
      clearSaveTimer();
      return;
    }
    clearSaveTimer();
    saveTimerRef.current = setTimeout(() => {
      void performSaveRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, [clearSaveTimer, interacting, typing]);

  useEffect(() => {
    return () => clearSaveTimer();
  }, [clearSaveTimer]);

  const mutateGeometry = useCallback(
    (next: FloorGeometry) => {
      setGeometry(next);
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleMoveRoom = useCallback((roomId: string, dx: number, dy: number) => {
    dirtyRef.current = true;
    setGeometry((prev) => translateRoom(prev, roomId, dx, dy));
  }, []);

  const handleMoveOpening = useCallback(
    (openingId: string, offsetIn: number) => {
      dirtyRef.current = true;
      setGeometry((prev) => moveOpening(prev, openingId, offsetIn));
    },
    [],
  );

  const handleMoveStairs = useCallback(
    (stairsId: string, dx: number, dy: number) => {
      dirtyRef.current = true;
      setGeometry((prev) => translateStairs(prev, stairsId, dx, dy));
    },
    [],
  );

  const handleInteractionChange = useCallback((active: boolean) => {
    setInteracting(active);
    if (!active && dirtyRef.current) {
      setSaveStatus("dirty");
    }
  }, []);

  const selectedRoom = geometry.rooms.find((r) => r.id === selectedRoomId);
  const selectedWall = geometry.walls.find((w) => w.id === selectedWallId);
  const selectedOpening = listOpenings(geometry).find(
    (o) => o.id === selectedOpeningId,
  );
  const selectedStairs = geometry.stairs.find((s) => s.id === selectedStairsId);
  const wallCanAdjoin =
    selectedWallId !== null && canAdjoinWall(geometry, selectedWallId);

  function clearSelection() {
    setSelectedRoomId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedStairsId(null);
  }

  const openEditSheet = useCallback(() => {
    if (!selectedRoom) return;
    const size = roomSizeInches(selectedRoom);
    setTyping(true);
    setSheet({
      kind: "edit",
      roomId: selectedRoom.id,
      name: selectedRoom.name,
      widthIn: size.width,
      depthIn: size.depth,
    });
  }, [selectedRoom]);

  const openAdjoinSheet = useCallback(() => {
    if (!selectedWallId || !wallCanAdjoin) return;
    const span = exteriorWallFloorSpan(geometry.rooms, selectedWallId);
    if (!span) return;
    setTyping(true);
    setSheet({
      kind: "adjoin",
      wallId: selectedWallId,
      defaultWidthIn: span.length,
    });
  }, [geometry.rooms, selectedWallId, wallCanAdjoin]);

  const sheetKey =
    sheet?.kind === "add"
      ? "add"
      : sheet?.kind === "adjoin"
        ? `adjoin-${sheet.wallId}`
        : sheet?.kind === "edit"
          ? `edit-${sheet.roomId}`
          : "none";

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="border-b border-border bg-elevated">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex min-w-0 flex-col gap-2">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-accent hover:underline"
            >
              ← Dashboard
            </Link>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <h1 className="truncate text-xl font-semibold tracking-tight text-navy">
                {projectName}
              </h1>
              <RenameProjectForm projectId={projectId} name={projectName} />
            </div>
          </div>
          <button
            type="button"
            className="self-start text-left text-sm text-fg-muted"
            aria-live="polite"
            onClick={() => {
              if (saveStatus === "error" || saveStatus === "error-retrying") {
                failCountRef.current = 0;
                backoffRef.current = 1000;
                void performSaveRef.current();
              }
            }}
          >
            {statusLabel(saveStatus)}
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-5 py-4 sm:px-8">
        {floors.length > 1 ? (
          <div className="flex flex-wrap gap-2" aria-label="Floors">
            {floors.map((floor) => (
              <span
                key={floor.id}
                className={[
                  "inline-flex min-h-[var(--sp-touch-min)] items-center rounded-sm border px-3 text-sm",
                  floor.id === floorId
                    ? "border-accent bg-tinted text-accent"
                    : "border-border text-fg-muted",
                ].join(" ")}
              >
                {floor.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            {floors.find((f) => f.id === floorId)?.name ?? "Floor 1"}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              clearSelection();
              setTyping(true);
              setSheet({ kind: "add" });
            }}
          >
            Add Room
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              clearSelection();
              mutateGeometry(addStairs(geometry));
            }}
          >
            Add Stairs
          </Button>
          {selectedRoom ? (
            <Button type="button" variant="secondary" onClick={openEditSheet}>
              Edit {selectedRoom.name}
            </Button>
          ) : null}
          {selectedWall && wallCanAdjoin ? (
            <Button type="button" variant="secondary" onClick={openAdjoinSheet}>
              Add Room Here
            </Button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-elevated shadow-card">
          <EditorCanvas
            geometry={geometry}
            selectedRoomId={selectedRoomId}
            selectedWallId={selectedWallId}
            selectedOpeningId={selectedOpeningId}
            selectedStairsId={selectedStairsId}
            onSelectRoom={(id) => {
              setSelectedRoomId(id);
              if (id) {
                setSelectedWallId(null);
                setSelectedOpeningId(null);
                setSelectedStairsId(null);
              }
              if (!id && sheet?.kind === "edit") setSheet(null);
            }}
            onSelectWall={(id) => {
              setSelectedWallId(id);
              if (id) {
                setSelectedRoomId(null);
                setSelectedOpeningId(null);
                setSelectedStairsId(null);
              }
            }}
            onSelectOpening={(id) => {
              setSelectedOpeningId(id);
              if (id) {
                setSelectedRoomId(null);
                setSelectedWallId(null);
                setSelectedStairsId(null);
              }
            }}
            onSelectStairs={(id) => {
              setSelectedStairsId(id);
              if (id) {
                setSelectedRoomId(null);
                setSelectedWallId(null);
                setSelectedOpeningId(null);
              }
            }}
            onMoveRoom={handleMoveRoom}
            onMoveOpening={handleMoveOpening}
            onMoveStairs={handleMoveStairs}
            onInteractionChange={handleInteractionChange}
          />
        </div>

        {selectedRoom && !sheet ? (
          <aside
            className={[
              "flex flex-col gap-3 rounded-lg border border-border bg-elevated p-4 shadow-card",
              "sm:max-w-sm",
            ].join(" ")}
            aria-label={`${selectedRoom.name} controls`}
          >
            <p className="text-sm font-semibold text-navy">{selectedRoom.name}</p>
            <p className="text-sm text-fg-muted">
              {(() => {
                const s = roomSizeInches(selectedRoom);
                return `${Math.round((s.width * s.depth) / 144)} sq ft`;
              })()}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="w-full" onClick={openEditSheet}>
                Edit size
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-danger hover:bg-danger/5"
                onClick={() => {
                  mutateGeometry(deleteRoom(geometry, selectedRoom.id));
                  setSelectedRoomId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </aside>
        ) : null}

        {selectedWall && !sheet ? (
          <aside
            className={[
              "flex flex-col gap-3 rounded-lg border border-border bg-elevated p-4 shadow-card",
              "sm:max-w-sm",
            ].join(" ")}
            aria-label="Wall controls"
          >
            <p className="text-sm font-semibold text-navy">
              {selectedWall.kind === "interior" ? "Interior wall" : "Exterior wall"}
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  mutateGeometry(addDoorOnWall(geometry, selectedWall.id));
                }}
              >
                Add Door
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  mutateGeometry(addWindowOnWall(geometry, selectedWall.id));
                }}
              >
                Add Window
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  mutateGeometry(addOpeningOnWall(geometry, selectedWall.id));
                }}
              >
                Add Opening
              </Button>
              {wallCanAdjoin ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={openAdjoinSheet}
                >
                  Add Room Here
                </Button>
              ) : selectedWall.roomIds.length > 1 ? (
                <p className="text-sm text-fg-muted">
                  Shared walls can’t take another room here.
                </p>
              ) : null}
            </div>
          </aside>
        ) : null}

        {selectedOpening && !sheet ? (
          <aside
            className={[
              "flex flex-col gap-3 rounded-lg border border-border bg-elevated p-4 shadow-card",
              "sm:max-w-sm",
            ].join(" ")}
            aria-label="Opening controls"
          >
            <p className="text-sm font-semibold text-navy">
              {selectedOpening.kind === "door"
                ? "Door"
                : selectedOpening.kind === "window"
                  ? "Window"
                  : "Opening"}
            </p>
            <p className="text-sm text-fg-muted">
              Width {formatMeasure(selectedOpening.widthIn)}
            </p>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-navy">Width</span>
              <input
                className="min-h-[var(--sp-touch-min)] rounded-sm border border-border px-3 text-base"
                inputMode="decimal"
                defaultValue={formatMeasure(selectedOpening.widthIn)}
                onBlur={(e) => {
                  const parsed = parseMeasure(e.target.value);
                  if (parsed.ok) {
                    mutateGeometry(
                      setOpeningWidth(
                        geometry,
                        selectedOpening.id,
                        parsed.inches,
                      ),
                    );
                  }
                }}
              />
            </label>
            {selectedOpening.kind === "door" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() =>
                    mutateGeometry(flipDoorSwing(geometry, selectedOpening.id))
                  }
                >
                  Flip swing
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() =>
                    mutateGeometry(flipDoorHinge(geometry, selectedOpening.id))
                  }
                >
                  Flip hinge
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="w-full text-danger hover:bg-danger/5"
              onClick={() => {
                mutateGeometry(deleteOpening(geometry, selectedOpening.id));
                setSelectedOpeningId(null);
              }}
            >
              Delete
            </Button>
          </aside>
        ) : null}

        {selectedStairs && !sheet ? (
          <aside
            className={[
              "flex flex-col gap-3 rounded-lg border border-border bg-elevated p-4 shadow-card",
              "sm:max-w-sm",
            ].join(" ")}
            aria-label="Stairs controls"
          >
            <p className="text-sm font-semibold text-navy">
              Stairs ({selectedStairs.direction.toUpperCase()})
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() =>
                  mutateGeometry(rotateStairs(geometry, selectedStairs.id))
                }
              >
                Rotate 90°
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() =>
                  mutateGeometry(
                    toggleStairsDirection(geometry, selectedStairs.id),
                  )
                }
              >
                Toggle UP / DOWN
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setTyping(true);
                  setSheet({
                    kind: "edit",
                    roomId: selectedStairs.id,
                    name: "Stairs",
                    widthIn: selectedStairs.widthIn,
                    depthIn: selectedStairs.depthIn,
                  });
                }}
              >
                Edit size
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-danger hover:bg-danger/5"
                onClick={() => {
                  mutateGeometry(deleteStairs(geometry, selectedStairs.id));
                  setSelectedStairsId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </aside>
        ) : null}
      </div>

      {sheet ? (
        <RoomSheet
          key={sheetKey}
          mode={sheet}
          onClose={() => {
            setTyping(false);
            setSheet(null);
          }}
          onTypingChange={setTyping}
          onConfirmAdd={(widthIn, depthIn) => {
            const next = addRectangularRoom(geometry, widthIn, depthIn);
            const newRoom = next.rooms[next.rooms.length - 1];
            mutateGeometry(next);
            setSheet(null);
            setSelectedWallId(null);
            setSelectedRoomId(newRoom?.id ?? null);
          }}
          onConfirmAdjoin={(wallId, widthIn, depthIn) => {
            const next = addRoomAdjoiningWall(
              geometry,
              wallId,
              widthIn,
              depthIn,
            );
            const newRoom = next.rooms[next.rooms.length - 1];
            mutateGeometry(next);
            setSheet(null);
            setSelectedWallId(null);
            setSelectedRoomId(newRoom?.id ?? null);
          }}
          onConfirmEdit={(id, widthIn, depthIn) => {
            if (geometry.stairs.some((s) => s.id === id)) {
              mutateGeometry(resizeStairs(geometry, id, widthIn, depthIn));
            } else {
              mutateGeometry(resizeRoom(geometry, id, widthIn, depthIn));
            }
            setSheet(null);
          }}
          onDelete={(roomId) => {
            mutateGeometry(deleteRoom(geometry, roomId));
            setSelectedRoomId(null);
            setSheet(null);
          }}
        />
      ) : null}
    </div>
  );
}
