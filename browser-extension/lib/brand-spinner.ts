/**
 * The mark, reduced to the part of it that can spin.
 *
 * Lens's icon is a tyre with an aperture for a hub, which is a piece of luck
 * worth spending: a wheel is the one logo shape that means something in
 * motion, so the app's loading indicator can be the product's own mark rather
 * than a borrowed arc.
 *
 * **Why not the whole logo.** Drawn complete at the sizes a spinner actually
 * appears at — 16px inside a button, 20px beside a line of text — the aperture
 * blades, the rim ring and the lens circle collapse into a dark smudge, and
 * spinning a smudge reads as a rendering fault. What survives is the
 * silhouette: the tyre and its six spokes. Those stay crisp at 16px, and the
 * open centre is what makes the rotation legible at all — a filled disc turning
 * looks like a disc standing still.
 *
 * So this is one master used at every size rather than a small variant and a
 * large one. A loader that changed shape as it grew would be two loaders.
 *
 * The geometry is lifted unaltered from `design/finn-lens-aperture/
 * finn-lens-wheel.svg`, which is what `public/icon/*.png` is rendered from, so
 * the spinner and the icon are the same wheel at the same proportions.
 *
 * It lives here rather than in either renderer because there are two: the
 * extension's pages are React, and the panel injected into finn.com builds its
 * DOM by hand. Two copies of a path this long would drift the first time the
 * mark was adjusted.
 */

/** The mark's own coordinate space; every figure below is in it. */
export const SPINNER_VIEW_BOX = "0 0 256 256";

export const SPINNER_CENTRE = 128;

/** The tyre: a ring, drawn as a stroked circle. */
export const SPINNER_TYRE = { radius: 114, width: 16 } as const;

/**
 * One spoke, from the hub out to the rim. Repeated at each of the rotations
 * below, which is also what gives the wheel something to turn *against* —
 * six-fold symmetry reads as motion where a smooth ring would not.
 */
export const SPINNER_SPOKE =
  "M 204.43 118.62 L 231.68 105.96 A 106 106 0 0 1 231.68 150.04 " +
  "L 204.43 137.38 A 77 77 0 0 0 204.43 118.62 Z";

export const SPINNER_SPOKE_WIDTH = 5;

export const SPINNER_SPOKE_ANGLES = [0, 60, 120, 180, 240, 300] as const;

/**
 * The hub, in FINN's accent rather than in the inherited colour.
 *
 * It sits exactly on the axis, so it is the one part of a spinning wheel that
 * does not appear to move — which makes it the right place for the only spot
 * of colour: a still point the eye can rest on while everything around it
 * turns. Left literal rather than made to inherit, because it is the mark's
 * own blue and not a tint of whatever it is drawn on.
 */
export const SPINNER_HUB = { radius: 8.99, fill: "#0072EA" } as const;

/**
 * How the animation is spelled, shared so the two renderers cannot disagree
 * about the speed.
 *
 * A second per turn, and three under `prefers-reduced-motion` rather than
 * stopped: a loading indicator that holds still has stopped saying the one
 * thing it exists to say. Slowing it keeps the message and drops the
 * distraction, which is what the preference is asking for.
 */
export const SPINNER_ANIMATION =
  "animate-spin motion-reduce:[animation-duration:3s]";

/**
 * The mark turning over when nothing is happening.
 *
 * Fourteen seconds a revolution, which is slow enough that a reader notices it
 * has moved rather than watching it move — the difference between a wheel
 * idling and a wheel working. It shares `animate-spin`'s keyframes and only
 * lengthens them, so the same mark speeding up to `SPINNER_ANIMATION` when
 * something is loading is one gesture at two speeds rather than two
 * animations.
 *
 * Stopped outright under `prefers-reduced-motion`, where the loader merely
 * slows. That asymmetry is the point of the preference: a loading indicator
 * still has something to say and has to keep saying it, while perpetual motion
 * on an idle page is exactly the thing being asked for less of.
 */
export const BRAND_IDLE_SPIN =
  "animate-spin [animation-duration:14s] motion-reduce:animate-none";

/**
 * `BRAND_IDLE_SPIN`, for a mark drawn onto finn.com.
 *
 * The same fourteen seconds and the same reduced-motion stop, but written as
 * a plain rule in `assets/tailwind.css` rather than as utilities, because the
 * utilities lose to the page's own stylesheet — see the note there. Change the
 * speed in both places.
 */
export const BRAND_IDLE_SPIN_ON_PAGE = "finn-lens-idle-spin";
