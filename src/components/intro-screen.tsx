"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ArrowRight, BookOpen } from "lucide-react";

import {
  createSpaceStarfield,
  type SpaceStarfieldController,
} from "../space-starfield";

// 起始界面: 打字机对话 -> 入场按钮 -> 背景星场加速离开 -> 点云 EXPLORE
// 装饰语言对齐 open-source 页: 红蓝细线/折线 + 斜切平行四边形 + 135deg 斜线纹理。

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Segment = { text: string; emphasis?: boolean };

const LINES: Segment[][] = [
  [
    { text: "We are " },
    { text: "ENTERPRIZE", emphasis: true },
    { text: "." },
  ],
  [{ text: "We build the machines that carry us beyond the known." }],
];

const CHAR_MS = 34;
const LINE_PAUSE_MS = 480;
const BACKGROUND_EXIT_MS = 880;
const FADE_MS = 700;
const COMPLETION_LAYOUT_MS = 560;
const COMPLETION_COPY_MS = 440;
const COMPLETION_GAP_MS = 80;
const REDUCED_COPY_MS = 260;

type CompletionStage = "hidden" | "copy" | "cta" | "ready";

function SpaceBackground({
  accelerating,
  onAccelerationComplete,
}: {
  accelerating: boolean;
  onAccelerationComplete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<SpaceStarfieldController | null>(null);
  const completionRef = useRef(onAccelerationComplete);

  useEffect(() => {
    completionRef.current = onAccelerationComplete;
  }, [onAccelerationComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || REDUCED()) return;
    controllerRef.current = createSpaceStarfield(canvas);
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!accelerating) {
      controllerRef.current?.setBoost(0);
      return;
    }

    performance.mark?.("enterprize:background-acceleration-start");
    controllerRef.current?.setBoost(1);
    const timer = window.setTimeout(
      () => {
        performance.mark?.("enterprize:background-acceleration-complete");
        completionRef.current();
      },
      REDUCED() ? 180 : BACKGROUND_EXIT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [accelerating]);

  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div
        data-intro-nebula
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 700px at 82% -10%, rgba(46,155,255,0.13), transparent 60%), radial-gradient(900px 600px at 5% 110%, rgba(255,45,77,0.09), transparent 62%), radial-gradient(700px 500px at 52% 46%, rgba(127,156,245,0.05), transparent 70%), #05070d",
        }}
      />
      <canvas
        ref={canvasRef}
        data-intro-starfield
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

function useTypewriter(active: boolean) {
  const [progress, setProgress] = useState(0);
  const totalChars = LINES.flat().reduce((n, s) => n + s.text.length, 0);
  const done = progress >= totalChars;
  const forcedDone = useRef(false);

  const finish = useCallback(() => {
    forcedDone.current = true;
    setProgress(totalChars);
  }, [totalChars]);

  useEffect(() => {
    if (!active) return;
    if (REDUCED()) {
      setProgress(totalChars);
      return;
    }
    const flat = LINES.flat();
    const revealAt: number[] = [];
    let scheduleAt = 0;
    flat.forEach((segment, segmentIndex) => {
      for (let index = 0; index < segment.text.length; index += 1) {
        scheduleAt += CHAR_MS;
        revealAt.push(scheduleAt);
      }
      if (segmentIndex < flat.length - 1) {
        scheduleAt += LINE_PAUSE_MS;
      }
    });
    const startedAt = performance.now();
    let raf = 0;
    let lastProgress = 0;
    const frame = (now: number) => {
      if (forcedDone.current) return;
      const elapsed = now - startedAt;
      let nextProgress = lastProgress;
      while (
        nextProgress < revealAt.length &&
        revealAt[nextProgress] <= elapsed
      ) {
        nextProgress += 1;
      }
      if (nextProgress !== lastProgress) {
        lastProgress = nextProgress;
        setProgress(nextProgress);
      }
      if (nextProgress < totalChars) {
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [active, totalChars]);

  return { progress, done, finish };
}

function TypedLines({ progress }: { progress: number }) {
  let used = 0;
  return (
    <>
      {LINES.map((line, li) => (
        <p
          key={li}
          className={
            li === 0
              ? "flex flex-wrap items-baseline justify-center gap-x-[0.35em]"
              : "mt-6"
          }
        >
          {line.map((seg, si) => {
            const start = used;
            used += seg.text.length;
            const visible = Math.max(0, Math.min(progress - start, seg.text.length));
            return (
              <span
                key={si}
                className={
                  seg.emphasis
                    ? "bg-gradient-to-r from-[#ff2d4d] via-white to-[#2e9bff] bg-clip-text text-transparent [font-size:clamp(44px,12vw,148px)] leading-none drop-shadow-[0_0_28px_rgba(46,155,255,0.45)]"
                    : li === 0
                      ? "text-[clamp(22px,3.6vw,50px)] text-white/90"
                      : "text-[clamp(14px,2.4vw,22px)] tracking-wide text-[#a9b8d0]"
                }
              >
                {seg.text.slice(0, visible)}
              </span>
            );
          })}
        </p>
      ))}
    </>
  );
}

export type IntroControl = {
  launch: () => void;
  requested?: boolean;
  ready?: boolean;
  setReady?: (ready: boolean) => void;
  progress?: number;
  status?: string;
  error?: string | null;
  setProgress?: (progress: number, status?: string) => void;
  setError?: (message: string | null) => void;
  retry?: () => void;
  markCompleted?: () => void;
  openArchive?: (targetHash?: string) => void | Promise<void>;
  typingDone?: boolean;
  waitForTypingDone?: () => Promise<void>;
};

export function IntroScreen({
  onLaunch,
  onDone,
  onTypingDone,
  control,
  ready = true,
}: {
  onLaunch: () => void;
  onDone: () => void;
  onTypingDone?: () => void;
  control?: IntroControl;
  ready?: boolean;
}) {
  const [phase, setPhase] = useState<"typing" | "accelerate" | "fade">(
    "typing",
  );
  const [canLaunch, setCanLaunch] = useState(ready);
  const [loadProgress, setLoadProgress] = useState(() =>
    Math.min(Math.max(control?.progress ?? 0, 0), 1),
  );
  const [loadStatus, setLoadStatus] = useState(
    control?.status ?? "FETCHING POINT CLOUD",
  );
  const [loadError, setLoadError] = useState<string | null>(
    control?.error ?? null,
  );
  const [entryQueued, setEntryQueued] = useState(Boolean(control?.requested));
  const [completionStage, setCompletionStage] =
    useState<CompletionStage>("hidden");
  const { progress, done, finish } = useTypewriter(phase === "typing");
  const launchedRef = useRef(false);
  const sceneLaunchRef = useRef(false);
  const navigationRef = useRef(false);
  const doneTimerRef = useRef(0);
  const completionFrameRef = useRef(0);
  const completionCopyTimerRef = useRef(0);
  const completionCtaTimerRef = useRef(0);
  const wheelAccumRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const reducedMotion = REDUCED();

  const revealCompletionCopy = useCallback(() => {
    if (!done || phase !== "typing") return;
    window.cancelAnimationFrame(completionFrameRef.current);
    completionFrameRef.current = window.requestAnimationFrame(() => {
      setCompletionStage((current) =>
        current === "hidden" ? "copy" : current,
      );
    });
  }, [done, phase]);

  const revealCompletionCta = useCallback(() => {
    if (!done || phase !== "typing") return;
    window.clearTimeout(completionCtaTimerRef.current);
    completionCtaTimerRef.current = window.setTimeout(() => {
      window.cancelAnimationFrame(completionFrameRef.current);
      completionFrameRef.current = window.requestAnimationFrame(() => {
        setCompletionStage((current) =>
          current === "copy" ? "cta" : current,
        );
      });
    }, reducedMotion ? 40 : COMPLETION_GAP_MS);
  }, [done, phase, reducedMotion]);

  const enableCompletionCta = useCallback(() => {
    if (!done || phase !== "typing") return;
    window.cancelAnimationFrame(completionFrameRef.current);
    completionFrameRef.current = window.requestAnimationFrame(() => {
      setCompletionStage((current) =>
        current === "cta" ? "ready" : current,
      );
    });
  }, [done, phase]);

  useEffect(() => {
    setCanLaunch(ready);
  }, [ready]);

  useEffect(
    () => () => {
      window.clearTimeout(doneTimerRef.current);
      window.cancelAnimationFrame(completionFrameRef.current);
      window.clearTimeout(completionCopyTimerRef.current);
      window.clearTimeout(completionCtaTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (done) {
      onTypingDone?.();
    }
  }, [done, onTypingDone]);

  useEffect(() => {
    window.cancelAnimationFrame(completionFrameRef.current);
    window.clearTimeout(completionCopyTimerRef.current);
    window.clearTimeout(completionCtaTimerRef.current);

    if (!done || phase !== "typing") {
      setCompletionStage("hidden");
      return;
    }

    // Mount the complete layout invisibly for one paint. Framer can then
    // compensate the centered flex reflow before any newly mounted copy shows.
    setCompletionStage("hidden");
    if (reducedMotion) {
      completionCopyTimerRef.current = window.setTimeout(
        revealCompletionCopy,
        80,
      );
    } else {
      // The normal path advances from onLayoutAnimationComplete. This fallback
      // also covers a browser that decides the measured layout delta is zero.
      completionCopyTimerRef.current = window.setTimeout(
        revealCompletionCopy,
        COMPLETION_LAYOUT_MS + 120,
      );
    }

    return () => {
      window.cancelAnimationFrame(completionFrameRef.current);
      window.clearTimeout(completionCopyTimerRef.current);
      window.clearTimeout(completionCtaTimerRef.current);
    };
  }, [done, phase, reducedMotion, revealCompletionCopy]);

  const updateProgress = useCallback(
    (nextProgress: number, nextStatus?: string) => {
      const normalized = Math.min(Math.max(Number(nextProgress) || 0, 0), 1);
      if (control) {
        control.progress = Math.max(control.progress ?? 0, normalized);
        if (nextStatus) control.status = nextStatus;
      }
      setLoadProgress((current) => Math.max(current, normalized));
      if (nextStatus) setLoadStatus(nextStatus);
    },
    [control],
  );

  const updateError = useCallback(
    (message: string | null) => {
      if (control) control.error = message;
      setLoadError(message);
    },
    [control],
  );

  const updateReady = useCallback(
    (nextReady: boolean) => {
      if (control) control.ready = nextReady;
      setCanLaunch(nextReady);
      if (nextReady) {
        updateProgress(1, "ARENA READY");
        updateError(null);
      }
    },
    [control, updateError, updateProgress],
  );

  const handleLaunch = useCallback(() => {
    if (launchedRef.current) return;
    if (loadError) {
      control?.retry?.();
      return;
    }
    if (!canLaunch) {
      if (control) control.requested = true;
      setEntryQueued(true);
      return;
    }
    if (control) {
      control.requested = false;
      control.markCompleted?.();
    }
    setEntryQueued(false);
    launchedRef.current = true;
    setPhase("accelerate");
  }, [canLaunch, control, loadError]);

  const handleBackgroundExitComplete = useCallback(() => {
    if (sceneLaunchRef.current) return;
    sceneLaunchRef.current = true;
    performance.mark?.("enterprize:assemble-requested");
    onLaunch();
    setPhase("fade");
    doneTimerRef.current = window.setTimeout(onDone, FADE_MS + 60);
  }, [onDone, onLaunch]);

  const requestEntry = useCallback(() => {
    if (phase !== "typing" || navigationRef.current) return;
    if (!done) {
      finish();
    }
    handleLaunch();
  }, [done, finish, handleLaunch, phase]);

  const handleOpenArchive = useCallback(() => {
    if (navigationRef.current || launchedRef.current) return;
    navigationRef.current = true;
    control?.markCompleted?.();
    if (!done) {
      finish();
      onTypingDone?.();
    }
    setPhase("fade");
    void Promise.resolve(control?.openArchive?.("#archive-hero"));
    doneTimerRef.current = window.setTimeout(onDone, FADE_MS + 60);
  }, [control, done, finish, onDone, onTypingDone]);

  useEffect(() => {
    if (phase !== "typing") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("a, button, input, select, textarea")) return;
      event.preventDefault();
      requestEntry();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      if (event.deltaY <= 0) {
        wheelAccumRef.current = 0;
        return;
      }
      event.preventDefault();
      wheelAccumRef.current += event.deltaY;
      if (wheelAccumRef.current >= 56) {
        wheelAccumRef.current = 0;
        requestEntry();
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      touchStartYRef.current =
        event.touches.length === 1 ? event.touches[0].clientY : null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const startY = touchStartYRef.current;
      touchStartYRef.current = null;
      const endY = event.changedTouches[0]?.clientY;
      if (startY !== null && endY !== undefined && startY - endY >= 56) {
        requestEntry();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      wheelAccumRef.current = 0;
      touchStartYRef.current = null;
    };
  }, [phase, requestEntry]);

  useEffect(() => {
    if (control) {
      control.ready = canLaunch;
      control.setReady = updateReady;
      control.setProgress = updateProgress;
      control.setError = updateError;
      control.launch = handleLaunch;
      updateProgress(control.progress ?? 0, control.status);
      if (control.error) updateError(control.error);
      if (canLaunch && control.requested) {
        control.requested = false;
        handleLaunch();
      }
    }
  }, [
    canLaunch,
    control,
    handleLaunch,
    updateError,
    updateProgress,
    updateReady,
  ]);

  const loadPercent = Math.round(loadProgress * 100);
  const ctaTitle = loadError
    ? "RELOAD ARENA"
    : canLaunch
      ? "ENTER THE ARENA"
      : entryQueued
        ? "ENTRY QUEUED"
        : `PREPARING ${String(loadPercent).padStart(2, "0")}%`;
  const ctaDetail = loadError
    ? "INITIALIZATION INTERRUPTED"
    : canLaunch
      ? "BEGIN EXPLORE SEQUENCE"
      : entryQueued
        ? "LAUNCHING WHEN READY"
        : loadStatus;
  const completionCopyVisible = completionStage !== "hidden";
  const completionCtaVisible =
    completionStage === "cta" || completionStage === "ready";
  const completionCtaInteractive = completionStage === "ready";

  return (
    <motion.div
      className="fixed inset-0 z-[1000] select-none overflow-hidden"
      style={{ background: "#05070d" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "fade" ? 0 : 1 }}
      transition={{ duration: phase === "fade" ? FADE_MS / 1000 : 0.8, ease: "easeOut" }}
      onClick={() => {
        if (phase === "typing" && !done) finish();
      }}
    >
      <SpaceBackground
        accelerating={phase === "accelerate"}
        onAccelerationComplete={handleBackgroundExitComplete}
      />
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, #ff2d4d 30%, #2e9bff 70%, transparent)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, #2e9bff 30%, #ff2d4d 70%, transparent)",
        }}
      />
      <p className="absolute inset-x-0 top-8 text-center text-[11px] tracking-[0.28em] text-white/35 [font-family:var(--archive-font-en)] sm:tracking-[0.5em]">
        HKUST ROBOMASTER · SINCE 2015
      </p>

      <motion.nav
        aria-label="引导页快速入口"
        className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+4.5rem)] z-30 flex items-center gap-3 sm:top-[calc(env(safe-area-inset-top)+1.25rem)]"
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
        animate={{ opacity: phase === "typing" ? 1 : 0, y: 0 }}
        transition={{ duration: reducedMotion ? 0.2 : 0.55, delay: 0.1 }}
        onClick={(event) => event.stopPropagation()}
      >
        <a
          href="#archive-hero"
          data-intro-archive
          onClick={(event) => {
            event.preventDefault();
            handleOpenArchive();
          }}
          className="intro-outline-link"
        >
          <span className="intro-outline-link__inner">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            2D 介绍
          </span>
        </a>
        <a
          href="/open-source.html"
          data-intro-open-source
          onClick={() => control?.markCompleted?.()}
          className="intro-outline-link"
        >
          <span className="intro-outline-link__inner">
            <Archive className="h-4 w-4" aria-hidden="true" />
            开源档案
          </span>
        </a>
      </motion.nav>

      <motion.div
        data-intro-completion-stage={completionStage}
        className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center [font-family:var(--archive-font-en)]"
        animate={phase === "typing" ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 }}
        transition={{ duration: 0.5, ease: "easeIn" }}
      >
        {/* 打字入场: 红线自左缘、蓝线自右缘延伸到屏幕中间, 端点带平行四边形帽 */}
        <motion.div
          className="pointer-events-none absolute left-0 top-[31%] h-px w-1/2 origin-left"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,45,77,0.9) 35%, #ff2d4d)",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2.4, ease: "easeInOut", delay: 0.15 }}
        />
        <motion.div
          className="pointer-events-none absolute right-0 top-[69%] h-px w-1/2 origin-right"
          style={{
            background:
              "linear-gradient(270deg, transparent, rgba(46,155,255,0.9) 35%, #2e9bff)",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2.4, ease: "easeInOut", delay: 0.15 }}
        />
        <motion.div
          className="pointer-events-none absolute left-1/2 top-[31%] h-[7px] w-[22px] -translate-y-1/2"
          style={{ background: "#ff2d4d", transform: "skewX(-16deg)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5, duration: 0.3 }}
        />
        <motion.div
          className="pointer-events-none absolute right-1/2 top-[69%] h-[7px] w-[22px] translate-y-1/2"
          style={{ background: "#2e9bff", transform: "skewX(-16deg)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5, duration: 0.3 }}
        />

        {/* 框沿装饰: 红蓝细折线 (左上红 / 右下蓝) */}
        <svg
          className="pointer-events-none absolute left-0 top-[13%] h-[26px] w-[min(38vw,520px)]"
          viewBox="0 0 520 26"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points="0,13 150,13 166,3 330,3 346,13 520,13"
            fill="none"
            stroke="#ff2d4d"
            strokeWidth="1.2"
            opacity="0.55"
          />
        </svg>
        <svg
          className="pointer-events-none absolute bottom-[13%] right-0 h-[26px] w-[min(38vw,520px)]"
          viewBox="0 0 520 26"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points="0,13 174,13 190,23 354,23 370,13 520,13"
            fill="none"
            stroke="#2e9bff"
            strokeWidth="1.2"
            opacity="0.55"
          />
        </svg>

        {/* 框沿装饰: 135deg 科技感斜线块 (右上蓝 / 左下红) + 角落平行四边形 */}
        <div
          className="pointer-events-none absolute right-0 top-0 h-[120px] w-[min(30vw,300px)] opacity-25"
          style={{
            background:
              "repeating-linear-gradient(135deg, rgba(127,212,255,0.55) 0 1px, transparent 1px 14px)",
            maskImage:
              "linear-gradient(to bottom left, black 30%, transparent 75%)",
            WebkitMaskImage:
              "linear-gradient(to bottom left, black 30%, transparent 75%)",
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-[120px] w-[min(30vw,300px)] opacity-25"
          style={{
            background:
              "repeating-linear-gradient(135deg, rgba(255,45,77,0.55) 0 1px, transparent 1px 14px)",
            maskImage:
              "linear-gradient(to top right, black 30%, transparent 75%)",
            WebkitMaskImage:
              "linear-gradient(to top right, black 30%, transparent 75%)",
          }}
        />
        <div
          className="pointer-events-none absolute left-[6%] top-[13%] h-[10px] w-[34px] opacity-60"
          style={{ background: "#ff2d4d", transform: "skewX(-16deg)" }}
        />
        <div
          className="pointer-events-none absolute bottom-[13%] right-[6%] h-[10px] w-[34px] opacity-60"
          style={{ background: "#2e9bff", transform: "skewX(-16deg)" }}
        />

        <motion.div
          data-intro-typed-copy
          layout="position"
          layoutDependency={done}
          transition={{
            layout: reducedMotion
              ? { duration: 0 }
              : {
                  duration: COMPLETION_LAYOUT_MS / 1000,
                  ease: [0.4, 0, 0.2, 1],
                },
          }}
          onLayoutAnimationComplete={revealCompletionCopy}
          className="relative flex w-full max-w-full flex-col items-center"
        >
          <TypedLines progress={progress} />
          <span
            aria-hidden="true"
            className={`absolute left-1/2 top-full mt-2 h-[1.2em] w-[2px] -translate-x-1/2 bg-white/80 transition-opacity duration-150 ${
              done ? "opacity-0" : "animate-pulse opacity-100"
            }`}
          />
        </motion.div>

        {done && phase === "typing" && (
          <>
            {/* 队名由来中文段落 */}
            <motion.p
              data-intro-origin-copy
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
              animate={
                completionCopyVisible
                  ? { opacity: 1, y: 0 }
                  : reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 14 }
              }
              transition={{
                duration: reducedMotion
                  ? REDUCED_COPY_MS / 1000
                  : COMPLETION_COPY_MS / 1000,
                ease: "easeOut",
              }}
              onAnimationComplete={() => {
                if (completionStage === "copy") revealCompletionCta();
              }}
              aria-hidden={!completionCopyVisible}
              className="mt-9 max-w-[44em] text-[clamp(13px,1.3vw,17px)] leading-[1.9] text-[#b8c2cf] [font-family:var(--archive-font-cn)]"
            >
              队名取自《星际迷航》的星舰 Enterprise。我们不只眺望远方，而是亲手造出抵达那里的机器。在这里，你会和队友一起设计、制造、调试真正的机器人，把图纸上的方案送上赛场。
            </motion.p>

            {/* 入场 CTA: 单一动作, 避免中文口号和按钮命令互相抢占。 */}
            <motion.div
              data-intro-cta-wrap
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
              animate={
                completionCtaVisible
                  ? { opacity: 1, y: 0 }
                  : reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 18 }
              }
              transition={{
                duration: reducedMotion ? 0.22 : 0.45,
                ease: "easeOut",
              }}
              onAnimationComplete={() => {
                if (completionStage === "cta") enableCompletionCta();
              }}
              whileHover={
                !reducedMotion && completionCtaInteractive
                  ? { y: -2 }
                  : undefined
              }
              whileTap={
                !reducedMotion && completionCtaInteractive
                  ? { y: 1 }
                  : undefined
              }
              aria-hidden={!completionCtaVisible}
              className={`relative mt-12 w-[min(88vw,760px)] md:mt-[3.75rem] ${
                completionCtaInteractive
                  ? "pointer-events-auto"
                  : "pointer-events-none"
              }`}
            >
              {/* 蓝色错位衬底平行四边形 */}
              <div
                className="pointer-events-none absolute inset-0 translate-x-[10px] translate-y-[8px] opacity-70"
                style={{
                  background: "rgba(46,155,255,0.35)",
                  transform: "translate(10px, 8px) skewX(-16deg)",
                }}
              />
              <button
                type="button"
                data-intro-cta
                disabled={!completionCtaInteractive}
                tabIndex={completionCtaInteractive ? 0 : -1}
                aria-busy={!canLaunch && !loadError}
                onClick={(e) => {
                  e.stopPropagation();
                  handleLaunch();
                }}
                className="group relative min-h-[72px] w-full cursor-pointer overflow-hidden px-8 py-5 outline-none focus-visible:ring-2 focus-visible:ring-[#cfe4ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070d] sm:px-12 md:min-h-[84px] md:px-20 md:py-6"
                style={{
                  background: loadError
                    ? "linear-gradient(120deg, #9f1f35, #5b1725)"
                    : "rgba(8,13,22,0.96)",
                  transform: "skewX(-16deg)",
                  boxShadow: canLaunch || loadError
                    ? "0 10px 24px rgba(255,45,77,0.24)"
                    : "0 8px 20px rgba(0,0,0,0.28)",
                }}
              >
                {!loadError && (
                  <span
                    role="progressbar"
                    aria-label="赛场准备进度"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={loadPercent}
                    className="pointer-events-none absolute inset-y-0 left-0 origin-left bg-gradient-to-r from-[#a91732] via-[#d81f3e] to-[#ff2d4d] transition-[width] duration-300 ease-out"
                    style={{ width: `${loadPercent}%` }}
                  />
                )}
                <span
                  className="relative z-10 flex items-center justify-center gap-3 whitespace-nowrap md:gap-5"
                  style={{ transform: "skewX(16deg)" }}
                >
                  <span className="text-base font-bold tracking-[0.16em] text-white [font-family:var(--archive-font-en)] sm:text-xl md:text-2xl md:tracking-[0.2em]">
                    {ctaTitle}
                  </span>
                  <span
                    aria-live="polite"
                    className="hidden max-w-[19em] text-[10px] tracking-[0.2em] text-white/75 [font-family:var(--archive-font-en)] md:inline"
                  >
                    {ctaDetail}
                  </span>
                  <ArrowRight
                    className={`h-5 w-5 text-white transition-transform duration-300 md:h-6 md:w-6 ${
                      canLaunch || loadError ? "group-hover:translate-x-1" : "opacity-55"
                    }`}
                  />
                </span>
              </button>
            </motion.div>
            <motion.p
              data-intro-mobile-hint
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
              animate={
                completionCtaVisible
                  ? { opacity: 1, y: 0 }
                  : reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 18 }
              }
              transition={{
                duration: reducedMotion ? 0.22 : 0.45,
                ease: "easeOut",
                delay: reducedMotion ? 0.08 : 0.16,
              }}
              aria-hidden={!completionCtaVisible}
              className="mt-14 hidden max-w-[24em] text-[11px] leading-5 text-[#9ca8b8] [font-family:var(--archive-font-cn)] pointer-coarse:block"
            >
              向上滑动进入<br />更好体验见桌面版
            </motion.p>
          </>
        )}
      </motion.div>

    </motion.div>
  );
}
