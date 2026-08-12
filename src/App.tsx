import { useState } from "react";
import { LiquidMotionDrawer } from "./components/LiquidMotionDrawer";
import "./App.css";

const FEATURES = [
  {
    icon: "🔮",
    title: "SVG Refraction Pipeline",
    desc: "7-stage filter chain — blur, displace, saturate, specular, blend — for physically-based glass rendering.",
  },
  {
    icon: "⚡",
    title: "Spring-Driven Morphing",
    desc: "Framer Motion layout transitions with stiffness/damping tuning morph a pill into a full panel.",
  },
  {
    icon: "🎨",
    title: "GPU-Native Compositing",
    desc: "backdrop-filter: url(#filter) lets the browser's own compositor refract live content behind the surface.",
  },
] as const;

const DRAWER_FEATURES = [
  { icon: "🧊", label: "Snell's-law displacement maps" },
  { icon: "✨", label: "Directional specular highlights" },
  { icon: "🌀", label: "Velocity-driven refraction boost" },
  { icon: "🎯", label: "Content reveal at 85% threshold" },
  { icon: "♻️", label: "Object URL lifecycle management" },
  { icon: "🖥️", label: "Chromium backdrop-filter path" },
];

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Ambient glow blobs */}
      <div className="ambient-glow ambient-glow--purple" />
      <div className="ambient-glow ambient-glow--cyan" />

      <main className="app">
        {/* ── Hero ── */}
        <section className="hero">
          <span className="hero__badge">
            <span className="hero__badge-dot" />
            Framer Motion × SVG Filters
          </span>
          <h1 className="hero__title">Liquid Motion Drawer</h1>
          <p className="hero__subtitle">
            A glass-like drawer component powered by real-time displacement
            mapping, specular highlights, and spring physics — rendered
            entirely through the browser's native SVG filter pipeline.
          </p>
        </section>

        {/* ── Showcase cards ── */}
        <section className="showcase" aria-label="Feature highlights">
          {FEATURES.map((f) => (
            <article key={f.title} className="showcase__card">
              <div className="showcase__card-icon">{f.icon}</div>
              <h2 className="showcase__card-title">{f.title}</h2>
              <p className="showcase__card-desc">{f.desc}</p>
            </article>
          ))}
        </section>

        {/* ── CTA ── */}
        <div className="cta-section">
          <span className="cta-label">
            Try the liquid glass effect live
          </span>
          <button
            className="cta-button"
            onClick={() => setDrawerOpen(true)}
          >
            Open the Drawer
            <span className="cta-button__arrow">→</span>
          </button>
        </div>
      </main>

      {/* ── The Drawer (controlled mode) ── */}
      <LiquidMotionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        surfaceIsTrigger={false}
        width={380}
        height={480}
        radius={24}
        aria-label="Liquid Motion Drawer demo"
        optics={{
          surfaceType: "convex_squircle",
          bezelWidth: 30,
          glassThickness: 150,
          refractiveIndex: 1.5,
          refractionScale: 1.5,
          specularOpacity: 1,
          saturation: 1.3,
          blur: 0.5,
        }}
      >
        {({ close }) => (
          <div className="drawer-content">
            {/* Header */}
            <div className="drawer-header">
              <div className="drawer-header__text">
                <h2>Liquid Glass</h2>
                <p>Real-time refraction engine</p>
              </div>
              <button
                className="drawer-close-btn"
                onClick={close}
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>

            <hr className="drawer-divider" />

            {/* Body */}
            <div className="drawer-body">
              {/* Stats row */}
              <div className="drawer-stat-row">
                <div className="drawer-stat">
                  <div className="drawer-stat__value">7</div>
                  <div className="drawer-stat__label">Filter Stages</div>
                </div>
                <div className="drawer-stat">
                  <div className="drawer-stat__value">128</div>
                  <div className="drawer-stat__label">Radial Samples</div>
                </div>
                <div className="drawer-stat">
                  <div className="drawer-stat__value">1.5</div>
                  <div className="drawer-stat__label">IOR (Glass)</div>
                </div>
              </div>

              {/* Feature list */}
              <ul className="drawer-feature-list">
                {DRAWER_FEATURES.map((f) => (
                  <li key={f.label} className="drawer-feature-item">
                    <span className="drawer-feature-item__icon">
                      {f.icon}
                    </span>
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </LiquidMotionDrawer>
    </>
  );
}
