/**
 * DrawerOverlay.tsx
 *
 * The backdrop scrim behind the drawer surface. Blueprint E.1: "Pointer
 * event handling, dynamic backdrop blur - bind backdropFilter:
 * blur(${blurStrength}px) directly to the style prop for dynamic viewport
 * obfuscation."
 *
 * Like DrawerOverlay's sibling files, there's no vanilla-demo equivalent
 * to port here - the original is a page of standalone widgets with no
 * modal/drawer concept at all. This is new component work.
 *
 * Self-contained by design: the parent (LiquidMotionDrawer.tsx) renders
 * this unconditionally and just passes `isOpen` - this component owns its
 * own mount/unmount and fade via an internal AnimatePresence, rather than
 * asking the parent to wrap it in one. That matters specifically because
 * DrawerSurface (per blueprint D.3's CLOSED_VARIANT) stays permanently
 * mounted even when closed - it's a persistent small pill, not something
 * that unmounts - so the overlay needs to manage its own presence in the
 * DOM independently rather than sharing an AnimatePresence boundary with
 * a sibling that behaves completely differently on close.
 *
 * Two additions beyond a literal reading of blueprint E.1, both standard
 * for drawer/sheet/dialog implementations (Radix Dialog, Vaul, Chakra's
 * Drawer all do the same by default) rather than something the blueprint
 * asked for directly:
 *   - Escape-to-close (window-level keydown, gated on `isOpen` so it's
 *     inert once closed).
 *   - Body scroll lock while open, restored to whatever the previous
 *     value was (not hardcoded to "") on close/unmount.
 * Both are opt-out via props, since a reusable component shouldn't force
 * either on a consumer who wants different behavior.
 *
 * Uses onPointerDown (not onClick) for the dismiss handler - the
 * blueprint names this component's job as "pointer event handling"
 * specifically, and onPointerDown is the same choice Radix's Dismissable
 * Layer makes for outside-dismiss: it fires immediately on press rather
 * than waiting for a full click sequence to complete, and reads as more
 * responsive for a scrim dismiss. Since the overlay renders no children
 * (the drawer surface is a sibling, not nested inside it, per the file
 * split in the blueprint), any pointer-down on this element is
 * unambiguously a backdrop dismiss - no target-vs-currentTarget check
 * needed.
 *
 * Known limitation: the animated blur ramp (initial/animate/exit) only
 * interpolates the unprefixed `backdropFilter` property, which is what
 * Framer Motion's style animation writes to. The `-webkit-` prefixed
 * fallback below is set statically at the final blur value for older
 * Safari, so on engines that still need the prefix, the blur will appear
 * to snap in rather than ramp smoothly - a real, currently-unresolved gap
 * rather than a silently-accepted one.
 */

import { useEffect, type CSSProperties } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { DEFAULT_OVERLAY_BLUR, OVERLAY_TRANSITION } from "../../config/liquidConstants";

export interface DrawerOverlayProps {
  /** Whether the drawer (and therefore this overlay) is open. Drives the internal fade in/out. */
  isOpen: boolean;
  /** Called when the user dismisses via backdrop press or Escape. */
  onClose: () => void;
  /** Backdrop blur strength in px once fully open. Defaults to DEFAULT_OVERLAY_BLUR. */
  blurStrength?: number;
  /** Scrim color (any valid CSS color/color-mix value). */
  color?: string;
  /** Whether pressing Escape dismisses. Default true. */
  closeOnEscape?: boolean;
  /** Whether pressing the backdrop itself dismisses. Default true. */
  closeOnPointerDown?: boolean;
  /** Whether to lock body scroll while open. Default true. */
  lockScroll?: boolean;
  /** Fade transition. Defaults to OVERLAY_TRANSITION - deliberately decoupled from the drawer surface's own morph spring, since dimming a backdrop reads better as a quick fade than a springy motion. */
  transition?: Transition;
  /** Additional class name merged onto the scrim element. */
  className?: string;
  /** Additional inline styles merged onto (and able to override) the scrim's own styles. */
  style?: CSSProperties;
}

export function DrawerOverlay({
  isOpen,
  onClose,
  blurStrength = DEFAULT_OVERLAY_BLUR,
  color = "rgba(0, 0, 0, 0.4)",
  closeOnEscape = true,
  closeOnPointerDown = true,
  lockScroll = true,
  transition = OVERLAY_TRANSITION as Transition,
  className,
  style,
}: DrawerOverlayProps) {
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  useEffect(() => {
    if (!isOpen || !lockScroll) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, lockScroll]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="presentation"
          aria-hidden="true"
          className={className}
          onPointerDown={closeOnPointerDown ? onClose : undefined}
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: `blur(${blurStrength}px)` }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={transition}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: color,
            WebkitBackdropFilter: `blur(${blurStrength}px)`,
            touchAction: "none",
            ...style,
          }}
        />
      )}
    </AnimatePresence>
  );
}