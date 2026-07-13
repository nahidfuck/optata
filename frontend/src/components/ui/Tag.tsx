import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithRef } from "react";

import { cn } from "../../lib/cn";

/**
 * The signature surface — a price tag, not a card.
 *
 * Three things make it read as a tag (and all three live in one SVG
 * silhouette, because CSS can't give a clipped corner a border AND an
 * offset shadow at once):
 *  1. an angled top-left corner — the silhouette break;
 *  2. a punched hole in a grommet zone, separated by a hairline rule —
 *     a REAL hole: you see whatever is behind the tag through it,
 *     including the next card in a deck;
 *  3. the offset ink shadow is the same silhouette, holes and all.
 *
 * Geometry is fixed-size (cut, radius, hole) so the shape survives every
 * scale from a 200px grid thumbnail to a full-screen deck card.
 */

const CUT = 22;
const RADIUS = 18;
const HOLE_CY = 19;
const HOLE_R = 6;
const GROMMET_H = 38;

function silhouettePath(w: number, h: number, cut: boolean): string {
  const r = RADIUS;
  const c = cut ? CUT : 0;
  const start = c > 0 ? `M ${c} 0` : `M ${r} 0`;
  const closing =
    c > 0
      ? `V ${c} Z` // straight diagonal from (0, c) up to (c, 0)
      : `V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  return [
    start,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    closing,
  ].join(" ");
}

function holePath(cx: number): string {
  const r = HOLE_R;
  return `M ${cx - r} ${HOLE_CY} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}

interface TagProps extends ComponentPropsWithRef<"div"> {
  /** Punched hole + grommet zone. Default on — it IS the brand. */
  hole?: boolean;
  /** Angled top-left corner. Default on. */
  cut?: boolean;
  /** Surface fill — deck/grid cards pass the item's accent color. */
  surface?: string;
  /** Raised state (hover/drag settle): 8px offset instead of 5px. */
  lift?: boolean;
  /** Shadow hidden entirely — used DURING drag gestures for 60fps. */
  flat?: boolean;
}

export function Tag({
  hole = true,
  cut = true,
  surface,
  lift = false,
  flat = false,
  className,
  children,
  ...rest
}: TagProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setDims((prev) =>
        prev && Math.abs(prev.w - rect.width) < 0.5 && Math.abs(prev.h - rect.height) < 0.5
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const d = dims
    ? silhouettePath(dims.w, dims.h, cut) + (hole ? " " + holePath(dims.w / 2) : "")
    : null;
  const offset = lift ? 8 : 5;

  return (
    <div ref={ref} className={cn("relative", className)} {...rest}>
      {d && dims && (
        <svg
          aria-hidden="true"
          className="absolute inset-0 z-0 h-full w-full overflow-visible"
        >
          {/* the shadow is the same silhouette — flattened during gestures
              via opacity (compositor-only), never by cutting motion */}
          <g
            className="transition-[opacity,transform] duration-150 motion-reduce:transition-none"
            style={{ transform: `translate(${offset}px, ${offset}px)`, opacity: flat ? 0 : 1 }}
          >
            <path d={d} fillRule="evenodd" className="fill-ink" />
          </g>
          <path
            d={d}
            fillRule="evenodd"
            strokeWidth={2}
            className="stroke-ink"
            style={{ fill: surface ?? "var(--color-paper)" }}
          />
          {hole && (
            <>
              {/* grommet: reinforcement ring + hairline rule — the material
                  visibly supports the hole, a string would go through it */}
              <circle
                cx={dims.w / 2}
                cy={HOLE_CY}
                r={HOLE_R + 4}
                fill="none"
                strokeWidth={1}
                className="stroke-ink opacity-30"
              />
              <line
                x1={0}
                y1={GROMMET_H}
                x2={dims.w}
                y2={GROMMET_H}
                strokeWidth={1}
                className="stroke-ink opacity-30"
              />
            </>
          )}
        </svg>
      )}
      <div className={cn("relative z-10", hole && "pt-[38px]")}>{children}</div>
    </div>
  );
}
