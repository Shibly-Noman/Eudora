"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import React from "react";

interface SortableListContextProps {
  ids: string[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  children: React.ReactNode;
  /** "vertical" for stacked rows (the default); "wrap" for a flex-wrap chip pool that isn't confined to one axis. */
  layout?: "vertical" | "wrap";
}

/**
 * Wraps a reorderable list in dnd-kit's drag context. Every caller here
 * reorders only on drop (`onDragEnd`), never live during the drag, so `ids`
 * only need to be unique among current siblings for the duration of one
 * drag gesture — they don't need to persist across renders, which lets
 * list items with no natural identity (plain strings) use their render
 * index without any risk of the reorder landing on the wrong item.
 */
export function SortableListContext({ ids, onReorder, children, layout = "vertical" }: SortableListContextProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = ids.indexOf(String(active.id));
    const toIndex = ids.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    onReorder(fromIndex, toIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={layout === "vertical" ? [restrictToVerticalAxis, restrictToParentElement] : [restrictToParentElement]}
    >
      <SortableContext items={ids} strategy={layout === "vertical" ? verticalListSortingStrategy : rectSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

type DragHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners" | "setActivatorNodeRef">;

interface SortableRowProps {
  id: string;
  className?: string;
  children: (handle: DragHandleProps) => React.ReactNode;
}

/**
 * Per-item wrapper. Hands drag `attributes`/`listeners` to the caller via a
 * render-prop rather than attaching them to the whole row, so a row's text
 * inputs stay normally clickable/focusable — only the rendered `DragHandle`
 * initiates a drag.
 */
export function SortableRow({ id, className, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners, setActivatorNodeRef })}
    </div>
  );
}

export function DragHandle({ attributes, listeners, setActivatorNodeRef, className }: DragHandleProps & { className?: string }) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className={
        className ??
        "flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
      }
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
