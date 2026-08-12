// Small cross-cutting types shared across sim/render/ui. Keep this minimal —
// most types live in the directory that owns them.

/** Stable identifier for a citizen, assigned once at spawn and never reused. */
export type EntityId = number;
