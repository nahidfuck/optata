import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";

import type { WishlistItem } from "../../api/types";
import { recordView } from "../../lib/views";
import { Button } from "../ui/Button";
import { Stamp } from "../ui/Stamp";
import { DeckCard } from "./DeckCard";

const FLING_VELOCITY = 400;
const FLING_OFFSET_RATIO = 0.35;
const DEAL_SPRING = { type: "spring", stiffness: 260, damping: 26 } as const;
// Card lifecycle is managed by hand — AnimatePresence exits never complete
// under React StrictMode (exited cards pile up in the DOM forever), and the
// top-3-cards budget is a hard requirement. One flying card, removed on
// animation completion with a timeout fallback.
const FLY_DURATION_MS = 320;

interface FlyingCard {
  item: WishlistItem;
  direction: 1 | -1;
  fromX: number;
  fromRotate: number;
  key: string;
}

export function ShuffleDeck({
  items,
  order,
  username,
  isOwnProfile,
  leaving,
  onReveal,
  onLeft,
  onOpenItem,
  onDisableOwnShuffle,
}: {
  items: ReadonlyMap<string, WishlistItem>;
  order: readonly string[];
  username: string;
  isOwnProfile: boolean;
  /** Profile set phase=reveal: lift away, then report onLeft. */
  leaving: boolean;
  onReveal: () => void;
  onLeft: () => void;
  onOpenItem: (id: string) => void;
  onDisableOwnShuffle: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState(0);
  const [flying, setFlying] = useState<FlyingCard | null>(null);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topThree = useMemo(
    () =>
      order
        .slice(position, position + 3)
        .map((id) => items.get(id))
        .filter((item): item is WishlistItem => item !== undefined),
    [order, position, items],
  );
  const exhausted = position >= order.length;

  // every card dealt to the top counts as a view
  const topId = topThree[0]?.id;
  useEffect(() => {
    if (topId !== undefined) recordView(topId);
  }, [topId]);

  // preload the next two photos before they're dealt
  useEffect(() => {
    for (const id of order.slice(position + 1, position + 3)) {
      const item = items.get(id);
      if (item) {
        const img = new Image();
        img.src = item.image_url;
      }
    }
  }, [position, order, items]);

  const clearFlying = useCallback(() => {
    if (flyTimer.current !== null) clearTimeout(flyTimer.current);
    flyTimer.current = null;
    setFlying(null);
  }, []);

  const advance = useCallback(
    (direction: 1 | -1 = 1, fromX = 0, fromRotate = 0) => {
      const currentId = order[position];
      const current = currentId !== undefined ? items.get(currentId) : undefined;
      if (current && !reducedMotion) {
        if (flyTimer.current !== null) clearTimeout(flyTimer.current);
        setFlying({
          item: current,
          direction,
          fromX,
          fromRotate,
          key: `${current.id}:${position}`,
        });
        flyTimer.current = setTimeout(() => setFlying(null), FLY_DURATION_MS + 120);
      }
      setPosition((p) => p + 1);
    },
    [order, position, items, reducedMotion],
  );

  // deck exhausted → the grid takes over
  useEffect(() => {
    if (exhausted) onReveal();
  }, [exhausted, onReveal]);

  // desktop: arrows / space advance
  useEffect(() => {
    if (leaving) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        advance(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        advance(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advance, leaving]);

  // lock page scroll while the deck owns the screen
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  // rAF freezes in background/occluded tabs, so onAnimationComplete may
  // never fire — without this fallback a user who switches tabs mid-reveal
  // comes back to a permanently stuck overlay.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onLeft, (reducedMotion ? 120 : 450) + 300);
    return () => clearTimeout(timer);
  }, [leaving, reducedMotion, onLeft]);

  const idlePose = { y: "0%", scale: 1, opacity: 1 };
  const leavingPose = reducedMotion
    ? { ...idlePose, opacity: 0 }
    : { y: "-115%", scale: 0.92, opacity: 1 };

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col bg-paper"
      initial={false}
      animate={leaving ? leavingPose : idlePose}
      transition={
        reducedMotion
          ? { duration: 0.12 }
          : { duration: 0.45, ease: [0.32, 0, 0.67, 0] }
      }
      onAnimationComplete={() => {
        if (leaving) onLeft();
      }}
      style={{ pointerEvents: leaving ? "none" : "auto" }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <Stamp>u/{username}</Stamp>
        <Button variant="ghost" onClick={onReveal} className="h-9 px-3 text-sm">
          Show everything
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center px-6 pb-4">
        <div
          ref={frameRef}
          className="relative aspect-[3/4] w-full max-w-[min(88vw,380px)]"
          style={{ maxHeight: "72dvh" }}
        >
          {/* behind-cards render first, top card last (wins hit-testing) */}
          {[...topThree].reverse().map((item) => {
            const depth = topThree.indexOf(item);
            return (
              <StackedCard
                key={item.id}
                item={item}
                depth={depth}
                position={position + depth}
                total={order.length}
                reducedMotion={Boolean(reducedMotion)}
                dragging={dragging && depth === 0}
                setDragging={setDragging}
                frameRef={frameRef}
                onAdvance={advance}
                onOpen={() => onOpenItem(item.id)}
              />
            );
          })}

          {flying && (
            <motion.div
              key={flying.key}
              aria-hidden="true"
              className="absolute inset-0"
              style={{ zIndex: 30, pointerEvents: "none" }}
              initial={{ x: flying.fromX, rotate: flying.fromRotate, opacity: 1 }}
              animate={{
                x:
                  flying.direction *
                  (typeof window !== "undefined" ? window.innerWidth : 800),
                rotate: flying.direction * 14,
              }}
              transition={{ duration: FLY_DURATION_MS / 1000, ease: [0.3, 0.05, 0.6, 1] }}
              onAnimationComplete={clearFlying}
            >
              <DeckCard
                item={flying.item}
                position={position - 1}
                total={order.length}
                dragging={false}
              />
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 pb-5">
        <Stamp className="text-[11px] text-ink-soft">
          Swipe, click the photo, or press space
        </Stamp>
        {isOwnProfile && (
          <button
            type="button"
            onClick={onDisableOwnShuffle}
            className="text-xs text-ink-soft underline"
          >
            Don't show me shuffle on my own profile
          </button>
        )}
      </div>
    </motion.div>
  );
}

function StackedCard({
  item,
  depth,
  position,
  total,
  reducedMotion,
  dragging,
  setDragging,
  frameRef,
  onAdvance,
  onOpen,
}: {
  item: WishlistItem;
  depth: number;
  position: number;
  total: number;
  reducedMotion: boolean;
  dragging: boolean;
  setDragging: (value: boolean) => void;
  frameRef: React.RefObject<HTMLDivElement | null>;
  onAdvance: (direction: 1 | -1, fromX?: number, fromRotate?: number) => void;
  onOpen: () => void;
}) {
  const x = useMotionValue(0);
  // rotation proportional to horizontal offset, max ±12°
  const rotate = useTransform(x, [-320, 0, 320], [-12, 0, 12], { clamp: true });
  const isTop = depth === 0;

  const pose = reducedMotion
    ? { opacity: 1 }
    : {
        opacity: 1,
        scale: 1 - depth * 0.045,
        y: depth * 12,
        rotate: depth === 0 ? 0 : depth === 1 ? -1.6 : 1.4,
      };

  return (
    <motion.div
      className="absolute inset-0"
      style={{
        zIndex: 10 - depth,
        x: isTop ? x : 0,
        rotate: isTop ? rotate : undefined,
        willChange: dragging ? "transform" : undefined,
        pointerEvents: isTop ? "auto" : "none",
      }}
      initial={
        reducedMotion
          ? { opacity: 0 }
          : isTop
            ? { y: 44, scale: 0.94, rotate: -2, opacity: 0 }
            : { opacity: 0, scale: 1 - depth * 0.045, y: depth * 12 + 10 }
      }
      animate={pose}
      transition={reducedMotion ? { duration: 0.12 } : DEAL_SPRING}
      drag={isTop && !reducedMotion ? "x" : false}
      dragElastic={0.9}
      dragMomentum={false}
      onDragStart={() => setDragging(true)}
      onDragEnd={(_, info) => {
        setDragging(false);
        const width = frameRef.current?.clientWidth ?? 320;
        const flung =
          Math.abs(info.velocity.x) > FLING_VELOCITY ||
          Math.abs(info.offset.x) > width * FLING_OFFSET_RATIO;
        if (flung) {
          const direction: 1 | -1 = info.offset.x >= 0 || info.velocity.x > 0 ? 1 : -1;
          onAdvance(direction, x.get(), rotate.get());
          x.set(0); // the live card becomes the flying ghost; reset the stack slot
        }
      }}
    >
      <DeckCard
        item={item}
        position={position}
        total={total}
        dragging={dragging}
        onAdvance={isTop ? () => onAdvance(1) : undefined}
        onOpen={isTop ? onOpen : undefined}
      />
    </motion.div>
  );
}
