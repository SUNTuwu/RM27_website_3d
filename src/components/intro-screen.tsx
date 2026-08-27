"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

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
const LAUNCH_AT = 0.8;
const FADE_MS = 700;

function WarpCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.hypot(cx, cy);

    const COLORS = [
      { c: "207,228,255", w: 0.7 },
      { c: "255,45,77", w: 0.12 },
      { c: "46,155,255", w: 0.18 },
    ];
    const pickColor = () => {
      const roll = Math.random();
      let acc = 0;
      for (const color of COLORS) {
        acc += color.w;
        if (roll <= acc) return color.c;
      }
      return COLORS[0].c;
    };
    const stars = Array.from({ length: 420 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 24 + Math.random() * maxR * 0.55,
      s: 0.5 + Math.random(),
      c: pickColor(),
    }));

    const duration = REDUCED() ? 450 : WARP_MS;
    const t0 = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const k = Math.min((now - t0) / duration, 1);
      const warp = 1 + k * k * 46;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const star of stars) {
        const prevR = star.r;
        star.r += star.s * warp * dpr;
        if (star.r > maxR) {
          star.r = 16 + Math.random() * 60;
          star.a = Math.random() * Math.PI * 2;
          continue;
        }
        const alpha = Math.min(0.25 + k * 0.75, 1);
        ctx.strokeStyle = `rgba(${star.c},${alpha})`;
        ctx.lineWidth = Math.min(0.8 + (star.r / maxR) * 2.4, 3) * dpr;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(star.a) * prevR, cy + Math.sin(star.a) * prevR);
        ctx.lineTo(cx + Math.cos(star.a) * star.r, cy + Math.sin(star.a) * star.r);
        ctx.stroke();
      }
      if (k < 1) {
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

function useTypewriter(active: boolean) {
  const [progress, setProgress] = useState(0);
  const totalChars = LINES.flat().reduce((n, s) => n + s.text.length, 0);
  const done = progress >= totalChars;

  const finish = useCallback(() => setProgress(totalChars), [totalChars]);

  useEffect(() => {
    if (!active) return;
    if (REDUCED()) {
      setProgress(totalChars);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const flat = LINES.flat();
    const step = (count: number) => {
      if (cancelled) return;
      if (count >= totalChars) {
        setProgress(totalChars);
        return;
      }
      let acc = 0;
      let pause = CHAR_MS;
      for (const seg of flat) {
        acc += seg.text.length;
        if (count === acc) {
          pause = LINE_PAUSE_MS;
          break;
        }
      }
      timer = setTimeout(() => {
        if (cancelled) return;
        setProgress(count + 1);
        step(count + 1);
      }, pause);
    };
    step(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
};

export function IntroScreen({
  onLaunch,
  onDone,
  control,
  ready = true,
}: {
  onLaunch: () => void;
  onDone: () => void;
  control?: IntroControl;
  ready?: boolean;
}) {
  const [phase, setPhase] = useState<"typing" | "warp" | "fade">("typing");
  const [canLaunch, setCanLaunch] = useState(ready);
  const { progress, done, finish } = useTypewriter(phase === "typing");
  const launchedRef = useRef(false);
  const reducedMotion = REDUCED();

  useEffect(() => {
    setCanLaunch(ready);
  }, [ready]);

  const updateReady = useCallback(
    (nextReady: boolean) => {
      if (control) {
        control.ready = nextReady;
      }
      setCanLaunch(nextReady);
    },
    [control],
  );

  const handleLaunch = useCallback(() => {
    if (launchedRef.current) return;
    if (!canLaunch) {
      if (control) {
        control.requested = true;
      }
      return;
    }
    if (control) {
      control.requested = false;
    }
    launchedRef.current = true;
    setPhase("warp");
    const duration = REDUCED() ? 450 : WARP_MS;
    window.setTimeout(() => onLaunch(), duration * LAUNCH_AT);
    window.setTimeout(() => setPhase("fade"), duration);
    window.setTimeout(() => onDone(), duration + FADE_MS + 60);
  }, [canLaunch, control, onLaunch, onDone]);

  useEffect(() => {
    if (control) {
      control.ready = canLaunch;
      control.setReady = updateReady;
      control.launch = handleLaunch;
      if (canLaunch && control.requested) {
        control.requested = false;
        handleLaunch();
      }
    }
  }, [canLaunch, control, handleLaunch, updateReady]);

  return (
    <motion.div
      className="fixed inset-0 z-[1000] select-none overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 70% at 50% 42%, rgba(46,155,255,0.06) 0%, rgba(46,155,255,0) 68%), #05070d",
      }}
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
        HKUST ROBOMASTER · EST. 2015
      </p>

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
              className="mt-9 max-w-[44em] text-[clamp(13px,1.3vw,17px)] leading-[1.9] text-white/70 [font-family:var(--archive-font-cn)]"
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
              className="relative mt-16 md:mt-20"
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
                disabled={!canLaunch}
                aria-busy={!canLaunch}
                onClick={(e) => {
                  e.stopPropagation();
                  handleLaunch();
                }}
                className={`group relative px-8 py-4 outline-none transition-opacity duration-300 focus-visible:ring-2 focus-visible:ring-[#cfe4ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070d] disabled:cursor-wait md:px-12 md:py-5 ${
                  canLaunch ? "cursor-pointer" : "opacity-70"
                }`}
                style={{
                  background: canLaunch
                    ? "linear-gradient(120deg, #ff2d4d, #d81f3e)"
                    : "linear-gradient(120deg, rgba(46,155,255,0.42), rgba(80,98,132,0.55))",
                  transform: "skewX(-16deg)",
                  boxShadow: canLaunch
                    ? "0 10px 24px rgba(255,45,77,0.24)"
                    : "0 8px 20px rgba(46,155,255,0.12)",
                }}
              >
                <span
                  className="flex items-center gap-3 whitespace-nowrap md:gap-5"
                  style={{ transform: "skewX(16deg)" }}
                >
                  <span className="text-xl font-bold tracking-[0.16em] text-white [font-family:var(--archive-font-en)] md:text-2xl md:tracking-[0.2em]">
                    {canLaunch ? "ENTER THE ARENA" : "PREPARING ARENA"}
                  </span>
                  <span className="hidden text-[10px] tracking-[0.28em] text-white/70 [font-family:var(--archive-font-en)] md:inline">
                    {canLaunch ? "BEGIN EXPLORE SEQUENCE" : "COMPILING POINT CLOUD"}
                  </span>
                  <ArrowRight
                    className={`h-5 w-5 text-white transition-transform duration-300 md:h-6 md:w-6 ${
                      canLaunch ? "group-hover:translate-x-1" : "opacity-40"
                    }`}
                  />
                </span>
              </button>
            </motion.div>
            <p className="mt-8 hidden text-[11px] tracking-[0.35em] text-white/40 [font-family:var(--archive-font-cn)] pointer-coarse:block">
              竖向滑动即可探索 · 更好体验见桌面版
            </p>
          </>
        )}
      </motion.div>

      {phase !== "typing" && <WarpCanvas />}
    </motion.div>
  );
}
