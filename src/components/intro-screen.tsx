"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ArrowRight, BookOpen } from "lucide-react";

// 起始界面: 打字机对话 -> 入场按钮 -> 星线跃迁 -> 点云 EXPLORE
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
const WARP_MS = 1700;
const FADE_MS = 700;

const WARP_COLORS = ["207,228,255", "255,45,77", "46,155,255"] as const;
const WARP_WEIGHTS = [0.7, 0.12, 0.18] as const;

function WarpCanvas({ onComplete }: { onComplete: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = window.innerWidth;
    let height = window.innerHeight;
    let maxR = Math.hypot(width / 2, height / 2);

    const resize = () => {
      width = Math.max(window.innerWidth, 1);
      height = Math.max(window.innerHeight, 1);
      maxR = Math.hypot(width / 2, height / 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const pickColorIndex = () => {
      const roll = Math.random();
      let acc = 0;
      for (let index = 0; index < WARP_WEIGHTS.length; index += 1) {
        acc += WARP_WEIGHTS[index];
        if (roll <= acc) return index;
      }
      return 0;
    };
    const starCount = width < 720 ? 180 : 300;
    const stars = Array.from({ length: starCount }, () => {
      const angle = Math.random() * Math.PI * 2;
      return {
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        radiusRatio: 0.025 + Math.random() * 0.42,
        speed: 0.78 + Math.random() * 0.55,
        colorIndex: pickColorIndex(),
      };
    });

    const groups = WARP_COLORS.map((_, colorIndex) =>
      stars.filter((star) => star.colorIndex === colorIndex),
    );
    const duration = REDUCED() ? 450 : WARP_MS;
    const startedAt = performance.now();
    let raf = 0;
    let paintRaf = 0;
    let completeRaf = 0;
    let completed = false;

    const finishAfterPaint = () => {
      if (completed) return;
      completed = true;
      performance.mark?.("enterprize:warp-center-cleared");
      // Keep the empty-centre final frame on screen for a full paint before
      // the Three scene starts its assemble transition.
      paintRaf = requestAnimationFrame(() => {
        completeRaf = requestAnimationFrame(() => onCompleteRef.current());
      });
    };

    const frame = (now: number) => {
      const k = Math.min((now - startedAt) / duration, 1);
      const travelRatio = 0.15 * k + 1.45 * k * k * k;
      const tail = maxR * (0.018 + 0.09 * k * k);
      const cx = width / 2;
      const cy = height / 2;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 0.9 + k * 1.8;

      groups.forEach((group, colorIndex) => {
        ctx.beginPath();
        for (const star of group) {
          const radius =
            maxR * (star.radiusRatio + travelRatio * star.speed);
          const previousRadius = Math.max(radius - tail * star.speed, 0);
          if (previousRadius > maxR || radius < 0) continue;
          ctx.moveTo(
            cx + star.dx * previousRadius,
            cy + star.dy * previousRadius,
          );
          ctx.lineTo(cx + star.dx * radius, cy + star.dy * radius);
        }
        ctx.strokeStyle = `rgba(${WARP_COLORS[colorIndex]},${Math.min(0.28 + k * 0.68, 0.96)})`;
        ctx.stroke();
      });

      if (k < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        finishAfterPaint();
      }
    };

    performance.mark?.("enterprize:warp-start");
    raf = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(paintRaf);
      cancelAnimationFrame(completeRaf);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
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
  const [phase, setPhase] = useState<"typing" | "warp" | "fade">("typing");
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
  const { progress, done, finish } = useTypewriter(phase === "typing");
  const launchedRef = useRef(false);
  const sceneLaunchRef = useRef(false);
  const navigationRef = useRef(false);
  const doneTimerRef = useRef(0);
  const wheelAccumRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const reducedMotion = REDUCED();

  useEffect(() => {
    setCanLaunch(ready);
  }, [ready]);

  useEffect(
    () => () => {
      window.clearTimeout(doneTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (done) {
      onTypingDone?.();
    }
  }, [done, onTypingDone]);

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
    setPhase("warp");
  }, [canLaunch, control, loadError]);

  const handleWarpComplete = useCallback(() => {
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
        className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+4.5rem)] z-30 flex items-center gap-2 sm:top-[calc(env(safe-area-inset-top)+1.25rem)] sm:gap-3"
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
          className="flex h-10 items-center gap-2 border border-white/20 bg-[#080d16]/90 px-3 text-[10px] text-[#c7d1df] outline-none transition-colors hover:border-[#7fd4ff]/70 hover:text-white focus-visible:ring-2 focus-visible:ring-[#cfe4ff] sm:h-11 sm:px-4 sm:text-[11px]"
          style={{ transform: "skewX(-12deg)" }}
        >
          <span className="flex items-center gap-2 whitespace-nowrap" style={{ transform: "skewX(12deg)" }}>
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            2D 介绍
          </span>
        </a>
        <a
          href="/open-source.html"
          data-intro-open-source
          onClick={() => control?.markCompleted?.()}
          className="flex h-10 items-center gap-2 border border-white/20 bg-[#080d16]/90 px-3 text-[10px] text-[#c7d1df] outline-none transition-colors hover:border-[#ff2d4d]/70 hover:text-white focus-visible:ring-2 focus-visible:ring-[#cfe4ff] sm:h-11 sm:px-4 sm:text-[11px]"
          style={{ transform: "skewX(-12deg)" }}
        >
          <span className="flex items-center gap-2 whitespace-nowrap" style={{ transform: "skewX(12deg)" }}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            开源档案
          </span>
        </a>
      </motion.nav>

      <motion.div
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

        <TypedLines progress={progress} />
        {!done && (
          <span className="mt-2 inline-block h-[1.2em] w-[2px] animate-pulse bg-white/80" />
        )}

        {done && phase === "typing" && (
          <>
            {/* 队名由来中文段落 */}
            <motion.p
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: reducedMotion ? 0.25 : 0.7, ease: "easeOut" }}
              className="mt-9 max-w-[44em] text-[clamp(13px,1.3vw,17px)] leading-[1.9] text-[#b8c2cf] [font-family:var(--archive-font-cn)]"
            >
              队名取自《星际迷航》的星舰 Enterprise。我们不只眺望远方，而是亲手造出抵达那里的机器。在这里，你会和队友一起设计、制造、调试真正的机器人，把图纸上的方案送上赛场。
            </motion.p>

            {/* 入场 CTA: 单一动作, 避免中文口号和按钮命令互相抢占。 */}
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0.25 : 0.55, ease: "easeOut", delay: 0.45 }}
              whileHover={reducedMotion ? undefined : { y: -2 }}
              whileTap={reducedMotion ? undefined : { y: 1 }}
              className="relative mt-24 w-[min(88vw,760px)] md:mt-[7.5rem]"
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
            <p className="mt-8 hidden max-w-[24em] text-[11px] leading-5 tracking-[0.26em] text-[#9ca8b8] [font-family:var(--archive-font-cn)] pointer-coarse:block">
              向上滑动进入<br />更好体验见桌面版
            </p>
          </>
        )}
      </motion.div>

      {phase !== "typing" && <WarpCanvas onComplete={handleWarpComplete} />}
    </motion.div>
  );
}
