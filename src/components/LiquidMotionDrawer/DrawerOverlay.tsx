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