import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { LiquidOpticsConfig } from "../../config/liquidConstants";
import type { Transition } from "framer-motion";
import { DrawerOverlay } from "./DrawerOverlay";
import { DrawerSurface } from "./DrawerSurface";

export interface DrawerControls {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const OVERLAY_Z_INDEX = 1000;
const SURFACE_Z_INDEX = 1001;

/** Opinionated default placement - see file header. Overridable via `style`. */
const DEFAULT_SURFACE_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 24,
  right: 24,
};

export interface LiquidMotionDrawerProps {
  /** Controlled open state. Omit to use uncontrolled mode (see defaultOpen). */
  open?: boolean;
  /** Initial open state when uncontrolled. Ignored if `open` is provided. Default false. */
  defaultOpen?: boolean;
  /** Fires on every open-state request (pill tapped, backdrop clicked, Escape pressed) - required for controlled usage, optional but recommended otherwise. */
  onOpenChange?: (open: boolean) => void;
  /** Whether the closed surface itself acts as an open-trigger (see file header). Default true. */
  surfaceIsTrigger?: boolean;

  /** Target ("Open") pixel width/height of the drawer surface. */
  width: number;
  height: number;
  radius?: number;
  optics?: Partial<LiquidOpticsConfig>;
  boostIntensity?: number;
  filterId?: string;

  /** Overlay customization, forwarded to DrawerOverlay. */
  overlayBlur?: number;
  overlayColor?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  overlayTransition?: Transition;

  /** Accessible name while open (role="dialog"). Strongly recommended. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Accessible name while closed and acting as its own trigger (role="button"). Default "Open". */
  closedAriaLabel?: string;

  className?: string;
  style?: CSSProperties;

  /** Portal target. Defaults to document.body. */
  container?: HTMLElement | null;

  /** Drawer content. Either a plain node, or a function receiving live controls (handy for an in-content close button). */
  children?: ReactNode | ((controls: DrawerControls) => ReactNode);
}

export function LiquidMotionDrawer({
  open,
  defaultOpen = false,
  onOpenChange,
  surfaceIsTrigger = true,
  width,
  height,
  radius,
  optics,
  boostIntensity,
  filterId,
  overlayBlur,
  overlayColor,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  lockScroll = true,
  overlayTransition,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  closedAriaLabel = "Open",
  className,
  style,
  container,
  children,
}: LiquidMotionDrawerProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : internalOpen;

  const requestOpenChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const openDrawer = useCallback(() => requestOpenChange(true), [requestOpenChange]);
  const closeDrawer = useCallback(() => requestOpenChange(false), [requestOpenChange]);

  // Portal content only after mounting client-side - document.body isn't
  // available during SSR, and rendering it there would mismatch hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Focus management: move focus into the open dialog, restore it to
  // whatever was focused beforehand on close. `mounted` is in the
  // dependency array alongside `isOpen` deliberately - if the drawer
  // starts open (defaultOpen) on the very first client render, the portal
  // (and surfaceRef's DOM node) doesn't exist yet on that render; without
  // `mounted` here, this effect would run once too early, find a null
  // ref, and never get a second chance to focus in, since `isOpen` itself
  // wouldn't change again on its own.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!mounted) return;
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      surfaceRef.current?.focus();
    } else {
      previouslyFocusedRef.current?.focus?.();
      previouslyFocusedRef.current = null;
    }
  }, [isOpen, mounted]);

  if (!mounted) return null;

  const portalTarget = container ?? document.body;

  return createPortal(
    <>
      <DrawerOverlay
        isOpen={isOpen}
        onClose={closeDrawer}
        blurStrength={overlayBlur}
        color={overlayColor}
        closeOnEscape={closeOnEscape}
        closeOnPointerDown={closeOnOverlayClick}
        lockScroll={lockScroll}
        transition={overlayTransition}
        style={{ zIndex: OVERLAY_Z_INDEX }}
      />
      <DrawerSurface
        ref={surfaceRef}
        isOpen={isOpen}
        width={width}
        height={height}
        radius={radius}
        optics={optics}
        boostIntensity={boostIntensity}
        filterId={filterId}
        role={isOpen ? "dialog" : "button"}
        aria-label={isOpen ? ariaLabel : closedAriaLabel}
        aria-labelledby={isOpen ? ariaLabelledBy : undefined}
        tabIndex={surfaceIsTrigger ? 0 : -1}
        onClick={surfaceIsTrigger && !isOpen ? openDrawer : undefined}
        className={className}
        style={{ ...DEFAULT_SURFACE_STYLE, zIndex: SURFACE_Z_INDEX, ...style }}
      >
        {typeof children === "function"
          ? children({ isOpen, open: openDrawer, close: closeDrawer })
          : children}
      </DrawerSurface>
    </>,
    portalTarget,
  );
}