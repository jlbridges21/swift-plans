"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { EditorCanvas } from "@/components/editor/EditorCanvas";
import {
  RoomSheet,
  type RoomSheetMode,
} from "@/components/editor/RoomSheet";
import { RoomTypePicker } from "@/components/editor/RoomTypePicker";
import { RenameProjectForm } from "@/components/projects/ProjectManageForms";
import { Button } from "@/components/ui/Button";
import { saveFloorGeometry } from "@/lib/plan/actions";
import {
  addFloor,
  deleteFloor,
  duplicateFloor,
  renameFloor,
  reorderFloor,
} from "@/lib/plan/floor-actions";
import {
  canRedo,
  canUndo,
  createGeometryHistory,
  historyCommitGesture,
  historyPush,
  historyRedo,
  historyReplacePresent,
  historyUndo,
  type GeometryHistory,
} from "@/lib/plan/history";
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
  deleteRoomVertex,
  deleteStairs,
  flipDoorHinge,
  flipDoorSwing,
  insertRoomVertex,
  migrateGeometry,
  moveOpening,
  moveRoomVertex,
  resetRoomLabelAnchor,
  resizeRoom,
  resizeStairs,
  roomSizeInches,
  rotateStairs,
  setOpeningWidth,
  setRoomLabelAnchor,
  setRoomName,
  setRoomType,
  toggleStairsDirection,
  translateRoom,
  translateStairs,
} from "@/lib/plan/room-ops";
import { exteriorWallFloorSpan } from "@/lib/plan/derive-walls";
import { listOpenings } from "@/lib/plan/openings";
import { normalizeRoomType } from "@/lib/plan/room-types";
import { formatMeasure, parseMeasure } from "@/lib/measure";
import type { FloorGeometry, PlanPoint } from "@/types/plan-geometry";

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
  initialFloorId: string;
  initialFloors: FloorSummary[];
  initialGeometries: Record<string, FloorGeometry>;
};

type FloorSheetMode =
  | { kind: "add" }
  | { kind: "rename"; currentName: string }
  | { kind: "delete"; floorName: string };

const SAVE_DEBOUNCE_MS = 1500;
const MAX_BACKOFF_MS = 15000;
const ADD_FLOOR_PRESETS = ["Floor 1", "Floor 2", "Floor 3", "Basement"] as const;

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

function buildInitialHistories(
  floors: FloorSummary[],
  initialGeometries: Record<string, FloorGeometry>,
): {
  map: Map<string, GeometryHistory>;
  migrateFloors: Set<string>;
} {
  const map = new Map<string, GeometryHistory>();
  const migrateFloors = new Set<string>();
  for (const floor of floors) {
    const migrated = migrateGeometry(initialGeometries[floor.id]!);
    map.set(floor.id, createGeometryHistory(migrated.geometry));
    if (migrated.didMigrate) migrateFloors.add(floor.id);
  }
  return { map, migrateFloors };
}

function waitForSaveIdle(saveInFlightRef: RefObject<boolean>): Promise<void> {
  return new Promise((resolve) => {
    function poll() {
      if (!saveInFlightRef.current) {
        resolve();
        return;
      }
      setTimeout(poll, 25);
    }
    poll();
  });
}

export function EditorClient({
  projectId,
  projectName,
  initialFloorId,
  initialFloors,
  initialGeometries,
}: EditorClientProps) {
  const initial = buildInitialHistories(initialFloors, initialGeometries);
  const historiesRef = useRef(initial.map);
  const migrateSaveFloorsRef = useRef(initial.migrateFloors);

  const [floors, setFloors] = useState(initialFloors);
  const [activeFloorId, setActiveFloorId] = useState(initialFloorId);
  const floorIdRef = useRef(initialFloorId);
  const [history, setHistory] = useState<GeometryHistory>(
    () => initial.map.get(initialFloorId)!,
  );
  const geometry = history.present;

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(
    null,
  );
  const [selectedStairsId, setSelectedStairsId] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(
    null,
  );
  const [sheet, setSheet] = useState<RoomSheetMode | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [floorSheet, setFloorSheet] = useState<FloorSheetMode | null>(null);
  const [floorCustomName, setFloorCustomName] = useState("");
  const [floorDeleteConfirm, setFloorDeleteConfirm] = useState("");
  const [floorActionError, setFloorActionError] = useState<string | null>(null);
  const [floorActionBusy, setFloorActionBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [interacting, setInteracting] = useState(false);
  const [typing, setTyping] = useState(false);

  const historyRef = useRef(history);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const failCountRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const loadReadyRef = useRef(false);
  const interactingRef = useRef(false);
  const typingRef = useRef(false);
  const performSaveRef = useRef<() => Promise<void>>(async () => {});
  const flushSaveNowRef = useRef<() => Promise<void>>(async () => {});
  const gestureBaselineRef = useRef<FloorGeometry | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    interactingRef.current = interacting;
  }, [interacting]);

  useEffect(() => {
    typingRef.current = typing;
  }, [typing]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const markMigrationDirty = useCallback(
    (floorId: string) => {
      if (!migrateSaveFloorsRef.current.has(floorId)) return;
      dirtyRef.current = true;
      setSaveStatus("dirty");
      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => {
        void performSaveRef.current();
      }, 400);
    },
    [clearSaveTimer],
  );

  const performSave = useCallback(async () => {
    if (!loadReadyRef.current || !dirtyRef.current || saveInFlightRef.current) {
      return;
    }
    if (interactingRef.current || typingRef.current) return;

    saveInFlightRef.current = true;
    setSaveStatus(failCountRef.current > 0 ? "error-retrying" : "saving");
    const snapshot = historyRef.current.present;
    const floorId = floorIdRef.current;

    try {
      const result = await saveFloorGeometry(floorId, snapshot);
      if (result.ok) {
        if (historyRef.current.present === snapshot) {
          dirtyRef.current = false;
        }
        migrateSaveFloorsRef.current.delete(floorId);
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
  }, [clearSaveTimer]);

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

  const flushSaveNow = useCallback(async (): Promise<void> => {
    clearSaveTimer();
    if (!dirtyRef.current) return;

    await waitForSaveIdle(saveInFlightRef);
    if (!dirtyRef.current) return;

    await performSaveRef.current();
    await waitForSaveIdle(saveInFlightRef);
  }, [clearSaveTimer]);

  useEffect(() => {
    flushSaveNowRef.current = flushSaveNow;
  }, [flushSaveNow]);

  useEffect(() => {
    loadReadyRef.current = true;
    markMigrationDirty(initialFloorId);
  }, [initialFloorId, markMigrationDirty]);

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

  const commitGeometry = useCallback(
    (next: FloorGeometry) => {
      setHistory((h) => historyPush(h, next));
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleDocumentGestureStart = useCallback(() => {
    gestureBaselineRef.current = historyRef.current.present;
  }, []);

  const handleDocumentGestureEnd = useCallback(() => {
    const baseline = gestureBaselineRef.current;
    gestureBaselineRef.current = null;
    if (!baseline) return;
    setHistory((h) => historyCommitGesture(h, baseline));
    scheduleSave();
  }, [scheduleSave]);

  const handleMoveRoom = useCallback((roomId: string, dx: number, dy: number) => {
    dirtyRef.current = true;
    setHistory((h) =>
      historyReplacePresent(h, translateRoom(h.present, roomId, dx, dy)),
    );
  }, []);

  const handleMoveOpening = useCallback(
    (openingId: string, offsetIn: number) => {
      dirtyRef.current = true;
      setHistory((h) =>
        historyReplacePresent(h, moveOpening(h.present, openingId, offsetIn)),
      );
    },
    [],
  );

  const handleMoveStairs = useCallback(
    (stairsId: string, dx: number, dy: number) => {
      dirtyRef.current = true;
      setHistory((h) =>
        historyReplacePresent(h, translateStairs(h.present, stairsId, dx, dy)),
      );
    },
    [],
  );

  const handleMoveLabel = useCallback((roomId: string, at: PlanPoint) => {
    dirtyRef.current = true;
    setHistory((h) =>
      historyReplacePresent(h, setRoomLabelAnchor(h.present, roomId, at)),
    );
  }, []);

  const handleMoveVertex = useCallback(
    (roomId: string, vertexIndex: number, x: number, y: number) => {
      dirtyRef.current = true;
      setHistory((h) =>
        historyReplacePresent(
          h,
          moveRoomVertex(h.present, roomId, vertexIndex, x, y),
        ),
      );
    },
    [],
  );

  const handleInsertVertex = useCallback(
    (roomId: string, edgeIndex: number, offsetIn: number) => {
      commitGeometry(
        insertRoomVertex(
          historyRef.current.present,
          roomId,
          edgeIndex,
          offsetIn,
        ),
      );
    },
    [commitGeometry],
  );

  const handleInteractionChange = useCallback((active: boolean) => {
    setInteracting(active);
    if (!active && dirtyRef.current) {
      setSaveStatus("dirty");
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (!canUndo(historyRef.current)) return;
    setHistory((h) => historyUndo(h));
    dirtyRef.current = true;
    setSaveStatus("dirty");
    scheduleSave();
  }, [scheduleSave]);

  const handleRedo = useCallback(() => {
    if (!canRedo(historyRef.current)) return;
    setHistory((h) => historyRedo(h));
    dirtyRef.current = true;
    setSaveStatus("dirty");
    scheduleSave();
  }, [scheduleSave]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (typingRef.current || sheet || typePickerOpen || floorSheet) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [floorSheet, handleRedo, handleUndo, sheet, typePickerOpen]);

  function clearSelection() {
    setSelectedRoomId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedStairsId(null);
    setSelectedVertexIndex(null);
    setTypePickerOpen(false);
  }

  const switchFloor = useCallback(
    async (nextId: string) => {
      if (nextId === activeFloorId) return;

      await flushSaveNowRef.current();

      historiesRef.current.set(activeFloorId, historyRef.current);

      let nextHistory = historiesRef.current.get(nextId);
      if (!nextHistory) {
        const migrated = migrateGeometry(initialGeometries[nextId]!);
        nextHistory = createGeometryHistory(migrated.geometry);
        historiesRef.current.set(nextId, nextHistory);
        if (migrated.didMigrate) migrateSaveFloorsRef.current.add(nextId);
      }

      floorIdRef.current = nextId;
      setActiveFloorId(nextId);
      setHistory(nextHistory);
      clearSelection();
      markMigrationDirty(nextId);
    },
    [activeFloorId, initialGeometries, markMigrationDirty],
  );

  const activeFloor = floors.find((f) => f.id === activeFloorId);
  const activeFloorIndex = floors.findIndex((f) => f.id === activeFloorId);

  const runFloorAction = useCallback(
    async (action: () => Promise<void>) => {
      setFloorActionError(null);
      setFloorActionBusy(true);
      try {
        await action();
      } finally {
        setFloorActionBusy(false);
      }
    },
    [],
  );

  const handleAddFloor = useCallback(
    (name: string) => {
      void runFloorAction(async () => {
        await flushSaveNowRef.current();
        const result = await addFloor(projectId, name);
        if (!result.ok || !result.floor || !result.geometry || !result.floors) {
          setFloorActionError(result.ok ? "Could not add floor." : result.error);
          return;
        }
        const migrated = migrateGeometry(result.geometry);
        historiesRef.current.set(
          result.floor.id,
          createGeometryHistory(migrated.geometry),
        );
        if (migrated.didMigrate) migrateSaveFloorsRef.current.add(result.floor.id);
        setFloors(result.floors);
        setFloorSheet(null);
        setFloorCustomName("");
        await switchFloor(result.floor.id);
      });
    },
    [projectId, runFloorAction, switchFloor],
  );

  const handleDuplicateFloor = useCallback(() => {
    void runFloorAction(async () => {
      await flushSaveNowRef.current();
      const result = await duplicateFloor(projectId, activeFloorId);
      if (!result.ok || !result.floor || !result.geometry || !result.floors) {
        setFloorActionError(
          result.ok ? "Could not duplicate floor." : result.error,
        );
        return;
      }
      const migrated = migrateGeometry(result.geometry);
      historiesRef.current.set(
        result.floor.id,
        createGeometryHistory(migrated.geometry),
      );
      if (migrated.didMigrate) migrateSaveFloorsRef.current.add(result.floor.id);
      setFloors(result.floors);
      await switchFloor(result.floor.id);
    });
  }, [activeFloorId, projectId, runFloorAction, switchFloor]);

  const handleRenameFloor = useCallback(
    (name: string) => {
      void runFloorAction(async () => {
        const result = await renameFloor(projectId, activeFloorId, name);
        if (!result.ok || !result.floors) {
          setFloorActionError(result.ok ? "Could not rename floor." : result.error);
          return;
        }
        setFloors(result.floors);
        setFloorSheet(null);
        setFloorCustomName("");
      });
    },
    [activeFloorId, projectId, runFloorAction],
  );

  const handleReorderFloor = useCallback(
    (direction: "up" | "down") => {
      void runFloorAction(async () => {
        const result = await reorderFloor(projectId, activeFloorId, direction);
        if (!result.ok || !result.floors) {
          setFloorActionError(
            result.ok ? "Could not reorder floors." : result.error,
          );
          return;
        }
        setFloors(result.floors);
      });
    },
    [activeFloorId, projectId, runFloorAction],
  );

  const handleDeleteFloor = useCallback(() => {
    void runFloorAction(async () => {
      if (!activeFloor) return;
      await flushSaveNowRef.current();
      const result = await deleteFloor(
        projectId,
        activeFloorId,
        floorDeleteConfirm,
      );
      if (!result.ok || !result.floors) {
        setFloorActionError(
          result.ok ? "Could not delete floor." : result.error,
        );
        return;
      }
      historiesRef.current.delete(activeFloorId);
      const nextFloors = result.floors;
      setFloors(nextFloors);
      setFloorSheet(null);
      setFloorDeleteConfirm("");
      const nextId = nextFloors[0]!.id;
      const nextHistory = historiesRef.current.get(nextId);
      if (nextHistory) {
        floorIdRef.current = nextId;
        setActiveFloorId(nextId);
        setHistory(nextHistory);
        clearSelection();
        markMigrationDirty(nextId);
      }
    });
  }, [
    activeFloor,
    activeFloorId,
    floorDeleteConfirm,
    markMigrationDirty,
    projectId,
    runFloorAction,
  ]);

  const selectedRoom = geometry.rooms.find((r) => r.id === selectedRoomId);
  const selectedWall = geometry.walls.find((w) => w.id === selectedWallId);
  const selectedOpening = listOpenings(geometry).find(
    (o) => o.id === selectedOpeningId,
  );
  const selectedStairs = geometry.stairs.find((s) => s.id === selectedStairsId);
  const wallCanAdjoin =
    selectedWallId !== null && canAdjoinWall(geometry, selectedWallId);

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

  const undoEnabled = canUndo(history);
  const redoEnabled = canRedo(history);

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

      <div className="mx-auto flex w-full flex-1 flex-col gap-4 px-5 py-4 sm:px-8 max-w-6xl">
        <div className="flex flex-col gap-2">
          <div
            className="flex gap-1 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Floors"
          >
            {floors.map((floor) => (
              <button
                key={floor.id}
                type="button"
                role="tab"
                aria-selected={floor.id === activeFloorId}
                className={[
                  "inline-flex min-h-[var(--sp-touch-min)] shrink-0 items-center rounded-sm border px-3 text-sm font-medium",
                  floor.id === activeFloorId
                    ? "border-accent bg-tinted text-accent"
                    : "border-border text-fg-muted hover:bg-tinted/50",
                ].join(" ")}
                onClick={() => void switchFloor(floor.id)}
              >
                {floor.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={floorActionBusy}
              onClick={() => {
                setFloorActionError(null);
                setFloorCustomName("");
                setFloorSheet({ kind: "add" });
              }}
            >
              Add Floor
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={floorActionBusy}
              onClick={handleDuplicateFloor}
            >
              Duplicate
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={floorActionBusy || !activeFloor}
              onClick={() => {
                if (!activeFloor) return;
                setFloorActionError(null);
                setFloorCustomName(activeFloor.name);
                setFloorSheet({ kind: "rename", currentName: activeFloor.name });
              }}
            >
              Rename
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={floorActionBusy || activeFloorIndex <= 0}
              onClick={() => handleReorderFloor("up")}
              aria-label="Move floor left"
            >
              ←
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={
                floorActionBusy ||
                activeFloorIndex < 0 ||
                activeFloorIndex >= floors.length - 1
              }
              onClick={() => handleReorderFloor("down")}
              aria-label="Move floor right"
            >
              →
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-danger hover:bg-danger/5"
              disabled={floorActionBusy || floors.length <= 1 || !activeFloor}
              onClick={() => {
                if (!activeFloor) return;
                setFloorActionError(null);
                setFloorDeleteConfirm("");
                setFloorSheet({ kind: "delete", floorName: activeFloor.name });
              }}
            >
              Delete
            </Button>
          </div>

          {floorActionError ? (
            <p className="text-sm text-danger" role="alert">
              {floorActionError}
            </p>
          ) : null}
        </div>

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
              commitGeometry(addStairs(geometry));
            }}
          >
            Add Stairs
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!undoEnabled}
            onClick={handleUndo}
            aria-label="Undo"
          >
            Undo
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!redoEnabled}
            onClick={handleRedo}
            aria-label="Redo"
          >
            Redo
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
            selectedVertexIndex={selectedVertexIndex}
            onSelectRoom={(id) => {
              setSelectedRoomId(id);
              if (id) {
                setSelectedWallId(null);
                setSelectedOpeningId(null);
                setSelectedStairsId(null);
                setSelectedVertexIndex(null);
              } else {
                setTypePickerOpen(false);
                setSelectedVertexIndex(null);
              }
              if (!id && sheet?.kind === "edit") setSheet(null);
            }}
            onSelectWall={(id) => {
              setSelectedWallId(id);
              if (id) {
                setSelectedRoomId(null);
                setSelectedOpeningId(null);
                setSelectedStairsId(null);
                setSelectedVertexIndex(null);
                setTypePickerOpen(false);
              }
            }}
            onSelectOpening={(id) => {
              setSelectedOpeningId(id);
              if (id) {
                setSelectedRoomId(null);
                setSelectedWallId(null);
                setSelectedStairsId(null);
                setSelectedVertexIndex(null);
                setTypePickerOpen(false);
              }
            }}
            onSelectStairs={(id) => {
              setSelectedStairsId(id);
              if (id) {
                setSelectedRoomId(null);
                setSelectedWallId(null);
                setSelectedOpeningId(null);
                setSelectedVertexIndex(null);
                setTypePickerOpen(false);
              }
            }}
            onSelectVertex={(roomId, vertexIndex) => {
              setSelectedRoomId(roomId);
              setSelectedVertexIndex(vertexIndex);
              setSelectedWallId(null);
              setSelectedOpeningId(null);
              setSelectedStairsId(null);
              setTypePickerOpen(false);
            }}
            onMoveRoom={handleMoveRoom}
            onMoveOpening={handleMoveOpening}
            onMoveStairs={handleMoveStairs}
            onMoveLabel={handleMoveLabel}
            onMoveVertex={handleMoveVertex}
            onInsertVertex={handleInsertVertex}
            onDocumentGestureStart={handleDocumentGestureStart}
            onDocumentGestureEnd={handleDocumentGestureEnd}
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
            <Button
              type="button"
              className="w-full"
              onClick={() => setTypePickerOpen(true)}
            >
              Room type
            </Button>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-navy">Custom name</span>
              <input
                className="min-h-[var(--sp-touch-min)] rounded-sm border border-border px-3 text-base"
                defaultValue={selectedRoom.name}
                key={`name-${selectedRoom.id}-${selectedRoom.name}`}
                onFocus={() => setTyping(true)}
                onBlur={(e) => {
                  setTyping(false);
                  const next = e.target.value.trim();
                  if (next && next !== selectedRoom.name) {
                    commitGeometry(setRoomName(geometry, selectedRoom.id, next));
                  }
                }}
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="w-full" onClick={openEditSheet}>
                Edit size
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() =>
                  commitGeometry(
                    resetRoomLabelAnchor(geometry, selectedRoom.id),
                  )
                }
              >
                Reset label
              </Button>
            </div>
            {selectedVertexIndex !== null &&
            selectedRoom.polygon.length > 4 ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  commitGeometry(
                    deleteRoomVertex(
                      geometry,
                      selectedRoom.id,
                      selectedVertexIndex,
                    ),
                  );
                  setSelectedVertexIndex(null);
                }}
              >
                Delete corner
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="w-full text-danger hover:bg-danger/5"
              onClick={() => {
                commitGeometry(deleteRoom(geometry, selectedRoom.id));
                setSelectedRoomId(null);
                setSelectedVertexIndex(null);
                setTypePickerOpen(false);
              }}
            >
              Delete
            </Button>
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
                  commitGeometry(addDoorOnWall(geometry, selectedWall.id));
                }}
              >
                Add Door
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  commitGeometry(addWindowOnWall(geometry, selectedWall.id));
                }}
              >
                Add Window
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  commitGeometry(addOpeningOnWall(geometry, selectedWall.id));
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
                onFocus={() => setTyping(true)}
                onBlur={(e) => {
                  setTyping(false);
                  const parsed = parseMeasure(e.target.value);
                  if (parsed.ok) {
                    commitGeometry(
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
                    commitGeometry(flipDoorSwing(geometry, selectedOpening.id))
                  }
                >
                  Flip swing
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() =>
                    commitGeometry(flipDoorHinge(geometry, selectedOpening.id))
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
                commitGeometry(deleteOpening(geometry, selectedOpening.id));
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
                  commitGeometry(rotateStairs(geometry, selectedStairs.id))
                }
              >
                Rotate 90°
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() =>
                  commitGeometry(
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
                  commitGeometry(deleteStairs(geometry, selectedStairs.id));
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
            commitGeometry(next);
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
            commitGeometry(next);
            setSheet(null);
            setSelectedWallId(null);
            setSelectedRoomId(newRoom?.id ?? null);
          }}
          onConfirmEdit={(id, widthIn, depthIn) => {
            if (geometry.stairs.some((s) => s.id === id)) {
              commitGeometry(resizeStairs(geometry, id, widthIn, depthIn));
            } else {
              commitGeometry(resizeRoom(geometry, id, widthIn, depthIn));
            }
            setSheet(null);
          }}
          onDelete={(roomId) => {
            commitGeometry(deleteRoom(geometry, roomId));
            setSelectedRoomId(null);
            setSheet(null);
          }}
        />
      ) : null}

      {typePickerOpen && selectedRoom ? (
        <RoomTypePicker
          currentType={normalizeRoomType(selectedRoom.type)}
          onClose={() => setTypePickerOpen(false)}
          onSelect={(type) => {
            commitGeometry(setRoomType(geometry, selectedRoom.id, type));
            setTypePickerOpen(false);
          }}
        />
      ) : null}

      {floorSheet ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="floor-sheet-title"
        >
          <div
            className={[
              "w-full max-w-md rounded-t-lg border border-border bg-elevated p-5 shadow-card",
              "max-h-[85dvh] overflow-y-auto sm:rounded-lg",
            ].join(" ")}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id="floor-sheet-title"
                className="text-lg font-semibold text-navy"
              >
                {floorSheet.kind === "add"
                  ? "Add floor"
                  : floorSheet.kind === "rename"
                    ? "Rename floor"
                    : "Delete floor"}
              </h2>
              <button
                type="button"
                className="inline-flex min-h-[var(--sp-touch-min)] min-w-[var(--sp-touch-min)] items-center justify-center rounded-sm text-fg-muted hover:bg-tinted hover:text-navy"
                aria-label="Close"
                onClick={() => {
                  setFloorSheet(null);
                  setFloorCustomName("");
                  setFloorDeleteConfirm("");
                  setFloorActionError(null);
                }}
              >
                ✕
              </button>
            </div>

            {floorSheet.kind === "add" ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg-muted">Choose a name</p>
                <div className="flex flex-wrap gap-2">
                  {ADD_FLOOR_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="secondary"
                      disabled={floorActionBusy}
                      onClick={() => handleAddFloor(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-navy">Custom name</span>
                  <input
                    className="min-h-[var(--sp-touch-min)] rounded-sm border border-border px-3 text-base"
                    value={floorCustomName}
                    onChange={(e) => setFloorCustomName(e.target.value)}
                    onFocus={() => setTyping(true)}
                    onBlur={() => setTyping(false)}
                    placeholder="e.g. Attic"
                  />
                </label>
                <Button
                  type="button"
                  disabled={floorActionBusy || !floorCustomName.trim()}
                  onClick={() => handleAddFloor(floorCustomName.trim())}
                >
                  Add floor
                </Button>
              </div>
            ) : null}

            {floorSheet.kind === "rename" ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-navy">Floor name</span>
                  <input
                    className="min-h-[var(--sp-touch-min)] rounded-sm border border-border px-3 text-base"
                    value={floorCustomName}
                    onChange={(e) => setFloorCustomName(e.target.value)}
                    onFocus={() => setTyping(true)}
                    onBlur={() => setTyping(false)}
                  />
                </label>
                <Button
                  type="button"
                  disabled={
                    floorActionBusy ||
                    !floorCustomName.trim() ||
                    floorCustomName.trim() === floorSheet.currentName
                  }
                  onClick={() => handleRenameFloor(floorCustomName.trim())}
                >
                  Save name
                </Button>
              </div>
            ) : null}

            {floorSheet.kind === "delete" ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg-muted">
                  Type{" "}
                  <span className="font-medium text-navy">
                    {floorSheet.floorName}
                  </span>{" "}
                  to confirm deletion. This cannot be undone.
                </p>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-navy">Floor name</span>
                  <input
                    className="min-h-[var(--sp-touch-min)] rounded-sm border border-border px-3 text-base"
                    value={floorDeleteConfirm}
                    onChange={(e) => setFloorDeleteConfirm(e.target.value)}
                    onFocus={() => setTyping(true)}
                    onBlur={() => setTyping(false)}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger hover:bg-danger/5"
                  disabled={
                    floorActionBusy ||
                    floorDeleteConfirm.trim() !== floorSheet.floorName
                  }
                  onClick={handleDeleteFloor}
                >
                  Delete floor
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
