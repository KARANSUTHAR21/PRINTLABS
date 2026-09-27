import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Copy, Minus, ShoppingCart, X } from "lucide-react";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-provider";

/**
 * Control strip on the floating cart — the three window controls from the
 * reference mock:
 *
 *   —  minimise: collapse the panel to a slim bar (toggle; click the bar to
 *      expand again),
 *   ❐  maximise: open the full `/cart` page,
 *   ✕  close:    dismiss the panel.
 *
 * The glyphs are lucide icons painted with the app's own tokens
 * (`text-muted`, `hover:text-ink`, `hover:bg-canvas`), never baked-in colours,
 * so they stay legible whatever the surface behind them is.
 *
 * The whole panel can be moved anywhere on screen by dragging its title strip
 * (mouse, touch or pen); the window controls are excluded so they stay
 * clickable. Arrow keys nudge it too, for anyone not using a pointer.
 */
const CONTROL =
  "grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink";

/** Movement that turns a press on the strip into a drag rather than a click. */
const DRAG_THRESHOLD = 4;
/** Breathing room the panel keeps inside the viewport while being moved. */
const DRAG_MARGIN = 8;
/** Pixels per arrow-key nudge (×4 while Shift is held). */
const NUDGE = 12;

type Offset = { x: number; y: number };

type DragBox = {
  baseLeft: number;
  baseTop: number;
  width: number;
  height: number;
};

type DragState = DragBox & {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Restrict an offset so the panel always stays fully inside the window.
 * `baseLeft`/`baseTop` are where the panel sits with the offset removed, so one
 * set of bounds works for dragging, resizing and keyboard nudging alike.
 */
function clampOffset(box: DragBox, offset: Offset): Offset {
  const minX = DRAG_MARGIN - box.baseLeft;
  const minY = DRAG_MARGIN - box.baseTop;
  const maxX = Math.max(minX, window.innerWidth - box.width - DRAG_MARGIN - box.baseLeft);
  const maxY = Math.max(minY, window.innerHeight - box.height - DRAG_MARGIN - box.baseTop);
  return { x: clamp(offset.x, minX, maxX), y: clamp(offset.y, minY, maxY) };
}

export function CartPanel({
  onNavigate,
  onClose,
}: {
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const { cart } = useCart();
  const [collapsed, setCollapsed] = useState(false);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  /** Set while a press on the strip has moved — used to swallow the click. */
  const movedRef = useRef(false);

  /** Where the panel sits before its offset transform is applied. */
  const measure = (): DragBox | null => {
    const panel = panelRef.current;
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    return {
      baseLeft: rect.left - offset.x,
      baseTop: rect.top - offset.y,
      width: rect.width,
      height: rect.height,
    };
  };

  /** A shrinking window must not leave the panel stranded off screen. */
  useEffect(() => {
    const onResize = () => {
      const panel = panelRef.current;
      if (!panel) return;
      setOffset((current) => {
        if (!current.x && !current.y) return current;
        const rect = panel.getBoundingClientRect();
        const next = clampOffset(
          {
            baseLeft: rect.left - current.x,
            baseTop: rect.top - current.y,
            width: rect.width,
            height: rect.height,
          },
          current,
        );
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onStripPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Never hijack the window controls or any link inside the strip.
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    const box = measure();
    if (!box) return;
    dragRef.current = {
      ...box,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    movedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onStripPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!movedRef.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
      return;
    }
    movedRef.current = true;
    setOffset(clampOffset(state, { x: state.originX + dx, y: state.originY + dy }));
  };

  const onStripPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // `click` fires before this task, so the swallow flag is cleared after it.
    window.setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  const onStripKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (collapsed && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setCollapsed(false);
      return;
    }
    const step = event.shiftKey ? NUDGE * 4 : NUDGE;
    const delta: Offset | undefined =
      event.key === "ArrowLeft"
        ? { x: -step, y: 0 }
        : event.key === "ArrowRight"
          ? { x: step, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: -step }
            : event.key === "ArrowDown"
              ? { x: 0, y: step }
              : undefined;
    if (!delta) return;
    event.preventDefault();
    const box = measure();
    if (!box) return;
    setOffset(clampOffset(box, { x: offset.x + delta.x, y: offset.y + delta.y }));
  };

  const stripProps = {
    onPointerDown: onStripPointerDown,
    onPointerMove: onStripPointerMove,
    onPointerUp: onStripPointerUp,
    onPointerCancel: onStripPointerUp,
    onKeyDown: onStripKeyDown,
    role: "button" as const,
    tabIndex: 0,
    title: "Drag to move — arrow keys also work",
    "aria-label": "Move the cart panel",
  };

  const controls = (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        className={CONTROL}
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? "Restore cart panel" : "Minimise cart panel"}
        title={collapsed ? "Restore" : "Minimise"}
      >
        <Minus className="size-3.5" />
      </button>
      <Link
        to="/cart"
        className={CONTROL}
        onClick={onNavigate}
        aria-label="Open the full cart page"
        title="Maximise — open the cart page"
      >
        {/* Two stacked rectangles: the maximise glyph in the reference mock. */}
        <Copy className="size-3.5" />
      </Link>
      <button
        type="button"
        className={CONTROL}
        onClick={onClose}
        aria-label="Close cart"
        title="Close"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );

  return (
    <div
      ref={panelRef}
      style={offset.x || offset.y ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` } : undefined}
      className={cn(
        "w-[21.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-paper shadow-pop",
        collapsed ? "flex items-center justify-between gap-3 px-4 py-2.5" : "p-6",
        dragging && "select-none",
      )}
    >
      <div
        {...stripProps}
        className={cn(
          "touch-none rounded-xl outline-none select-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
          collapsed ? "flex min-w-0 flex-1 items-center gap-2 text-ink" : "flex items-center justify-between gap-3",
        )}
        onClick={() => {
          // A drag on the slim bar must not also expand it.
          if (collapsed && !movedRef.current) setCollapsed(false);
        }}
      >
        {collapsed ? (
          <>
            <ShoppingCart className="size-[1.1rem] shrink-0" strokeWidth={1.8} />
            <span className="truncate text-[1.05rem] font-bold">Your Bill</span>
            <span className="shrink-0 text-[0.8125rem] text-muted">{cart.count} items</span>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2.5 text-ink">
              <ShoppingCart className="size-[1.25rem] shrink-0" strokeWidth={1.8} />
              <h3 className="truncate text-[1.25rem] font-bold">Your Bill</h3>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[0.875rem] text-muted">{cart.count} items</span>
              {controls}
            </div>
          </>
        )}
      </div>

      {/* The controls live outside the strip when minimised, so they never drag. */}
      {collapsed ? controls : null}

      {!collapsed &&
        (cart.items.length === 0 ? (
          <p className="py-8 text-sm text-muted">
            Your cart is empty. Add prints or stationery to get started.
          </p>
        ) : (
          <ul className="mt-8 space-y-8">
            {cart.items.map((item) => (
              <li key={item.productId} className="flex items-center gap-3.5">
                <img
                  src={item.image}
                  alt=""
                  className="size-11 shrink-0 rounded-lg object-cover bg-mist"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-bold leading-tight text-ink">
                    {item.name}
                  </p>
                  <p className="mt-1 text-[0.8125rem] text-muted">
                    {item.quantity} × {formatINR(item.unitPricePaise)}
                  </p>
                </div>
                <p className="shrink-0 text-[0.95rem] font-bold tabular-nums text-ink">
                  {formatINR(item.linePaise)}
                </p>
              </li>
            ))}
          </ul>
        ))}

      {!collapsed && (
        <>
          <div className="mt-12 space-y-2.5 border-t border-line pt-5 text-[0.95rem]">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatINR(cart.subtotalPaise)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Tax (0%)</span>
              <span className="tabular-nums">{formatINR(cart.taxPaise)}</span>
            </div>
          </div>
          <div className="mt-7 flex justify-between border-t border-line pt-4 text-[1.25rem] font-extrabold text-ink">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(cart.totalPaise)}</span>
          </div>
          <Link to="/checkout" onClick={onNavigate} className="btn-navy mt-6 w-full">
            Proceed to Checkout
            <ArrowRight className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
}
