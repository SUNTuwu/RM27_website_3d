import { createRoot, type Root } from "react-dom/client";

import { ZoomParallaxSection } from "@/components/zoom-parallax-section";

let reactRoot: Root | null = null;

export function mountZoomParallax() {
  const container = document.querySelector<HTMLElement>("#zoom-parallax-root");
  if (!container || reactRoot) return;

  reactRoot = createRoot(container);
  reactRoot.render(<ZoomParallaxSection />);
}
