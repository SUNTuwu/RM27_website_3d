"use client";

import * as React from "react";
import {
  motion,
  type MotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";

import { cn } from "@/lib/utils";

export type ZoomParallaxImage =
  | string
  | {
      src: string;
      alt?: string;
      className?: string;
      objectPosition?: string;
      sizes?: string;
      priority?: boolean;
    };

export interface ZoomParallaxSlot {
  x: string;
  y: string;
  width: string;
  height: string;
  scale: number;
  mobile?: Partial<Pick<ZoomParallaxSlot, "x" | "y" | "width" | "height" | "scale">>;
  zIndex?: number;
}

type ScrollOptions = NonNullable<Parameters<typeof useScroll>[0]>;

export interface ZoomParallaxProps
  extends Omit<React.ComponentPropsWithoutRef<"section">, "children"> {
  images: readonly ZoomParallaxImage[];
  layout?: readonly ZoomParallaxSlot[];
  trackHeight?: string;
  stageHeight?: string;
  stageClassName?: string;
  layerClassName?: string;
  frameClassName?: string;
  imageClassName?: string;
  overlayClassName?: string;
  scrollContainer?: React.RefObject<HTMLElement | null>;
  scrollOffset?: ScrollOptions["offset"];
  loadStrategy?: "eager" | "visible" | "manual";
  activationEvent?: string;
  showProgress?: boolean;
  children?: React.ReactNode;
}

type SlotVariables = React.CSSProperties & {
  "--zoom-slot-x": string;
  "--zoom-slot-y": string;
  "--zoom-slot-width": string;
  "--zoom-slot-height": string;
  "--zoom-slot-mobile-x"?: string;
  "--zoom-slot-mobile-y"?: string;
  "--zoom-slot-mobile-width"?: string;
  "--zoom-slot-mobile-height"?: string;
};

export const DEFAULT_ZOOM_PARALLAX_LAYOUT: readonly ZoomParallaxSlot[] = [
  {
    x: "0vw",
    y: "0vh",
    width: "25vw",
    height: "25vh",
    scale: 4,
    mobile: { width: "45vw", height: "45svh", scale: 2.25 },
  },
  {
    x: "5vw",
    y: "-30vh",
    width: "35vw",
    height: "30vh",
    scale: 5,
    mobile: { x: "8vw", y: "-31svh", width: "55vw", height: "20svh", scale: 4 },
  },
  {
    x: "-25vw",
    y: "-10vh",
    width: "20vw",
    height: "45vh",
    scale: 6,
    mobile: { x: "-28vw", y: "-8svh", width: "32vw", height: "28svh", scale: 5 },
  },
  {
    x: "27.5vw",
    y: "0vh",
    width: "25vw",
    height: "25vh",
    scale: 5,
    mobile: { x: "30vw", y: "-3svh", width: "30vw", height: "22svh", scale: 5.5 },
  },
  {
    x: "5vw",
    y: "27.5vh",
    width: "20vw",
    height: "25vh",
    scale: 6,
    mobile: { x: "5vw", y: "28svh", width: "36vw", height: "18svh", scale: 6 },
  },
  {
    x: "-22.5vw",
    y: "27.5vh",
    width: "30vw",
    height: "25vh",
    scale: 8,
    mobile: { x: "-28vw", y: "29svh", width: "40vw", height: "20svh", scale: 7 },
  },
  {
    x: "25vw",
    y: "22.5vh",
    width: "15vw",
    height: "15vh",
    scale: 9,
    mobile: { x: "31vw", y: "25svh", width: "28vw", height: "15svh", scale: 8 },
  },
] as const;

function resolveImage(image: ZoomParallaxImage, index: number) {
  return typeof image === "string"
    ? { src: image, alt: `Parallax image ${index + 1}` }
    : image;
}

function resolveSlot(layout: readonly ZoomParallaxSlot[], index: number) {
  const slot = layout[index % layout.length];
  const cycle = Math.floor(index / layout.length);

  return cycle === 0
    ? slot
    : {
        ...slot,
        scale: slot.scale + cycle * 2,
        mobile: slot.mobile
          ? { ...slot.mobile, scale: (slot.mobile.scale ?? slot.scale) + cycle * 2 }
          : undefined,
      };
}

interface ParallaxLayerProps {
  active: boolean;
  image: ZoomParallaxImage;
  index: number;
  total: number;
  progress: MotionValue<number>;
  slot: ZoomParallaxSlot;
  compact: boolean;
  shouldLoad: boolean;
  reducedMotion: boolean;
  layerClassName?: string;
  frameClassName?: string;
  imageClassName?: string;
}

function ParallaxLayer({
  active,
  image,
  index,
  total,
  progress,
  slot,
  compact,
  shouldLoad,
  reducedMotion,
  layerClassName,
  frameClassName,
  imageClassName,
}: ParallaxLayerProps) {
  const item = resolveImage(image, index);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const mobileTarget = slot.mobile?.scale ?? slot.scale;
  const targetScale = compact ? mobileTarget : slot.scale;
  const rawScale = useTransform(progress, [0, 1], [1, targetScale]);
  const scale = reducedMotion ? 1 : rawScale;

  const requestedSource = React.useMemo(() => {
    if (!shouldLoad) return undefined;
    if (retryCount === 0) return item.src;
    const separator = item.src.includes("?") ? "&" : "?";
    return `${item.src}${separator}retry=${retryCount}`;
  }, [item.src, retryCount, shouldLoad]);

  React.useLayoutEffect(() => {
    const node = imageRef.current;
    if (!shouldLoad || !node) {
      setLoaded(false);
      return;
    }
    setLoaded(node.complete && node.naturalWidth > 0);
  }, [requestedSource, shouldLoad]);

  React.useEffect(() => {
    setRetryCount(0);
  }, [item.src, shouldLoad]);

  const handleLoadError = React.useCallback(() => {
    setLoaded(false);
    setRetryCount((current) => Math.min(current + 1, 1));
  }, []);

  const slotStyle: SlotVariables = {
    "--zoom-slot-x": slot.x,
    "--zoom-slot-y": slot.y,
    "--zoom-slot-width": slot.width,
    "--zoom-slot-height": slot.height,
    "--zoom-slot-mobile-x": slot.mobile?.x,
    "--zoom-slot-mobile-y": slot.mobile?.y,
    "--zoom-slot-mobile-width": slot.mobile?.width,
    "--zoom-slot-mobile-height": slot.mobile?.height,
  };

  return (
    <motion.div
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center will-change-transform",
        layerClassName,
      )}
      data-zoom-index={index + 1}
      data-zoom-layer=""
      style={{ scale, zIndex: slot.zIndex ?? total - index }}
    >
      <figure
        className={cn(
          "zoom-parallax-frame absolute left-1/2 top-1/2 overflow-hidden rounded-sm border border-border/50 bg-muted shadow-[0_24px_80px_rgba(0,0,0,0.5)]",
          frameClassName,
        )}
        data-zoom-frame=""
        style={slotStyle}
      >
        <img
          alt={item.alt ?? `Parallax image ${index + 1}`}
          aria-hidden={!active}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
            imageClassName,
            item.className,
          )}
          data-zoom-image=""
          data-zoom-load-state={loaded ? "loaded" : retryCount ? "retrying" : "loading"}
          decoding="async"
          fetchPriority={item.priority || index === 0 ? "high" : "auto"}
          loading={shouldLoad ? "eager" : "lazy"}
          onError={handleLoadError}
          onLoad={() => setLoaded(true)}
          ref={imageRef}
          sizes={item.sizes ?? "(max-width: 767px) 56vw, 35vw"}
          src={requestedSource}
          style={{ objectPosition: item.objectPosition }}
        />
      </figure>
    </motion.div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  React.useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export const ZoomParallax = React.forwardRef<HTMLElement, ZoomParallaxProps>(
  function ZoomParallax(
    {
      images,
      layout = DEFAULT_ZOOM_PARALLAX_LAYOUT,
      trackHeight = "300svh",
      stageHeight = "100svh",
      className,
      stageClassName,
      layerClassName,
      frameClassName,
      imageClassName,
      overlayClassName,
      scrollContainer,
      scrollOffset = ["start start", "end end"],
      loadStrategy = "visible",
      activationEvent,
      showProgress = true,
      children,
      style,
      ...props
    },
    forwardedRef,
  ) {
    const rootRef = React.useRef<HTMLElement | null>(null);
    const reducedMotion = useReducedMotion() ?? false;
    const compact = useMediaQuery("(max-width: 767px)");
    const [active, setActive] = React.useState(loadStrategy === "eager");
    const initialRequestedMax = Math.min(images.length - 1, 2);
    const [requestedMaxIndex, setRequestedMaxIndex] =
      React.useState(initialRequestedMax);
    const { scrollYProgress } = useScroll({
      container: scrollContainer,
      target: rootRef,
      offset: scrollOffset,
    });

    const setRootRef = React.useCallback(
      (node: HTMLElement | null) => {
        rootRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    React.useEffect(() => {
      if (active || loadStrategy !== "visible" || !rootRef.current) return;
      if (!("IntersectionObserver" in window)) {
        setActive(true);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setActive(true);
            observer.disconnect();
          }
        },
        { root: scrollContainer?.current ?? null, threshold: 0.01 },
      );
      observer.observe(rootRef.current);
      return () => observer.disconnect();
    }, [active, loadStrategy, scrollContainer]);

    React.useEffect(() => {
      if (!activationEvent || active) return;
      const activate = () => setActive(true);
      window.addEventListener(activationEvent, activate, { once: true });
      return () => window.removeEventListener(activationEvent, activate);
    }, [activationEvent, active]);

    React.useEffect(() => {
      if (loadStrategy === "eager") {
        setRequestedMaxIndex(images.length - 1);
        return;
      }
      if (!active) {
        setRequestedMaxIndex(initialRequestedMax);
        return;
      }

      const updateWindow = (value: number) => {
        const cursor = Math.floor(value * Math.max(images.length - 1, 0));
        setRequestedMaxIndex((current) =>
          Math.min(images.length - 1, Math.max(current, cursor + 2)),
        );
      };

      updateWindow(scrollYProgress.get());
      return scrollYProgress.on("change", updateWindow);
    }, [active, images.length, initialRequestedMax, loadStrategy, scrollYProgress]);

    if (!layout.length) return null;

    return (
      <section
        {...props}
        aria-label={props["aria-label"] ?? "Zoom parallax gallery"}
        className={cn("relative w-full bg-background", className)}
        data-active={active ? "true" : "false"}
        data-zoom-parallax=""
        ref={setRootRef}
        style={{
          ...style,
          height: reducedMotion ? stageHeight : trackHeight,
        }}
      >
        <div
          className={cn(
            "sticky top-0 isolate w-full max-w-[100vw] overflow-hidden bg-background",
            stageClassName,
          )}
          data-zoom-stage=""
          style={{ height: stageHeight }}
        >
          {images.map((image, index) => (
            <ParallaxLayer
              active={active}
              compact={compact}
              frameClassName={frameClassName}
              image={image}
              imageClassName={imageClassName}
              index={index}
              key={typeof image === "string" ? image : image.src}
              layerClassName={layerClassName}
              progress={scrollYProgress}
              reducedMotion={reducedMotion}
              shouldLoad={
                loadStrategy === "eager" || (active && index <= requestedMaxIndex)
              }
              slot={resolveSlot(layout, index)}
              total={images.length}
            />
          ))}

          {showProgress ? (
            <motion.span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 z-[90] h-px origin-left bg-primary"
              data-zoom-progress=""
              style={{ scaleX: scrollYProgress }}
            />
          ) : null}

          {children ? (
            <div
              className={cn("pointer-events-none absolute inset-0 z-[80]", overlayClassName)}
            >
              {children}
            </div>
          ) : null}
        </div>
      </section>
    );
  },
);
