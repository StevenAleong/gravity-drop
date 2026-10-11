/** Fixed physics timestep (seconds). The sim is deterministic per seed because it only ever advances by DT. */
export const DT = 1 / 120;
/** Course width in world units (1 unit ≈ 1 m). */
export const W = 16;
export const MARBLE_R = 0.32;
export const GRAVITY = 18;
/** Seconds of mixing in the start box before the gate drops. */
export const COUNTDOWN = 5;
export const LIFT_SPEED = 7;
export const ALL_GROUPS = 0xffffffff;
export const NO_GROUPS = 0x00000000;
