import type { BlackHoleZone } from './blackhole';
import type { BlastZone } from './blast';
import type { BoosterZone } from './booster';
import type { ConveyorZone } from './conveyor';
import type { FanZone } from './fan';
import type { LiftZone } from './lift';
import type { PortalZone } from './portal';
import type { RiserZone } from './riser';
import type { SkyZone } from './sky';
import type { StamperZone } from './stamper';

export { BlackHoleZone, vortexAt, type Track, type Vortex, type VortexGrowth, type VortexRing } from './blackhole';
export { BlastZone, type Blast, type Mine } from './blast';
export { BoosterZone } from './booster';
export { ConveyorZone, type BeltOpts } from './conveyor';
export { FanZone } from './fan';
export { LiftZone } from './lift';
export { PortalZone } from './portal';
export { RiserZone, type RisingPad } from './riser';
export { SkyZone } from './sky';
export { StamperZone } from './stamper';
export type { Patrol } from './util';

export type Zone = FanZone | ConveyorZone | LiftZone | BoosterZone | PortalZone | BlackHoleZone | StamperZone | SkyZone | RiserZone | BlastZone;
