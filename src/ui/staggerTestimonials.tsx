import { createRoot, type Root } from "react-dom/client";

import { StaggerTestimonialsSection } from "@/components/stagger-testimonials-section";

let reactRoot: Root | null = null;

export function mountStaggerTestimonials() {
  const container = document.querySelector<HTMLElement>(
    "#stagger-testimonials-root",
  );
  if (!container || reactRoot) return;

  reactRoot = createRoot(container);
  reactRoot.render(<StaggerTestimonialsSection />);
}
