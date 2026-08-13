import { useEffect, useRef, useState } from "react";
import { Spring } from "../../utils/spring";
import "./Drawer.css";

interface DrawerProps {
  isOpen: boolean;
  useBackdrop: boolean;
  children: React.ReactNode;
  backgroundImageUrl: string;
}

export function Drawer({
  isOpen,
  useBackdrop,
  children,
  backgroundImageUrl,
}: DrawerProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cloneInnerRef = useRef<HTMLDivElement>(null);
  const animationFrameId = useRef<number | null>(null);

  // Springs for animation (stiffness: 400, damping: 30)
  const [springs] = useState(() => ({
    scale: new Spring(0.85, 400, 30),
    opacity: new Spring(0, 400, 30),
    shadowOffsetX: new Spring(0, 400, 30),
    shadowOffsetY: new Spring(4, 400, 30),
    shadowBlur: new Spring(12, 400, 30),
    shadowAlpha: new Spring(0.15, 300, 25),
  }));

  // Update clone position
  useEffect(() => {
    function updateClonePosition() {
      if (useBackdrop || !cloneInnerRef.current || !surfaceRef.current) return;
      const rect = surfaceRef.current.getBoundingClientRect();
      const inner = cloneInnerRef.current;
      inner.style.width = window.innerWidth + "px";
      inner.style.height = window.innerHeight + "px";
      inner.style.transform = `translate(${-rect.left}px, ${-rect.top}px)`;
    }
    updateClonePosition();
    window.addEventListener("resize", updateClonePosition);
    return () => window.removeEventListener("resize", updateClonePosition);
  }, [useBackdrop]);

  // Apply filter to clone element (fallback mode)
  useEffect(() => {
    if (!useBackdrop && cloneInnerRef.current?.parentElement) {
      cloneInnerRef.current.parentElement.style.filter = "url(#drawerLiquidFilter)";
    }
  }, [useBackdrop]);

  // Animation Loop
  useEffect(() => {
    const dt = Math.min(0.032, 1 / 60);

    if (isOpen) {
      springs.scale.setTarget(1.0);
      springs.opacity.setTarget(1.0);
      springs.shadowOffsetX.setTarget(4);
      springs.shadowOffsetY.setTarget(16);
      springs.shadowBlur.setTarget(24);
      springs.shadowAlpha.setTarget(0.22);
    } else {
      springs.scale.setTarget(0.85);
      springs.opacity.setTarget(0.0);
      springs.shadowOffsetX.setTarget(0);
      springs.shadowOffsetY.setTarget(4);
      springs.shadowBlur.setTarget(12);
      springs.shadowAlpha.setTarget(0.15);
    }

    function loop() {
      const scale = springs.scale.update(dt);
      const opacity = springs.opacity.update(dt);
      const shadowOffsetX = springs.shadowOffsetX.update(dt);
      const shadowOffsetY = springs.shadowOffsetY.update(dt);
      const shadowBlur = springs.shadowBlur.update(dt);
      const shadowAlpha = springs.shadowAlpha.update(dt);

      if (surfaceRef.current) {
        surfaceRef.current.style.transform = `scale(${scale})`;
        surfaceRef.current.style.opacity = `${opacity}`;
        
        // Pointer events only when mostly visible
        surfaceRef.current.style.pointerEvents = opacity > 0.5 ? "auto" : "none";

        // Optional: dynamic shadow based on spring (simplified inner bezel)
        const innerShadow = surfaceRef.current.querySelector(".glass-inner-shadow") as HTMLElement;
        if (innerShadow) {
          const insetAlpha = shadowAlpha * 0.6;
          innerShadow.style.boxShadow = `
            ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha}),
            inset ${shadowOffsetX * 0.3}px ${shadowOffsetY * 0.4}px 16px rgba(0, 0, 0, ${insetAlpha}),
            inset ${-shadowOffsetX * 0.3}px ${-shadowOffsetY * 0.4}px 16px rgba(255, 255, 255, ${insetAlpha * 0.8})
          `;
        }
      }

      // Clone position must stay in sync if scaled
      if (!useBackdrop && cloneInnerRef.current && surfaceRef.current) {
        const rect = surfaceRef.current.getBoundingClientRect();
        cloneInnerRef.current.style.transform = `translate(${-rect.left}px, ${-rect.top}px)`;
      }

      const allSettled =
        springs.scale.isSettled() &&
        springs.opacity.isSettled();

      if (!allSettled) {
        animationFrameId.current = requestAnimationFrame(loop);
      } else {
        animationFrameId.current = null;
      }
    }

    if (!animationFrameId.current) {
      animationFrameId.current = requestAnimationFrame(loop);
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isOpen, springs, useBackdrop]);

  return (
    <div className="drawer-container">
      <div
        ref={surfaceRef}
        className={`glass-surface ${useBackdrop ? "use-backdrop-filter" : ""}`}
        style={{ opacity: 0, pointerEvents: "none" }} // initial state
      >
        <div className="glass-clone">
          <div ref={cloneInnerRef} className="glass-clone-inner">
            <img src={backgroundImageUrl} alt="" draggable={false} />
          </div>
        </div>

        {children}

        <div className="glass-inner-shadow" />
      </div>
    </div>
  );
}
