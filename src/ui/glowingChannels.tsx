import { createRoot, type Root } from "react-dom/client";

import { GlowingChannelsSection } from "@/components/glowing-channels-section";

let reactRoot: Root | null = null;

export function mountGlowingChannels() {
  const container = document.querySelector<HTMLElement>(
    "#glowing-channels-root",
  );
  if (!container || reactRoot) return;

  reactRoot = createRoot(container);
  reactRoot.render(<GlowingChannelsSection />);
}
