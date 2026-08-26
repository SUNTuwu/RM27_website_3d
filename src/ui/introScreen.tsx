import { createRoot, type Root } from "react-dom/client";

import { IntroScreen, type IntroControl } from "@/components/intro-screen";

let reactRoot: Root | null = null;

export type IntroHandle = {
  control: IntroControl;
};

export function mountIntroScreen({
  onLaunch,
}: {
  onLaunch: () => void;
}): IntroHandle | null {
  const container = document.querySelector<HTMLElement>("#intro-root");
  if (!container || reactRoot) return null;

  const control: IntroControl = { launch: () => {} };
  reactRoot = createRoot(container);
  reactRoot.render(
    <IntroScreen
      control={control}
      onLaunch={onLaunch}
      onDone={() => {
        reactRoot?.unmount();
        reactRoot = null;
        container.remove();
      }}
    />,
  );
  return { control };
}
