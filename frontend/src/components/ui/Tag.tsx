import { useId } from "react";
import type { ComponentPropsWithRef } from "react";

import { cn } from "../../lib/cn";

/**
 * The signature surface — a price tag, not a card.
 *
 * Rendered ENTIRELY declaratively, with zero measured dimensions: the SVG
 * has no viewBox and sizes to the container via CSS width/height 100%, so
 * one SVG unit = one rendered pixel. Fixed features (corner radius, angled
 * cut, grommet band, hole) are authored in fixed units and stay crisp at
 * every scale; the variable edges use percentage geometry (`width="100%"`,
 * `cx="50%"`), which SVG resolves against the rendered box. Nothing here
 * waits on JavaScript, so the tag is fully correct on the first paint —
 * grommet band, hole, stroke and silhouette all present before any photo,
 * layout or measurement arrives.
 *
 * The three things that make it read as a tag:
 *  1. an angled top-left corner — the silhouette break;
 *  2. a real see-through punched hole in the grommet band;
 *  3. the offset ink shadow is the same silhouette (a drop-shadow filter,
 *     so it follows the cut and the hole automatically).
 */

const CUT = 22;
const RADIUS = 18;
const GROMMET_H = 38;
const HOLE_CY = GROMMET_H / 2; // dead-centre of the grommet band
const HOLE_R = 5; // delicate grommet, not a hammered hole
const HOLE_RING_W = 1.25;
// diagonal overlaps the two straight edges it meets, so the cut corner
// reads as one continuous stroke with no notch at the joins
const DIAG_OVERLAP = 1.1;

interface TagProps extends ComponentPropsWithRef<"div"> {
  /** Punched hole + grommet band. Default on — it IS the brand. */
  hole?: boolean;
  /** Angled top-left corner. Default on. */
  cut?: boolean;
  /** Surface fill (defaults to paper — the accent is trim, not fill). */
  surface?: string;
  /** Raised state (hover/drag settle): 8px offset instead of 5px. */
  lift?: boolean;
  /** Shadow hidden entirely — used DURING drag gestures for 60fps. */
  flat?: boolean;
  /** Fill for the grommet band (deck/grid cards pass the muted accent). */
  grommetFill?: string;
}

export function Tag({
  hole = true,
  cut = true,
  surface,
  lift = false,
  flat = false,
  grommetFill,
  className,
  children,
  ...rest
}: TagProps) {
  // Unique per instance so ~40 grid cards don't collide on one mask id.
  // useId is first-paint stable and needs no measurement.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fillMaskId = `tag-fill-${uid}`;
  const strokeMaskId = `tag-stroke-${uid}`;
  const offset = lift ? 8 : 5;

  const cutTriangle = cut ? <polygon points={`0,0 ${CUT},0 0,${CUT}`} fill="black" /> : null;

  return (
    <div className={cn("relative", className)} {...rest}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 z-0 h-full w-full overflow-visible"
        // the offset shadow is a filter, so it follows the true silhouette
        // (cut + hole). Dropped entirely during gestures for 60fps.
        style={{
          filter: flat ? "none" : `drop-shadow(${offset}px ${offset}px 0 var(--color-ink))`,
        }}
      >
        <defs>
          {/* fills clipped to the silhouette: rounded rect − cut − hole */}
          <mask id={fillMaskId}>
            <rect width="100%" height="100%" rx={RADIUS} ry={RADIUS} fill="white" />
            {cutTriangle}
            {hole && <circle cx="50%" cy={HOLE_CY} r={HOLE_R} fill="black" />}
          </mask>
          {/* stroke keeps its full 2px width on the edge: full rect − cut,
              no rounding subtracted (the stroke rect carries its own rx) */}
          <mask id={strokeMaskId}>
            <rect width="100%" height="100%" fill="white" />
            {cutTriangle}
          </mask>
        </defs>

        {/* surface + grommet band + hairline, all shaped by the fill mask */}
        <g mask={`url(#${fillMaskId})`}>
          <rect
            width="100%"
            height="100%"
            style={{ fill: surface ?? "var(--color-paper)" }}
          />
          {grommetFill && <rect width="100%" height={GROMMET_H} fill={grommetFill} />}
          {hole && (
            <line
              x1="0"
              y1={GROMMET_H}
              x2="100%"
              y2={GROMMET_H}
              strokeWidth={1}
              className="stroke-ink opacity-25"
            />
          )}
        </g>

        {/* 2px silhouette outline: rounded-rect stroke minus the cut corner… */}
        <g mask={`url(#${strokeMaskId})`}>
          <rect
            width="100%"
            height="100%"
            rx={RADIUS}
            ry={RADIUS}
            fill="none"
            strokeWidth={2}
            className="stroke-ink"
          />
        </g>
        {/* …plus the diagonal that closes the cut (overlapped so it joins clean) */}
        {cut && (
          <line
            x1={-DIAG_OVERLAP}
            y1={CUT + DIAG_OVERLAP}
            x2={CUT + DIAG_OVERLAP}
            y2={-DIAG_OVERLAP}
            strokeWidth={2}
            className="stroke-ink"
          />
        )}

        {/* delicate grommet ring around the see-through hole */}
        {hole && (
          <circle
            cx="50%"
            cy={HOLE_CY}
            r={HOLE_R}
            fill="none"
            strokeWidth={HOLE_RING_W}
            className="stroke-ink opacity-70"
          />
        )}
      </svg>

      <div className={cn("relative z-10", hole && "pt-[38px]")}>{children}</div>
    </div>
  );
}
