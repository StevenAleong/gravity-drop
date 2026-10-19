import RAPIER, { type RigidBody } from '@dimforge/rapier2d-compat';
import { HALF_PI } from '../constants';
import type { Sim } from '../sim';
import type { VisualStyle } from '../types';
import { blackHole, vortex } from './blackhole';
import { booster } from './booster';
import { breakaway } from './breakaway';
import { bumper } from './bumper';
import { conveyor } from './conveyor';
import { fan } from './fan';
import { flipper } from './flipper';
import { foosRod } from './foosball';
import { lift } from './lift';
import { blasts, mine } from './mines';
import { net } from './net';
import { peg } from './peg';
import { pendulum } from './pendulum';
import { portal } from './portal';
import { risers } from './risers';
import { seesaw } from './seesaw';
import { sky } from './sky';
import { slider } from './slider';
import { sling } from './sling';
import { stamper } from './stamper';
import { toggle } from './toggle';
import { tramp } from './tramp';
import { hatch, trapdoor } from './trapdoor';
import { ledge, wall } from './wall';
import { windmill } from './windmill';

/**
 * Builds course geometry into the sim's physics world and registers visuals/zones for the renderer.
 * Each component lives in its own file in this folder (a function taking the Builder as `this`) and is
 * listed here, so course code calls it as `b.windmill(...)`.
 */
export class Builder {
  constructor(readonly sim: Sim) {}

  get world() {
    return this.sim.world;
  }

  // ---- static geometry ----------------------------------------------------

  wall = wall;
  ledge = ledge;
  peg = peg;
  bumper = bumper;
  sling = sling;
  tramp = tramp;
  breakaway = breakaway;
  pendulum = pendulum;
  foosRod = foosRod;
  net = net;

  // ---- kinematic obstacles --------------------------------------------------

  windmill = windmill;
  slider = slider;
  trapdoor = trapdoor;
  hatch = hatch;
  flipper = flipper;
  seesaw = seesaw;
  toggle = toggle;

  // ---- zones ----------------------------------------------------------------

  fan = fan;
  conveyor = conveyor;
  stamper = stamper;
  lift = lift;
  booster = booster;
  sky = sky;
  risers = risers;
  blasts = blasts;
  mine = mine;
  portal = portal;
  blackHole = blackHole;
  vortex = vortex;

  // ---- shared by the components ---------------------------------------------

  kinematic(x: number, y: number, rot = 0): RigidBody {
    return this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y).setRotation(rot),
    );
  }

  /** Capsule arm from the body origin out to side*len along local X. */
  arm(body: RigidBody, len: number, r: number, side: number, style: VisualStyle) {
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(len / 2, r)
        .setTranslation((side * len) / 2, 0)
        .setRotation(HALF_PI)
        .setFriction(0.3)
        .setRestitution(0.3),
      body,
    );
    this.sim.addVisual(c, { kind: 'capsule', hh: len / 2, r }, style, true);
    this.sim.tag(c, { kind: 'spinner' });
  }

  /** Decorative hub drawn over a pivot (no collider). */
  hinge(x: number, y: number) {
    this.sim.hinges.push({ x, y });
  }
}
