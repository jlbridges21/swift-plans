"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { EditorCanvas } from "@/components/editor/EditorCanvas";
import {
  EditorActionBar,
  type ActionBarItem,
} from "@/components/editor/EditorActionBar";
import { ExportSheet } from "@/components/editor/ExportSheet";
import {
  EditorContextMenu,
  type ContextMenuItem,
} from "@/components/editor/EditorContextMenu";
import { PublishControls } from "@/components/projects/PublishControls";
import {
  RoomSheet,
  type RoomSheetMode,
} from "@/components/editor/RoomSheet";
import { RoomTypePicker } from "@/components/editor/RoomTypePicker";
import { RenameProjectForm } from "@/components/projects/ProjectManageForms";
import { Button } from "@/components/ui/Button";
import type { HitTarget } from "@/lib/plan/hit-test";
import { saveFloorGeometry, saveProjectStyleSettings } from "@/lib/plan/actions";
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
  finalizeGeometry,
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
import {
  type LabelSizeStep,
  type PlanStyleSettings,
} from "@/lib/plan/style-settings";
import type { FloorGeometry, PlanPoint } from "@/types/plan-geometry";

export type SaveStatus =
  | "saved"
  | "saving"
  | "dirty"
  | "error"
  | "error-retrying"
  | "auth";

type FloorSummary = {
  id: string;
  name: string;
  sort_order: number;
};

type EditorClientProps = {
  projectId: string;
  projectName: string;
  initialStyle: PlanStyleSettings;
  initialFloorId: string;
  initialFloors: FloorSummary[];
  initialGeometries: Record<string, FloorGeometry>;
  initialPublishStatus: "draft" | "published";
  publicSlug: string;
};

const WALL_THICKNESS_PRESETS = [3.5, 4, 4.5, 6, 8] as const;
const LABEL_SIZE_OPTIONS: LabelSizeStep[] = ["sm", "md", "lg"];

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
    case "auth":
      return "Session expired — sign in again. Your edits are still here.";
  }
}

function styleWallOpts(style: PlanStyleSettings) {
  return {
    wallExteriorIn: style.wallExteriorIn,
    wallInteriorIn: style.wallInteriorIn,
  };
}

function prepareFloorGeometry(
  raw: FloorGeometry,
  style: PlanStyleSettings,
): { geometry: FloorGeometry; didMigrate: boolean } {
  const migrated = migrateGeometry(raw);
  const geometry = finalizeGeometry(migrated.geometry, styleWallOpts(style));
  const wallsChanged =
    JSON.stringify(geometry.walls) !== JSON.stringify(migrated.geometry.walls);
  return {
    geometry,
    didMigrate: migrated.didMigrate || wallsChanged,
  };
}

function buildInitialHistories(
  floors: FloorSummary[],
  initialGeometries: Record<string, FloorGeometry>,
  style: PlanStyleSettings,
): {
  map: Map<string, GeometryHistory>;
  migrateFloors: Set<string>;
} {
  const map = new Map<string, GeometryHistory>();
  const migrateFloors = new Set<string>();
  for (const floor of floors) {
    const prepared = prepareFloorGeometry(initialGeometries[floor.id]!, style);
    map.set(floor.id, createGeometryHistory(prepared.geometry));
    if (prepared.didMigrate) migrateFloors.add(floor.id);
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
  initialStyle,
  initialFloorId,
  initialFloors,
  initialGeometries,
  initialPublishStatus,
  publicSlug,
}: EditorClientProps) {
  const router = useRouter();
  const initial = buildInitialHistories(
    initialFloors,
    initialGeometries,
    initialStyle,
  );
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
  const [style, setStyle] = useState(() => initialStyle);
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [reshape, setReshape] = useState(false);
  const [labelSelected, setLabelSelected] = useState(false);
  const [moveLocked, setMoveLocked] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    clientX: number;
    clientY: number;
    hit: HitTarget;
  } | null>(null);
  const [actionAnchor, setActionAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const zoomToFitRef = useRef<(() => void) | null>(null);
  const selectionAnchorRef = useRef<
    (() => { x: number; y: number } | null) | null
  >(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [interacting, setInteracting] = useState(false);
  const [typing, setTyping] = useState(false);

  const historyRef = useRef(history);
  const styleRef = useRef(initialStyle);
  const dirtyRef = useRef(false);
  const styleDirtyRef = useRef(false);
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
    if (
      !loadReadyRef.current ||
      (!dirtyRef.current && !styleDirtyRef.current) ||
      saveInFlightRef.current
    ) {
      return;
    }
    if (interactingRef.current || typingRef.current) return;

    saveInFlightRef.current = true;
    setSaveStatus(failCountRef.current > 0 ? "error-retrying" : "saving");
    const snapshot = historyRef.current.present;
    const floorId = floorIdRef.current;
    const styleSnapshot = styleRef.current;
    const saveGeometry = dirtyRef.current;
    const saveStyle = styleDirtyRef.current;

    try {
      let hadError = false;

      let authExpired = false;

      if (saveGeometry) {
        const result = await saveFloorGeometry(floorId, snapshot);
        if (result.ok) {
          if (historyRef.current.present === snapshot) {
            dirtyRef.current = false;
          }
          migrateSaveFloorsRef.current.delete(floorId);
        } else {
          hadError = true;
          if (result.code === "auth") authExpired = true;
        }
      }

      if (saveStyle && !hadError) {
        const result = await saveProjectStyleSettings(
          projectId,
          styleSnapshot as Record<string, unknown>,
        );
        if (result.ok) {
          if (styleRef.current === styleSnapshot) {
            styleDirtyRef.current = false;
          }
        } else {
          hadError = true;
          if (result.code === "auth") authExpired = true;
        }
      }

      if (!hadError) {
        failCountRef.current = 0;
        backoffRef.current = 1000;
        setSaveStatus(
          dirtyRef.current || styleDirtyRef.current ? "dirty" : "saved",
        );
        if (dirtyRef.current || styleDirtyRef.current) {
          clearSaveTimer();
          saveTimerRef.current = setTimeout(() => {
            void performSaveRef.current();
          }, SAVE_DEBOUNCE_MS);
        }
      } else if (authExpired) {
        clearSaveTimer();
        setSaveStatus("auth");
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
  }, [clearSaveTimer, projectId]);

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

  const scheduleStyleSave = useCallback(() => {
    if (!loadReadyRef.current) return;
    styleDirtyRef.current = true;
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
    if (!dirtyRef.current && !styleDirtyRef.current) return;

    await waitForSaveIdle(saveInFlightRef);
    if (!dirtyRef.current && !styleDirtyRef.current) return;

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
    if (!loadReadyRef.current || (!dirtyRef.current && !styleDirtyRef.current)) {
      return;
    }
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
      const styled = finalizeGeometry(next, styleWallOpts(styleRef.current));
      setHistory((h) => historyPush(h, styled));
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
    setHistory((h) => {
      const present = finalizeGeometry(
        h.present,
        styleWallOpts(styleRef.current),
      );
      return historyCommitGesture(
        { ...h, present },
        baseline,
      );
    });
    scheduleSave();
  }, [scheduleSave]);

  const handleMoveRoom = useCallback((roomId: string, dx: number, dy: number) => {
    dirtyRef.current = true;
    setHistory((h) =>
      historyReplacePresent(
        h,
        finalizeGeometry(
          translateRoom(h.present, roomId, dx, dy),
          styleWallOpts(styleRef.current),
        ),
      ),
    );
  }, []);

  const handleMoveOpening = useCallback(
    (openingId: string, offsetIn: number) => {
      dirtyRef.current = true;
      setHistory((h) =>
        historyReplacePresent(
          h,
          finalizeGeometry(
            moveOpening(h.present, openingId, offsetIn),
            styleWallOpts(styleRef.current),
          ),
        ),
      );
    },
    [],
  );

  const handleMoveStairs = useCallback(
    (stairsId: string, dx: number, dy: number) => {
      dirtyRef.current = true;
      setHistory((h) =>
        historyReplacePresent(
          h,
          finalizeGeometry(
            translateStairs(h.present, stairsId, dx, dy),
            styleWallOpts(styleRef.current),
          ),
        ),
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
          finalizeGeometry(
            moveRoomVertex(h.present, roomId, vertexIndex, x, y),
            styleWallOpts(styleRef.current),
          ),
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
      if (typingRef.current || sheet || typePickerOpen || floorSheet || styleSheetOpen || contextMenu) {
        if (e.key === "Escape" && contextMenu) {
          e.preventDefault();
          setContextMenu(null);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        clearSelection();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contextMenu, floorSheet, handleRedo, handleUndo, sheet, styleSheetOpen, typePickerOpen]);

  function clearSelection() {
    setSelectedRoomId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedStairsId(null);
    setSelectedVertexIndex(null);
    setTypePickerOpen(false);
    setReshape(false);
    setLabelSelected(false);
    setMoveLocked(false);
  }

  const switchFloor = useCallback(
    async (nextId: string) => {
      if (nextId === activeFloorId) return;

      await flushSaveNowRef.current();

      historiesRef.current.set(activeFloorId, historyRef.current);

      let nextHistory = historiesRef.current.get(nextId);
      if (!nextHistory) {
        const prepared = prepareFloorGeometry(
          initialGeometries[nextId]!,
          styleRef.current,
        );
        nextHistory = createGeometryHistory(prepared.geometry);
        historiesRef.current.set(nextId, nextHistory);
        if (prepared.didMigrate) migrateSaveFloorsRef.current.add(nextId);
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
        const prepared = prepareFloorGeometry(
          result.geometry,
          styleRef.current,
        );
        historiesRef.current.set(
          result.floor.id,
          createGeometryHistory(prepared.geometry),
        );
        if (prepared.didMigrate) migrateSaveFloorsRef.current.add(result.floor.id);
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
      const prepared = prepareFloorGeometry(result.geometry, styleRef.current);
      historiesRef.current.set(
        result.floor.id,
        createGeometryHistory(prepared.geometry),
      );
      if (prepared.didMigrate) migrateSaveFloorsRef.current.add(result.floor.id);
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
    const span = exteriorWallFloorSpan(geometry.rooms, selectedWallId, geometry.walls);
    if (!span) return;
    setTyping(true);
    setSheet({
      kind: "adjoin",
      wallId: selectedWallId,
      defaultWidthIn: span.length,
    });
  }, [geometry.rooms, geometry.walls, selectedWallId, wallCanAdjoin]);

  useEffect(() => {
    const update = () => {
      setActionAnchor(selectionAnchorRef.current?.() ?? null);
    };
    update();
    const id = window.setInterval(update, 250);
    window.addEventListener("resize", update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
    };
  }, [
    selectedRoomId,
    selectedWallId,
    selectedOpeningId,
    selectedStairsId,
    reshape,
    labelSelected,
    geometry,
  ]);

  function contextMenuItems(hit: HitTarget): ContextMenuItem[] {
    if (hit.kind === "pan") {
      return [
        { id: "add-room", label: "Add room" },
        { id: "zoom-fit", label: "Zoom to fit" },
      ];
    }
    if (hit.kind === "room" || hit.kind === "label" || hit.kind === "vertex") {
      return [
        { id: "move-room", label: "Move room" },
        { id: "rename", label: "Rename" },
        { id: "edit-dims", label: "Edit dimensions" },
        { id: "change-type", label: "Change room type" },
        { id: "reshape", label: reshape ? "Done reshaping" : "Reshape" },
        { id: "move-label", label: "Move label" },
        { id: "add-adjoining", label: "Add adjoining room" },
        { id: "delete-room", label: "Delete room", danger: true },
      ];
    }
    if (hit.kind === "wall") {
      const items: ContextMenuItem[] = [
        { id: "add-door", label: "Add door" },
        { id: "add-window", label: "Add window" },
        { id: "add-opening", label: "Add opening" },
      ];
      if (canAdjoinWall(geometry, hit.wallId)) {
        items.push({ id: "add-adjoining", label: "Add adjoining room" });
      }
      return items;
    }
    if (hit.kind === "opening") {
      const op = listOpenings(geometry).find((o) => o.id === hit.openingId);
      const items: ContextMenuItem[] = [
        { id: "opening-width", label: "Change width" },
      ];
      if (op?.kind === "door") {
        items.push(
          { id: "flip-swing", label: "Flip swing" },
          { id: "flip-hinge", label: "Flip hinge" },
        );
      }
      items.push({ id: "delete-opening", label: "Delete", danger: true });
      return items;
    }
    if (hit.kind === "stairs") {
      return [
        { id: "stairs-rotate", label: "Rotate" },
        { id: "stairs-flip", label: "Flip direction" },
        { id: "stairs-resize", label: "Resize" },
        { id: "delete-stairs", label: "Delete", danger: true },
      ];
    }
    return [];
  }

  function runContextAction(id: string, hit: HitTarget) {
    switch (id) {
      case "add-room":
        setTyping(true);
        setSheet({ kind: "add" });
        break;
      case "zoom-fit":
        zoomToFitRef.current?.();
        break;
      case "move-room":
        if (hit.kind === "room" || hit.kind === "label" || hit.kind === "vertex") {
          setSelectedRoomId(hit.roomId);
          setMoveLocked(true);
          setLabelSelected(false);
          setReshape(false);
        }
        break;
      case "rename":
      case "edit-dims": {
        const roomId =
          hit.kind === "room" || hit.kind === "label" || hit.kind === "vertex"
            ? hit.roomId
            : selectedRoomId;
        const room = geometry.rooms.find((r) => r.id === roomId);
        if (!room) break;
        setSelectedRoomId(room.id);
        const size = roomSizeInches(room);
        setTyping(true);
        setSheet({
          kind: "edit",
          roomId: room.id,
          name: room.name,
          widthIn: size.width,
          depthIn: size.depth,
        });
        break;
      }
      case "change-type": {
        const roomId =
          hit.kind === "room" || hit.kind === "label" || hit.kind === "vertex"
            ? hit.roomId
            : selectedRoomId;
        if (roomId) {
          setSelectedRoomId(roomId);
          setTypePickerOpen(true);
        }
        break;
      }
      case "reshape":
        if (hit.kind === "room" || hit.kind === "label" || hit.kind === "vertex") {
          setSelectedRoomId(hit.roomId);
        }
        setReshape((v) => !v);
        setLabelSelected(false);
        setMoveLocked(false);
        break;
      case "move-label":
        if (hit.kind === "room" || hit.kind === "label" || hit.kind === "vertex") {
          setSelectedRoomId(hit.roomId);
          setLabelSelected(true);
          setReshape(false);
        }
        break;
      case "add-adjoining":
        if (hit.kind === "wall") {
          setSelectedWallId(hit.wallId);
          if (canAdjoinWall(geometry, hit.wallId)) {
            const span = exteriorWallFloorSpan(
              geometry.rooms,
              hit.wallId,
              geometry.walls,
            );
            if (span) {
              setTyping(true);
              setSheet({
                kind: "adjoin",
                wallId: hit.wallId,
                defaultWidthIn: span.length,
              });
            }
          }
        } else if (selectedWallId && wallCanAdjoin) {
          openAdjoinSheet();
        } else if (hit.kind === "room") {
          // Pick longest exterior wall of the room for adjoin
          const walls = geometry.walls.filter(
            (w) => w.kind === "exterior" && w.roomIds.includes(hit.roomId),
          );
          const wall = walls[0];
          if (wall && canAdjoinWall(geometry, wall.id)) {
            setSelectedRoomId(hit.roomId);
            setSelectedWallId(wall.id);
            const span = exteriorWallFloorSpan(
              geometry.rooms,
              wall.id,
              geometry.walls,
            );
            if (span) {
              setTyping(true);
              setSheet({
                kind: "adjoin",
                wallId: wall.id,
                defaultWidthIn: span.length,
              });
            }
          }
        }
        break;
      case "delete-room": {
        const roomId =
          hit.kind === "room" || hit.kind === "label" || hit.kind === "vertex"
            ? hit.roomId
            : selectedRoomId;
        if (roomId) {
          commitGeometry(deleteRoom(geometry, roomId));
          clearSelection();
        }
        break;
      }
      case "add-door":
        if (hit.kind === "wall") {
          commitGeometry(addDoorOnWall(geometry, hit.wallId));
        }
        break;
      case "add-window":
        if (hit.kind === "wall") {
          commitGeometry(addWindowOnWall(geometry, hit.wallId));
        }
        break;
      case "add-opening":
        if (hit.kind === "wall") {
          commitGeometry(addOpeningOnWall(geometry, hit.wallId));
        }
        break;
      case "opening-width":
        if (hit.kind === "opening") {
          setSelectedOpeningId(hit.openingId);
          // focus existing width field via selection — panel shows width
        }
        break;
      case "flip-swing":
        if (hit.kind === "opening") {
          commitGeometry(flipDoorSwing(geometry, hit.openingId));
        }
        break;
      case "flip-hinge":
        if (hit.kind === "opening") {
          commitGeometry(flipDoorHinge(geometry, hit.openingId));
        }
        break;
      case "delete-opening":
        if (hit.kind === "opening") {
          commitGeometry(deleteOpening(geometry, hit.openingId));
          setSelectedOpeningId(null);
        }
        break;
      case "stairs-rotate":
        if (hit.kind === "stairs") {
          commitGeometry(rotateStairs(geometry, hit.stairsId));
        }
        break;
      case "stairs-flip":
        if (hit.kind === "stairs") {
          commitGeometry(toggleStairsDirection(geometry, hit.stairsId));
        }
        break;
      case "stairs-resize":
        if (hit.kind === "stairs") {
          setSelectedStairsId(hit.stairsId);
        }
        break;
      case "delete-stairs":
        if (hit.kind === "stairs") {
          commitGeometry(deleteStairs(geometry, hit.stairsId));
          setSelectedStairsId(null);
        }
        break;
      default:
        break;
    }
  }

  function actionBarItems(): ActionBarItem[] {
    if (selectedStairsId) {
      return [
        { id: "stairs-rotate", label: "Rotate" },
        { id: "stairs-flip", label: "Flip" },
        { id: "stairs-resize", label: "Resize" },
        { id: "delete-stairs", label: "Delete", danger: true },
      ];
    }
    if (selectedOpeningId) {
      const items: ActionBarItem[] = [
        { id: "opening-width", label: "Width" },
      ];
      if (selectedOpening?.kind === "door") {
        items.push(
          { id: "flip-swing", label: "Flip swing" },
          { id: "flip-hinge", label: "Flip hinge" },
        );
      }
      items.push({ id: "delete-opening", label: "Delete", danger: true });
      return items;
    }
    if (selectedWallId) {
      const items: ActionBarItem[] = [
        { id: "add-door", label: "Door" },
        { id: "add-window", label: "Window" },
        { id: "add-opening", label: "Opening" },
      ];
      if (wallCanAdjoin) {
        items.push({ id: "add-adjoining", label: "Add room here" });
      }
      return items;
    }
    if (selectedRoomId) {
      return [
        { id: "move-lock", label: "Move", active: moveLocked },
        {
          id: "reshape",
          label: reshape ? "Done" : "Reshape",
          active: reshape,
        },
        { id: "rename", label: "Rename" },
        { id: "change-type", label: "Type" },
        { id: "edit-dims", label: "Dimensions" },
        { id: "delete-room", label: "Delete", danger: true },
      ];
    }
    return [];
  }

  function runActionBar(id: string) {
    if (id === "move-lock") {
      setMoveLocked((v) => !v);
      setReshape(false);
      setLabelSelected(false);
      return;
    }
    if (id === "reshape") {
      setReshape((v) => !v);
      setMoveLocked(false);
      setLabelSelected(false);
      return;
    }
    if (id === "rename" || id === "edit-dims") {
      openEditSheet();
      return;
    }
    if (id === "change-type") {
      setTypePickerOpen(true);
      return;
    }
    if (id === "delete-room" && selectedRoomId) {
      commitGeometry(deleteRoom(geometry, selectedRoomId));
      clearSelection();
      return;
    }
    if (id === "add-door" && selectedWallId) {
      commitGeometry(addDoorOnWall(geometry, selectedWallId));
      return;
    }
    if (id === "add-window" && selectedWallId) {
      commitGeometry(addWindowOnWall(geometry, selectedWallId));
      return;
    }
    if (id === "add-opening" && selectedWallId) {
      commitGeometry(addOpeningOnWall(geometry, selectedWallId));
      return;
    }
    if (id === "add-adjoining") {
      openAdjoinSheet();
      return;
    }
    if (id === "opening-width") {
      // Width field is in the opening panel below
      return;
    }
    if (id === "flip-swing" && selectedOpeningId) {
      commitGeometry(flipDoorSwing(geometry, selectedOpeningId));
      return;
    }
    if (id === "flip-hinge" && selectedOpeningId) {
      commitGeometry(flipDoorHinge(geometry, selectedOpeningId));
      return;
    }
    if (id === "delete-opening" && selectedOpeningId) {
      commitGeometry(deleteOpening(geometry, selectedOpeningId));
      setSelectedOpeningId(null);
      return;
    }
    if (id === "stairs-rotate" && selectedStairsId) {
      commitGeometry(rotateStairs(geometry, selectedStairsId));
      return;
    }
    if (id === "stairs-flip" && selectedStairsId) {
      commitGeometry(toggleStairsDirection(geometry, selectedStairsId));
      return;
    }
    if (id === "delete-stairs" && selectedStairsId) {
      commitGeometry(deleteStairs(geometry, selectedStairsId));
      setSelectedStairsId(null);
    }
  }

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

  const patchStyle = useCallback(
    (patch: Partial<PlanStyleSettings>) => {
      setStyle((prev) => {
        const next = { ...prev, ...patch };
        styleRef.current = next;
        return next;
      });
      scheduleStyleSave();
    },
    [scheduleStyleSave],
  );

  const applyWallThickness = useCallback(
    (
      patch: Partial<
        Pick<PlanStyleSettings, "wallExteriorIn" | "wallInteriorIn">
      >,
    ) => {
      const next = { ...styleRef.current, ...patch };
      styleRef.current = next;
      setStyle(next);
      commitGeometry(
        finalizeGeometry(historyRef.current.present, {
          wallExteriorIn: next.wallExteriorIn,
          wallInteriorIn: next.wallInteriorIn,
        }),
      );
      scheduleStyleSave();
    },
    [commitGeometry, scheduleStyleSave],
  );

  return (
    <div
      className={[
        "fixed inset-0 z-0 flex flex-col overflow-hidden bg-paper",
        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
      ].join(" ")}
    >
      <header className="relative z-20 shrink-0 border-b border-border bg-elevated/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard"
              className="shrink-0 text-sm font-medium text-accent hover:underline"
            >
              ← Dashboard
            </Link>
            <h1 className="truncate text-base font-semibold tracking-tight text-navy sm:text-lg">
              {projectName}
            </h1>
            <RenameProjectForm projectId={projectId} name={projectName} />
          </div>
          <button
            type="button"
            className="shrink-0 text-left text-xs text-fg-muted sm:text-sm"
            aria-live="polite"
            onClick={() => {
              if (saveStatus === "auth") {
                router.push(
                  `/sign-in?next=${encodeURIComponent(`/editor/${projectId}`)}`,
                );
                return;
              }
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
        {saveStatus === "auth" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-tinted px-3 py-2 sm:px-4">
            <p className="text-sm text-navy">
              Your session expired. Sign in again to keep saving — edits on this
              device are still here.
            </p>
            <Link
              href={`/sign-in?next=${encodeURIComponent(`/editor/${projectId}`)}`}
              className="inline-flex min-h-[44px] items-center rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              Sign in
            </Link>
          </div>
        ) : null}
        <div className="border-t border-border px-3 py-2 sm:px-4">
          <PublishControls
            projectId={projectId}
            initialStatus={initialPublishStatus}
            publicSlug={publicSlug}
            compact
          />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="absolute inset-0">
          <EditorCanvas
            geometry={geometry}
            style={style}
            selectedRoomId={selectedRoomId}
            selectedWallId={selectedWallId}
            selectedOpeningId={selectedOpeningId}
            selectedStairsId={selectedStairsId}
            selectedVertexIndex={selectedVertexIndex}
            labelSelected={labelSelected}
            reshape={reshape}
            moveLocked={moveLocked}
            onSelectRoom={(id) => {
              setSelectedRoomId(id);
              setSelectedWallId(null);
              setSelectedOpeningId(null);
              setSelectedStairsId(null);
              setSelectedVertexIndex(null);
              setLabelSelected(false);
              if (!id) {
                setTypePickerOpen(false);
                setReshape(false);
                setMoveLocked(false);
              } else if (id !== selectedRoomId) {
                setReshape(false);
                setMoveLocked(false);
              }
              if (!id && sheet?.kind === "edit") setSheet(null);
            }}
            onSelectWall={(id) => {
              setSelectedWallId(id);
              if (id) {
                const wall = geometry.walls.find((w) => w.id === id);
                if (wall?.roomIds[0]) setSelectedRoomId(wall.roomIds[0]);
                setSelectedOpeningId(null);
                setSelectedStairsId(null);
                setSelectedVertexIndex(null);
                setLabelSelected(false);
                setTypePickerOpen(false);
              }
            }}
            onSelectOpening={(id) => {
              setSelectedOpeningId(id);
              if (id) {
                const op = listOpenings(geometry).find((o) => o.id === id);
                if (op) setSelectedRoomId(op.roomId);
                setSelectedWallId(null);
                setSelectedStairsId(null);
                setSelectedVertexIndex(null);
                setLabelSelected(false);
                setTypePickerOpen(false);
              }
            }}
            onSelectStairs={(id) => {
              setSelectedStairsId(id);
              if (id) {
                setSelectedWallId(null);
                setSelectedOpeningId(null);
                setSelectedVertexIndex(null);
                setLabelSelected(false);
                setReshape(false);
                setTypePickerOpen(false);
              }
            }}
            onSelectVertex={(roomId, vertexIndex) => {
              setSelectedRoomId(roomId);
              setSelectedVertexIndex(vertexIndex);
              setSelectedWallId(null);
              setSelectedOpeningId(null);
              setSelectedStairsId(null);
              setLabelSelected(false);
              setTypePickerOpen(false);
            }}
            onSelectLabel={(roomId) => {
              if (!roomId) {
                setLabelSelected(false);
                return;
              }
              setSelectedRoomId(roomId);
              setLabelSelected(true);
              setSelectedWallId(null);
              setSelectedOpeningId(null);
              setSelectedStairsId(null);
              setSelectedVertexIndex(null);
            }}
            onClearSelection={clearSelection}
            onMoveRoom={handleMoveRoom}
            onMoveOpening={handleMoveOpening}
            onMoveStairs={handleMoveStairs}
            onMoveLabel={handleMoveLabel}
            onMoveVertex={handleMoveVertex}
            onInsertVertex={handleInsertVertex}
            onDocumentGestureStart={handleDocumentGestureStart}
            onDocumentGestureEnd={handleDocumentGestureEnd}
            onInteractionChange={handleInteractionChange}
            onContextMenuRequest={(req) => setContextMenu(req)}
            onZoomToFitRef={zoomToFitRef}
            onSelectionAnchorRef={selectionAnchorRef}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-2 sm:p-3">
          <div
            className="pointer-events-auto flex gap-1 overflow-x-auto rounded-lg border border-border/80 bg-elevated/90 p-1 shadow-card backdrop-blur-sm"
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
                    : "border-transparent text-fg-muted hover:bg-tinted/50",
                ].join(" ")}
                onClick={() => void switchFloor(floor.id)}
              >
                {floor.name}
              </button>
            ))}
          </div>

          <div className="pointer-events-auto flex max-h-[40dvh] flex-col gap-2 overflow-y-auto rounded-lg border border-border/80 bg-elevated/90 p-2 shadow-card backdrop-blur-sm sm:max-h-none sm:overflow-visible">
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStyleSheetOpen(true)}
              >
                Style
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setExportSheetOpen(true)}
              >
                Export
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
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-stretch gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-end sm:p-3">
          {selectedRoom && !sheet ? (
            <aside
              className={[
                "pointer-events-auto flex max-h-[45dvh] w-full flex-col gap-3 overflow-y-auto",
                "rounded-lg border border-border/80 bg-elevated/95 p-4 shadow-card backdrop-blur-sm",
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
                "pointer-events-auto flex max-h-[45dvh] w-full flex-col gap-3 overflow-y-auto",
                "rounded-lg border border-border/80 bg-elevated/95 p-4 shadow-card backdrop-blur-sm",
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
                "pointer-events-auto flex max-h-[45dvh] w-full flex-col gap-3 overflow-y-auto",
                "rounded-lg border border-border/80 bg-elevated/95 p-4 shadow-card backdrop-blur-sm",
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
                "pointer-events-auto flex max-h-[45dvh] w-full flex-col gap-3 overflow-y-auto",
                "rounded-lg border border-border/80 bg-elevated/95 p-4 shadow-card backdrop-blur-sm",
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
      </div>

      <EditorActionBar
        items={actionBarItems()}
        anchorClient={actionAnchor}
        onAction={runActionBar}
      />

      {contextMenu ? (
        <EditorContextMenu
          open
          clientX={contextMenu.clientX}
          clientY={contextMenu.clientY}
          items={contextMenuItems(contextMenu.hit)}
          onSelect={(id) => runContextAction(id, contextMenu.hit)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

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

      {styleSheetOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="style-sheet-title"
        >
          <div
            className={[
              "pointer-events-auto w-full max-w-md rounded-t-lg border border-border bg-elevated p-5 shadow-card",
              "max-h-[85dvh] overflow-y-auto sm:rounded-lg",
            ].join(" ")}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id="style-sheet-title"
                className="text-lg font-semibold text-navy"
              >
                Plan style
              </h2>
              <button
                type="button"
                className="inline-flex min-h-[var(--sp-touch-min)] min-w-[var(--sp-touch-min)] items-center justify-center rounded-sm text-fg-muted hover:bg-tinted hover:text-navy"
                aria-label="Close"
                onClick={() => setStyleSheetOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-navy">Wall thickness</h3>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-navy">Exterior</span>
                  <input
                    className="min-h-[var(--sp-touch-min)] rounded-sm border border-border px-3 text-base"
                    inputMode="decimal"
                    defaultValue={formatMeasure(style.wallExteriorIn)}
                    key={`ext-${style.wallExteriorIn}`}
                    onFocus={() => setTyping(true)}
                    onBlur={(e) => {
                      setTyping(false);
                      const parsed = parseMeasure(e.target.value);
                      if (parsed.ok && parsed.inches !== style.wallExteriorIn) {
                        applyWallThickness({ wallExteriorIn: parsed.inches });
                      }
                    }}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {WALL_THICKNESS_PRESETS.map((preset) => (
                    <Button
                      key={`ext-${preset}`}
                      type="button"
                      variant={
                        style.wallExteriorIn === preset ? "primary" : "secondary"
                      }
                      onClick={() =>
                        applyWallThickness({ wallExteriorIn: preset })
                      }
                    >
                      {formatMeasure(preset)}
                    </Button>
                  ))}
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-navy">Interior</span>
                  <input
                    className="min-h-[var(--sp-touch-min)] rounded-sm border border-border px-3 text-base"
                    inputMode="decimal"
                    defaultValue={formatMeasure(style.wallInteriorIn)}
                    key={`int-${style.wallInteriorIn}`}
                    onFocus={() => setTyping(true)}
                    onBlur={(e) => {
                      setTyping(false);
                      const parsed = parseMeasure(e.target.value);
                      if (parsed.ok && parsed.inches !== style.wallInteriorIn) {
                        applyWallThickness({ wallInteriorIn: parsed.inches });
                      }
                    }}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {WALL_THICKNESS_PRESETS.map((preset) => (
                    <Button
                      key={`int-${preset}`}
                      type="button"
                      variant={
                        style.wallInteriorIn === preset ? "primary" : "secondary"
                      }
                      onClick={() =>
                        applyWallThickness({ wallInteriorIn: preset })
                      }
                    >
                      {formatMeasure(preset)}
                    </Button>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-navy">Labels</h3>
                <div className="flex flex-wrap gap-2">
                  {LABEL_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={size}
                      type="button"
                      variant={style.labelSize === size ? "primary" : "secondary"}
                      onClick={() => patchStyle({ labelSize: size })}
                    >
                      {size.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-navy">Display</h3>
                <label className="flex min-h-[var(--sp-touch-min)] items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={style.showRoomDimensions}
                    onChange={(e) =>
                      patchStyle({ showRoomDimensions: e.target.checked })
                    }
                  />
                  <span>Room dimensions</span>
                </label>
                <label className="flex min-h-[var(--sp-touch-min)] items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={style.showRoomAreas}
                    onChange={(e) =>
                      patchStyle({ showRoomAreas: e.target.checked })
                    }
                  />
                  <span>Room areas</span>
                </label>
                <label className="flex min-h-[var(--sp-touch-min)] items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={style.showTotalArea}
                    onChange={(e) =>
                      patchStyle({ showTotalArea: e.target.checked })
                    }
                  />
                  <span>Total area</span>
                </label>
                <label className="flex min-h-[var(--sp-touch-min)] items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={style.showRoomFills}
                    onChange={(e) =>
                      patchStyle({ showRoomFills: e.target.checked })
                    }
                  />
                  <span>Room fills</span>
                </label>
                <label className="flex min-h-[var(--sp-touch-min)] items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={style.showFloorTexture}
                    onChange={(e) =>
                      patchStyle({ showFloorTexture: e.target.checked })
                    }
                  />
                  <span>Floor texture</span>
                </label>
                <label className="flex min-h-[var(--sp-touch-min)] items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={style.showDoorSwings}
                    onChange={(e) =>
                      patchStyle({ showDoorSwings: e.target.checked })
                    }
                  />
                  <span>Door swings</span>
                </label>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {exportSheetOpen ? (
        <ExportSheet
          projectName={projectName}
          floorName={activeFloor?.name ?? "Floor"}
          floors={floors.map((f) => ({ id: f.id, name: f.name }))}
          geometry={geometry}
          allGeometries={Object.fromEntries(
            floors.map((f) => {
              if (f.id === activeFloorId) return [f.id, geometry];
              const hist = historiesRef.current.get(f.id);
              const geo =
                hist?.present ??
                initialGeometries[f.id] ??
                geometry;
              return [f.id, geo];
            }),
          )}
          style={style}
          onClose={() => setExportSheetOpen(false)}
        />
      ) : null}
    </div>
  );
}
