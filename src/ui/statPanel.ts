// Top-right floating stat panel — a DOM/CSS overlay, not drawn inside the
// Pixi canvas. Read-only against whatever citizen record it's given.
// update() takes a plain {resource, age, x, y} record (or undefined) rather
// than a World — the client no longer owns a real World, just whatever
// arrives over the wire; the caller (main.ts) does the "find by id in the
// latest snapshot" lookup and passes the result (or undefined if the
// citizen died) directly.

import type { EntityId } from "../types.ts";

export interface CitizenStatSlice {
  resource: number;
  age: number;
  x: number;
  y: number;
}

export interface StatPanel {
  el: HTMLElement;
  show(id: EntityId): void;
  hide(): void;
  update(citizen: CitizenStatSlice | undefined): void;
}

export function createStatPanel(onDeadTargetSelected: () => void): StatPanel {
  const el = document.createElement("div");
  el.className = "stat-panel";

  const dl = document.createElement("dl");
  const fields: Record<"resource" | "age" | "position", HTMLElement> = {
    resource: document.createElement("dd"),
    age: document.createElement("dd"),
    position: document.createElement("dd"),
  };

  const addRow = (label: string, valueEl: HTMLElement) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    dl.appendChild(dt);
    dl.appendChild(valueEl);
  };
  addRow("Resource", fields.resource);
  addRow("Age (ticks)", fields.age);
  addRow("Position", fields.position);
  el.appendChild(dl);

  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.textContent = "Stop following";
  stopButton.addEventListener("click", () => onDeadTargetSelected());
  el.appendChild(stopButton);

  document.body.appendChild(el);

  return {
    el,
    show() {
      el.style.display = "block";
    },
    hide() {
      el.style.display = "none";
    },
    update(citizen: CitizenStatSlice | undefined) {
      if (!citizen) {
        // The selected citizen is no longer present in the latest snapshot
        // (died since last update) — release selection/follow rather than
        // showing stale data or holding a dangling reference.
        onDeadTargetSelected();
        return;
      }

      fields.resource.textContent = citizen.resource.toFixed(1);
      fields.age.textContent = String(citizen.age);
      fields.position.textContent = `${citizen.x.toFixed(0)}, ${citizen.y.toFixed(0)}`;
    },
  };
}
