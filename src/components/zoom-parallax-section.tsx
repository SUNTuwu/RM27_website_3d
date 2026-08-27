"use client";

import * as React from "react";
import { Archive, ArrowDown, Images } from "lucide-react";

import {
  ZoomParallax,
  type ZoomParallaxImage,
  type ZoomParallaxSlot,
} from "@/components/ui/zoom-parallax";

const ENTERPRIZE_IMAGES: readonly ZoomParallaxImage[] = [
  {
    src: "/assets/images/zoom/1.webp",
    alt: "RoboMaster 赛场红蓝双方机器人在准备区集结",
    priority: true,
    objectPosition: "center",
  },
  {
    src: "/assets/images/zoom/2.webp",
    alt: "ENTERPRIZE 战队标识与 RoboMaster 赛场主视觉",
    priority: true,
  },
  { src: "/assets/images/zoom/3.webp", alt: "队员出征前共同举起车票" },
  { src: "/assets/images/zoom/4.webp", alt: "RoboMaster 赛事场馆与对抗场地" },
  { src: "/assets/images/zoom/5.webp", alt: "队员围绕一号机器人进行赛场检修" },
  { src: "/assets/images/zoom/6.webp", alt: "RoboMaster 赛事签名留言墙" },
] as const;

const ENTERPRIZE_LAYOUT: readonly ZoomParallaxSlot[] = [
  {
    x: "0vw",
    y: "0vh",
    width: "34vw",
    height: "34vh",
    scale: 3.05,
    mobile: { width: "80vw", height: "25svh", scale: 4.1 },
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
] as const;

export function ZoomParallaxSection() {
  const scrollTo = React.useCallback((selector: string) => {
    const requested = document.querySelector(selector);
    const target = requested?.matches("[data-snap-scene]")
      ? requested
      : (requested?.querySelector("[data-snap-scene]") ?? requested);
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: target instanceof HTMLElement && target.dataset.snapAlign === "center"
        ? "center"
        : "start",
    });
  }, []);

  return (
    <section
      aria-label="ENTERPRIZE 赛事影像回顾"
      className="relative z-[60] w-full text-foreground"
      id="zoom-parallax-section"
    >
      <header
        className="relative flex min-h-[44svh] items-end bg-[linear-gradient(180deg,transparent_0%,rgb(5_8_15/0.55)_42%,rgb(5_8_15/0.35)_72%,transparent_100%)] px-5 pb-8 pt-20 sm:px-8 md:px-12 md:pb-12 xl:px-16"
        data-snap-align="start"
        data-snap-scene="beyond-arena"
      >
        <div className="mx-auto grid w-full max-w-[1500px] items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-5xl">
            <p className="mb-5 font-mono text-xs font-semibold uppercase text-muted-foreground md:text-sm">
              FIELD LOG // 06 FRAMES
            </p>
            <h2 className="font-[Audiowide] text-5xl leading-[0.98] text-foreground md:text-7xl xl:text-8xl">
              BEYOND THE ARENA
            </h2>
            <p className="mt-5 text-xl font-bold text-foreground md:text-2xl">
              赛场之外，仍是赛场
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              出发、调试、呐喊、拥抱。一支战队真正被记住的，不只有比分。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              aria-label="进入赛事影像"
              className="grid size-11 place-items-center rounded-sm border border-border bg-card text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => scrollTo("#zoom-parallax-gallery")}
              title="进入赛事影像"
              type="button"
            >
              <ArrowDown aria-hidden="true" size={18} strokeWidth={1.7} />
            </button>
            <button
              className="inline-flex h-11 items-center gap-2 rounded-sm border border-border bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => scrollTo("#archive-hero")}
              type="button"
            >
              <Archive aria-hidden="true" size={17} strokeWidth={1.8} />
              读取战队档案
            </button>
          </div>
        </div>
      </header>

      <ZoomParallax
        activationEvent="enterprize:zoom-activate"
        aria-label="ENTERPRIZE RoboMaster 赛事影像缩放视差画廊"
        className="bg-transparent"
        frameClassName="saturate-[0.92] transition-[border-color,filter] duration-500"
        id="zoom-parallax-gallery"
        images={ENTERPRIZE_IMAGES}
        layout={ENTERPRIZE_LAYOUT}
        loadStrategy="eager"
        spring={{ stiffness: 84, damping: 23, mass: 0.46 }}
        stageClassName="bg-transparent"
        trackHeight="320svh"
      >
        <div className="absolute left-5 top-5 flex items-center gap-2 border-l-2 border-primary bg-background/80 px-3 py-2 font-mono text-[11px] font-semibold text-foreground backdrop-blur-sm sm:left-8 sm:top-8 md:left-12">
          <Images aria-hidden="true" size={15} strokeWidth={1.7} />
          ENTERPRIZE / MATCH LOG
        </div>
        <p className="absolute bottom-5 right-5 border-r-2 border-secondary bg-background/80 px-3 py-2 text-right font-mono text-[11px] font-semibold text-muted-foreground backdrop-blur-sm sm:bottom-8 sm:right-8 md:right-12">
          06 FRAMES / ONE TEAM
        </p>
      </ZoomParallax>
    </section>
  );
}
