import { createRoot } from "react-dom/client";

function App() {
  return <div style={{ color: "white" }}>donut placeholder</div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
