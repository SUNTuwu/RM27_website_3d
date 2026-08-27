import { createRoot, type Root } from "react-dom/client";

import { IntroScreen, type IntroControl } from "@/components/intro-screen";

let reactRoot: Root | null = null;

export type IntroHandle = {
  control: IntroControl;
};

export function mountIntroScreen({
  onLaunch,
  ready = true,
}: {
  onLaunch: () => void;
  ready?: boolean;
}): IntroHandle | null {
  const container = document.querySelector<HTMLElement>("#intro-root");
  if (!container || reactRoot) return null;

  let resolveTypingDone: (() => void) | null = null;
  const typingDonePromise = new Promise<void>((resolve) => {
    resolveTypingDone = resolve;
  });
  const markTypingDone = () => {
    if (control.typingDone) return;
    control.typingDone = true;
    resolveTypingDone?.();
    resolveTypingDone = null;
  };
  const control: IntroControl = {
    ready,
    typingDone: false,
    launch: () => {
      control.requested = true;
    },
    setReady: (nextReady) => {
      control.ready = nextReady;
    },
    waitForTypingDone: () => typingDonePromise,
  };
  reactRoot = createRoot(container);
  reactRoot.render(
    <IntroScreen
      control={control}
      ready={ready}
      onLaunch={onLaunch}
      onTypingDone={markTypingDone}
      onDone={() => {
        reactRoot?.unmount();
        reactRoot = null;
        container.remove();
      }}
    />,
  );
  return { control };
}
