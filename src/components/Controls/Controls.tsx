import "./Controls.css";

const SURFACE_TYPES = [
  { key: "convex_squircle", label: "Convex Squircle" },
  { key: "convex_circle", label: "Convex Circle" },
  { key: "concave", label: "Concave" },
  { key: "lip", label: "Lip" },
];

export interface ControlsProps {
  surfaceType: string;
  setSurfaceType: (val: string) => void;
  useBackdrop: boolean;
  setUseBackdrop: (val: boolean) => void;
  backdropSupported: boolean;
  bezelWidth: number;
  setBezelWidth: (val: number) => void;
  glassThickness: number;
  setGlassThickness: (val: number) => void;
  refractionScale: number;
  setRefractionScale: (val: number) => void;
  specularOpacity: number;
  setSpecularOpacity: (val: number) => void;
  blur: number;
  setBlur: (val: number) => void;
}

export function Controls({
  surfaceType,
  setSurfaceType,
  useBackdrop,
  setUseBackdrop,
  backdropSupported,
  bezelWidth,
  setBezelWidth,
  glassThickness,
  setGlassThickness,
  refractionScale,
  setRefractionScale,
  specularOpacity,
  setSpecularOpacity,
  blur,
  setBlur,
}: ControlsProps) {
  return (
    <div className="controls-panel">
      <div className="controls-header">
        <span className="controls-header-text">Parameters</span>
        <span className="controls-header-line" />
      </div>

      <div className="control-row">
        <label className="control-label">Surface Type</label>
        <div className="surface-selector">
          {SURFACE_TYPES.map((s) => (
            <button
              key={s.key}
              className={`surface-btn ${surfaceType === s.key ? "active" : ""}`}
              onClick={() => setSurfaceType(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-row">
        <label className="control-label">Render Mode</label>
        <div className="mode-toggle">
          <div
            className={`mode-toggle-switch ${useBackdrop ? "active" : ""}`}
            onClick={() => setUseBackdrop(!useBackdrop)}
            title="Toggle between backdrop-filter and clone fallback"
          />
          <span className="mode-toggle-value">
            {useBackdrop ? "Backdrop-filter" : "Clone (Fallback)"}
          </span>
          {useBackdrop && !backdropSupported && (
            <span style={{ fontSize: 10, color: "#f56565" }}>
              ⚠ Not supported
            </span>
          )}
        </div>
      </div>

      <div className="control-row">
        <label className="control-label">Bezel Width</label>
        <span className="control-value">{Math.round(bezelWidth)}</span>
        <input
          type="range"
          className="control-slider"
          min={5}
          max={70}
          value={bezelWidth}
          onChange={(e) => setBezelWidth(Number(e.target.value))}
        />
      </div>

      <div className="control-row">
        <label className="control-label">Glass Thickness</label>
        <span className="control-value">{Math.round(glassThickness)}</span>
        <input
          type="range"
          className="control-slider"
          min={10}
          max={200}
          value={glassThickness}
          onChange={(e) => setGlassThickness(Number(e.target.value))}
        />
      </div>

      <div className="control-row">
        <label className="control-label">Refraction Scale</label>
        <span className="control-value">{refractionScale.toFixed(2)}</span>
        <input
          type="range"
          className="control-slider"
          min={0}
          max={1.5}
          step={0.01}
          value={refractionScale}
          onChange={(e) => setRefractionScale(Number(e.target.value))}
        />
      </div>

      <div className="control-row">
        <label className="control-label">Specular Opacity</label>
        <span className="control-value">{specularOpacity.toFixed(2)}</span>
        <input
          type="range"
          className="control-slider"
          min={0}
          max={1}
          step={0.01}
          value={specularOpacity}
          onChange={(e) => setSpecularOpacity(Number(e.target.value))}
        />
      </div>

      <div className="control-row">
        <label className="control-label">Blur</label>
        <span className="control-value">{blur.toFixed(1)}</span>
        <input
          type="range"
          className="control-slider"
          min={0}
          max={10}
          step={0.1}
          value={blur}
          onChange={(e) => setBlur(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
