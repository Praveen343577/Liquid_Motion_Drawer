import { useState } from "react";
import "./App.css";
import bgImage from "./assets/background_2.jpg";
import { LiquidGlassDrawer } from "./components/LiquidGlassDrawer";

export default function App() {
  const [isOpen, setIsOpen] = useState(false);

  const appContent = (
    <div className="app-bg">
      <img src={bgImage} alt="Background" draggable={false} />
      <div style={{ padding: "4rem", color: "white", maxWidth: 600 }}>
        <h1 style={{ fontSize: "3rem", marginBottom: "1rem" }}>Liquid Glass Drawer</h1>
        <p style={{ fontSize: "1.2rem", lineHeight: 1.6, opacity: 0.8 }}>
          Click the toggle button in the bottom left corner to open the drawer. 
          The drawer acts as a monolithic liquid glass pane, refracting the content 
          beneath it dynamically.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {appContent}

      {/* Toggle button (Bottom Left) */}
      <button 
        className="toggle-btn" 
        onClick={() => setIsOpen(!isOpen)} 
        aria-label="Toggle Drawer"
        style={{
          position: "fixed",
          bottom: "2rem",
          left: "2rem",
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          border: "none",
          background: isOpen ? "rgba(255,255,255,0.2)" : "linear-gradient(135deg, #667eea, #764ba2)",
          color: "white",
          fontSize: "1.5rem",
          cursor: "pointer",
          zIndex: 2000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transition: "all 0.3s ease"
        }}
      >
        {isOpen ? "✕" : "◆"}
      </button>

      <LiquidGlassDrawer isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {appContent}
      </LiquidGlassDrawer>
    </>
  );
}

