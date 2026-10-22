import { useEffect, useRef, useState, type ReactNode } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "@/components/icons/glyphs";

/**
 * A list you can drag into a new order, on touch and mouse.
 *
 * Dragging starts only from the grip, so inputs, buttons and scrolling inside
 * each row keep working. The order is reported once, when the drag ends, so a
 * caller that saves on change does not save on every pixel of movement.
 * Up / down helpers are passed too, for keyboard and screen-reader users.
 */
export function SortableList<T>({
  items,
  getKey,
  onChange,
  renderItem,
  className = "",
  itemClassName = "",
  as = "ul",
}: {
  items: T[];
  getKey: (item: T) => string;
  onChange: (next: T[]) => void;
  renderItem: (item: T, tools: SortTools) => ReactNode;
  className?: string;
  itemClassName?: string;
  as?: "ul" | "ol" | "div";
}) {
  const [order, setOrder] = useState(items);
  const dragging = useRef(false);
  const latest = useRef(items);

  // Follow the caller's list whenever we are not in the middle of a drag.
  useEffect(() => {
    if (!dragging.current) setOrder(items);
  }, [items]);
  latest.current = order;

  const commit = () => {
    dragging.current = false;
    const before = items.map(getKey).join("|");
    const after = latest.current.map(getKey).join("|");
    if (before !== after) onChange(latest.current);
  };

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
    onChange(next);
  };

  return (
    <Reorder.Group
      axis="y"
      as={as}
      values={order}
      onReorder={(next) => {
        dragging.current = true;
        setOrder(next);
      }}
      className={className}
    >
      {order.map((item, index) => (
        <SortableRow
          key={getKey(item)}
          value={item}
          className={itemClassName}
          as={as === "div" ? "div" : "li"}
          onDragEnd={commit}
        >
          {(handle) =>
            renderItem(item, {
              handle,
              index,
              first: index === 0,
              last: index === order.length - 1,
              moveUp: () => move(index, -1),
              moveDown: () => move(index, 1),
            })
          }
        </SortableRow>
      ))}
    </Reorder.Group>
  );
}

export type SortTools = {
  /** The grip to drag by. Place it anywhere in the row. */
  handle: ReactNode;
  index: number;
  first: boolean;
  last: boolean;
  moveUp: () => void;
  moveDown: () => void;
};

function SortableRow<T>({
  value,
  className,
  as,
  onDragEnd,
  children,
}: {
  value: T;
  className: string;
  as: "li" | "div";
  onDragEnd: () => void;
  children: (handle: ReactNode) => ReactNode;
}) {
  const controls = useDragControls();
  const handle = (
    <button
      type="button"
      aria-label="Drag to reorder"
      onPointerDown={(e) => {
        e.preventDefault();
        controls.start(e);
      }}
      className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <Reorder.Item
      as={as}
      value={value}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.02, boxShadow: "0 18px 40px -18px rgba(0,0,0,0.45)", zIndex: 20 }}
      className={`relative ${className}`}
      style={{ position: "relative" }}
    >
      {children(handle)}
    </Reorder.Item>
  );
}
