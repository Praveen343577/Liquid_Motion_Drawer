import "./App.css";
import bgImage from "./assets/background_6.jpg";
import { LiquidGlassBox } from "./components/LiquidGlassDrawer";

export default function App() {
  return (
    <>
      <div className="app-bg">
        <img src={bgImage} alt="Background" draggable={false} />
      </div>

      <LiquidGlassBox />
    </>
  );
}
