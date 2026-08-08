import {
  doorSwingPaths,
  formatRoomDimensions,
  pointsToPath,
  polygonAreaSqIn,
  ringsToPath,
  roomLongAxisDegrees,
  sqInToSqFt,
  wallPolygonFromCenterline,
  windowPaneLines,
} from "@/components/plan/geometry";
import {
  PLAN_FONT_FAMILY,
  planTokens,
} from "@/lib/plan-style/tokens";
import {
  planFontFaceCss,
  planFontFaceCssForScreen,
} from "@/lib/plan-style/plan-font";
import {
  brandingHasContent,
  type PlanBranding,
} from "@/lib/plan/branding";
import { livingAreaSqFt } from "@/lib/plan/area";
import {
  estimateLabelTextWidth,
  roomAabb,
} from "@/lib/plan/labels";
import {
  floorTextureForRoomType,
  normalizeRoomType,
} from "@/lib/plan/room-types";
import {
  doorHingeLatchFromAnchor,
  resolveOpeningGeom,
} from "@/lib/plan/resolve-opening";
import { stairsDirectionVector, stairsPolygon } from "@/lib/plan/stairs";
import {
  DEFAULT_PLAN_STYLE,
  LABEL_SIZE_PX,
  type PlanStyleSettings,
} from "@/lib/plan/style-settings";
import {
  isEmptyFloorGeometry,
  type FloorGeometry,
  type PlanRoom,
} from "@/types/plan-geometry";

/** Finite viewBox parts for empty and non-empty documents. */
export function planViewBox(
  geometry: FloorGeometry,
  style: PlanStyleSettings = DEFAULT_PLAN_STYLE,
): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  void style;
  const margin = planTokens.sheetMargin;
  const { bounds } = geometry.meta;
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    width: bounds.maxX - bounds.minX + margin * 2,
    height: bounds.maxY - bounds.minY + margin * 2,
  };
}

type PlanDocumentProps = {
  geometry: FloorGeometry;
  style?: PlanStyleSettings;
  /** When set and non-empty, renders a restrained branding footer. */
  branding?: PlanBranding | null;
  /**
   * When true, embed the plan font as a data-URI @font-face (standalone SVG).
   * When false (editor), use the public /fonts path.
   */
  embedFont?: boolean;
  /** Optional precomputed font-face CSS (avoids reading filesystem). */
  fontFaceCss?: string;
};

type LabelLayout = {
  showDims: boolean;
  showArea: boolean;
  nameSize: number;
};

function labelLayoutForRoom(
  room: PlanRoom,
  style: PlanStyleSettings,
): LabelLayout {
  const box = roomAabb(room);
  const avail =
    box.maxX - box.minX - planTokens.labelFit.paddingIn * 2;
  const name = room.name.toUpperCase();
  const dims = formatRoomDimensions(room.polygon);
  const area = `≈ ${Math.round(sqInToSqFt(polygonAreaSqIn(room.polygon)))} SQ FT`;

  let nameSize = LABEL_SIZE_PX[style.labelSize];
  const nameFits = (size: number) =>
    estimateLabelTextWidth(name, size) <= Math.max(avail, 1);

  while (nameSize > planTokens.labelFit.minNameSize && !nameFits(nameSize)) {
    nameSize -= 1;
  }

  const dimsW = estimateLabelTextWidth(
    dims,
    planTokens.typography.dimensionSize,
  );
  const areaW = estimateLabelTextWidth(area, planTokens.typography.areaSize);
  const showDims = style.showRoomDimensions && dimsW <= avail;
  const showArea =
    style.showRoomAreas && showDims && areaW <= avail;

  return { showDims, showArea, nameSize };
}

/**
 * Pure document layers (no SVG root, no editing chrome).
 * Safe to place inside an editor camera SVG or a standalone PlanDrawing.
 */
export function PlanDocument({
  geometry,
  style = DEFAULT_PLAN_STYLE,
  branding = null,
  embedFont = false,
  fontFaceCss,
}: PlanDocumentProps) {
  const { bounds, title } = geometry.meta;
  const margin = planTokens.sheetMargin;
  const empty = isEmptyFloorGeometry(geometry);

  const livingSqFt = livingAreaSqFt(geometry);
  const totalLivingSqFt = livingSqFt ?? 0;
  const showBranding = brandingHasContent(branding);

  const texturedRooms = style.showFloorTexture
    ? geometry.rooms.filter(
        (room) =>
          floorTextureForRoomType(normalizeRoomType(room.type)) !== "none",
      )
    : [];

  const faceCss =
    fontFaceCss ??
    (embedFont ? planFontFaceCss() : planFontFaceCssForScreen());

  return (
    <g aria-label={title || "Floor plan"}>
      <defs>
        {faceCss ? <style type="text/css">{faceCss}</style> : null}
        {texturedRooms.map((room) => {
          const texture = floorTextureForRoomType(
            normalizeRoomType(room.type),
          );
          const clipId = `clip-${room.id}`;
          const pattern =
            texture === "plank" ? (
              <pattern
                key={`tex-${room.id}`}
                id={`tex-${room.id}`}
                width={planTokens.plankSpacing}
                height={planTokens.plankSpacing}
                patternUnits="userSpaceOnUse"
                patternTransform={`rotate(${roomLongAxisDegrees(room.polygon)})`}
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2={planTokens.plankSpacing}
                  stroke={planTokens.symbol}
                  strokeWidth={planTokens.stroke.annotation}
                  opacity={planTokens.textureOpacity}
                />
              </pattern>
            ) : (
              <pattern
                key={`tex-${room.id}`}
                id={`tex-${room.id}`}
                width={planTokens.tileSpacing}
                height={planTokens.tileSpacing}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M 0 ${planTokens.tileSpacing / 2} H ${planTokens.tileSpacing} M ${planTokens.tileSpacing / 2} 0 V ${planTokens.tileSpacing}`}
                  fill="none"
                  stroke={planTokens.symbol}
                  strokeWidth={planTokens.stroke.annotation}
                  opacity={planTokens.textureOpacity}
                />
              </pattern>
            );
          return (
            <g key={`defs-${room.id}`}>
              <clipPath id={clipId}>
                <path d={pointsToPath(room.polygon)} />
              </clipPath>
              {pattern}
            </g>
          );
        })}
      </defs>

      {empty ? (
        <text
          x={(bounds.minX + bounds.maxX) / 2}
          y={(bounds.minY + bounds.maxY) / 2}
          textAnchor="middle"
          fontFamily={PLAN_FONT_FAMILY}
          fill={planTokens.inkSubtle}
          fontSize={14}
        >
          Empty floor plan — add your first room next
        </text>
      ) : null}

      {geometry.rooms.map((room) => {
        const fill = planTokens.fill[room.category];
        return (
          <g key={`fill-${room.id}`}>
            {style.showRoomFills ? (
              <path
                d={pointsToPath(room.polygon)}
                fill={fill}
                stroke={fill}
                strokeWidth={1}
                strokeLinejoin="miter"
              />
            ) : null}
            {style.showFloorTexture &&
            floorTextureForRoomType(normalizeRoomType(room.type)) !==
              "none" ? (
              <path
                d={pointsToPath(room.polygon)}
                fill={`url(#tex-${room.id})`}
                stroke="none"
                clipPath={`url(#clip-${room.id})`}
              />
            ) : null}
          </g>
        );
      })}

      {geometry.walls
        .filter((w) => w.kind === "interior")
        .map((wall) => {
          const fill = wallPolygonFromCenterline(
            wall.centerline,
            wall.thickness,
            wall.closed,
          );
          return (
            <path
              key={wall.id}
              d={ringsToPath(fill.rings)}
              fill={planTokens.ink}
              fillRule="evenodd"
              stroke="none"
            />
          );
        })}
      {geometry.walls
        .filter((w) => w.kind === "exterior")
        .map((wall) => {
          const fill = wallPolygonFromCenterline(
            wall.centerline,
            wall.thickness,
            wall.closed,
          );
          return (
            <path
              key={wall.id}
              d={ringsToPath(fill.rings)}
              fill={planTokens.ink}
              fillRule="evenodd"
              stroke="none"
            />
          );
        })}

      {geometry.windows.map((win) => {
        const geom = resolveOpeningGeom(geometry, win);
        if (!geom) return null;
        const [a1, b1, a2, b2] = windowPaneLines(
          geom.start,
          geom.end,
          geom.thickness,
          planTokens.window.insetRatio,
        );
        return (
          <g
            key={win.id}
            fill="none"
            stroke={planTokens.symbol}
            strokeWidth={planTokens.window.stroke}
            strokeLinecap="square"
          >
            <line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} />
            <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
          </g>
        );
      })}

      {geometry.doors.map((door) => {
        const resolved = doorHingeLatchFromAnchor(geometry, door);
        if (!resolved) return null;
        const { hinge, latch, thickness } = resolved;
        const { leaf, arc } = doorSwingPaths(hinge, latch, door.swingSide);
        return (
          <g
            key={door.id}
            fill="none"
            stroke={planTokens.symbol}
            strokeWidth={planTokens.doorSwing.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line
              x1={hinge.x}
              y1={hinge.y}
              x2={latch.x}
              y2={latch.y}
              stroke={planTokens.paper}
              strokeWidth={thickness * 0.85}
              strokeLinecap="butt"
            />
            {style.showDoorSwings ? <path d={arc} /> : null}
            <path d={leaf} />
          </g>
        );
      })}

      {geometry.stairs.map((stair) => {
        const poly = stairsPolygon(stair);
        const dir = stairsDirectionVector(stair);
        const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
        const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
        const arrowLen = Math.min(stair.widthIn, stair.depthIn) * 0.35;
        const tip = {
          x: cx + dir.x * arrowLen,
          y: cy + dir.y * arrowLen,
        };
        const treadCount = Math.max(3, Math.round(stair.depthIn / 12));
        const treads = [];
        for (let i = 1; i < treadCount; i += 1) {
          const t = i / treadCount;
          const left = {
            x: poly[0].x + (poly[3].x - poly[0].x) * t,
            y: poly[0].y + (poly[3].y - poly[0].y) * t,
          };
          const right = {
            x: poly[1].x + (poly[2].x - poly[1].x) * t,
            y: poly[1].y + (poly[2].y - poly[1].y) * t,
          };
          treads.push(
            <line
              key={`tread-${stair.id}-${i}`}
              x1={left.x}
              y1={left.y}
              x2={right.x}
              y2={right.y}
              stroke={planTokens.symbol}
              strokeWidth={planTokens.stroke.annotation}
            />,
          );
        }
        return (
          <g key={stair.id}>
            <path
              d={pointsToPath(poly)}
              fill="none"
              stroke={planTokens.ink}
              strokeWidth={planTokens.stroke.fixture}
            />
            {treads}
            <line
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke={planTokens.ink}
              strokeWidth={planTokens.stroke.fixture}
              strokeLinecap="round"
            />
            <text
              x={cx}
              y={cy - 8}
              textAnchor="middle"
              fontFamily={PLAN_FONT_FAMILY}
              fill={planTokens.inkMuted}
              fontSize={11}
              fontWeight={600}
            >
              {stair.direction.toUpperCase()}
            </text>
          </g>
        );
      })}

      {geometry.rooms.map((room) => {
        const at = room.labelAnchor;
        const area = Math.round(sqInToSqFt(polygonAreaSqIn(room.polygon)));
        const dims = formatRoomDimensions(room.polygon);
        const layout = labelLayoutForRoom(room, style);
        return (
          <text
            key={`label-${room.id}`}
            x={at.x}
            y={at.y}
            textAnchor="middle"
            fontFamily={PLAN_FONT_FAMILY}
          >
            <tspan
              x={at.x}
              dy="0"
              fill={planTokens.inkMuted}
              fontSize={layout.nameSize}
              fontWeight={planTokens.typography.labelWeight}
              letterSpacing={planTokens.typography.labelLetterSpacing}
            >
              {room.name.toUpperCase()}
            </tspan>
            {layout.showDims ? (
              <tspan
                x={at.x}
                dy={planTokens.labelFit.dimLineDy}
                fill={planTokens.inkSubtle}
                fontSize={planTokens.typography.dimensionSize}
                fontWeight={400}
                letterSpacing="0.04em"
              >
                {dims}
              </tspan>
            ) : null}
            {layout.showArea ? (
              <tspan
                x={at.x}
                dy={planTokens.labelFit.areaLineDy}
                fill={planTokens.inkSubtle}
                fontSize={planTokens.typography.areaSize}
                fontWeight={400}
              >
                {`≈ ${area} SQ FT`}
              </tspan>
            ) : null}
          </text>
        );
      })}

      {!empty ? (
        <g
          transform={`translate(${bounds.minX + margin * 0.12}, ${bounds.maxY + margin * 0.42})`}
        >
          <text
            fontFamily={PLAN_FONT_FAMILY}
            fill={planTokens.inkMuted}
            fontSize={13}
            fontWeight={600}
            letterSpacing="0.14em"
          >
            {(title || "FLOOR PLAN").toUpperCase()}
          </text>
          {style.showTotalArea && livingSqFt !== null ? (
            <text
              y={22}
              fontFamily={PLAN_FONT_FAMILY}
              fill={planTokens.inkSubtle}
              fontSize={planTokens.typography.totalAreaSize}
              fontWeight={600}
              letterSpacing="0.08em"
            >
              TOTAL LIVING AREA{"  "}≈{" "}
              {Math.round(totalLivingSqFt).toLocaleString()} SQ FT
              {"  "}(APPROX)
            </text>
          ) : null}
        </g>
      ) : null}

      {showBranding && branding && !empty ? (
        <g
          data-plan-branding="true"
          transform={`translate(${bounds.maxX - margin * 0.12}, ${bounds.maxY + margin * 0.42})`}
        >
          {(() => {
            // Standalone SVG must never reference external logo URLs.
            const logoHref = embedFont
              ? branding.logoDataUri
              : branding.logoDataUri || branding.logoUrl;
            const hasLogo = Boolean(logoHref);
            const textY0 = hasLogo ? 14 : 0;
            return (
              <>
                {logoHref ? (
                  <image
                    href={logoHref}
                    x={-120}
                    y={0}
                    width={36}
                    height={36}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : null}
                <text
                  textAnchor="end"
                  fontFamily={PLAN_FONT_FAMILY}
                  fill={planTokens.inkMuted}
                  fontSize={11}
                  fontWeight={600}
                  letterSpacing="0.06em"
                  x={0}
                  y={textY0}
                >
                  {(branding.companyName || "").toUpperCase()}
                </text>
                {branding.website ? (
                  <text
                    textAnchor="end"
                    fontFamily={PLAN_FONT_FAMILY}
                    fill={planTokens.inkSubtle}
                    fontSize={9}
                    fontWeight={400}
                    x={0}
                    y={textY0 + 14}
                  >
                    {branding.website}
                  </text>
                ) : null}
                {branding.footerText ? (
                  <text
                    textAnchor="end"
                    fontFamily={PLAN_FONT_FAMILY}
                    fill={planTokens.inkSubtle}
                    fontSize={9}
                    fontWeight={400}
                    x={0}
                    y={textY0 + (branding.website ? 28 : 14)}
                  >
                    {branding.footerText}
                  </text>
                ) : null}
              </>
            );
          })()}
        </g>
      ) : null}
    </g>
  );
}

type PlanDrawingProps = {
  geometry: FloorGeometry;
  style?: PlanStyleSettings;
  branding?: PlanBranding | null;
  embedFont?: boolean;
  fontFaceCss?: string;
  /** Explicit pixel size for standalone export files. */
  exportWidthPx?: number;
  exportHeightPx?: number;
};

/** Standalone document renderer (debug / export). No editing chrome. */
export function PlanDrawing({
  geometry,
  style = DEFAULT_PLAN_STYLE,
  branding = null,
  embedFont = false,
  fontFaceCss,
  exportWidthPx,
  exportHeightPx,
}: PlanDrawingProps) {
  const { minX: viewMinX, minY: viewMinY, width: viewW, height: viewH } =
    planViewBox(geometry, style);
  const { title } = geometry.meta;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${viewMinX} ${viewMinY} ${viewW} ${viewH}`}
      width={exportWidthPx ?? undefined}
      height={exportHeightPx ?? undefined}
      role="img"
      aria-label={title || "Floor plan"}
      style={{
        width: exportWidthPx ? undefined : "100%",
        height: exportHeightPx ? undefined : "auto",
        display: "block",
        background: planTokens.paper,
      }}
    >
      <rect
        x={viewMinX}
        y={viewMinY}
        width={viewW}
        height={viewH}
        fill={planTokens.paper}
      />
      <PlanDocument
        geometry={geometry}
        style={style}
        branding={branding}
        embedFont={embedFont}
        fontFaceCss={fontFaceCss}
      />
    </svg>
  );
}

/** Expose clip path id helper for assertions. */
export function roomTextureClipPathId(roomId: string): string {
  return `clip-${roomId}`;
}
