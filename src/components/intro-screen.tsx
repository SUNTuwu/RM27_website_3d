"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Rocket } from "lucide-react";

// 起始界面: 打字机对话 -> 启航按钮 -> 跃迁转场 -> 点云 EXPLORE
// 跃迁时序: 星线后掠加速 -> 眩光自屏幕中心扩散 -> 白闪遮满时回调 onLaunch,
// 随后整体渐隐, 露出正在聚拢的点云。
// 装饰语言对齐 open-source 页: 红蓝细线/折线 + 斜切平行四边形 + 135deg 斜线纹理。

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Segment = { text: string; emphasis?: boolean };

const LINES: Segment[][] = [
  [
    { text: "We're " },
    { text: "ENTERPRIZE", emphasis: true },
    { text: " Team." },
  ],
  [
    {
      text: "We sail our own warship, boldly where no one has gone before.",
    },
  ],
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

    const COLORS = ["255,255,255", "127,212,255", "46,155,255", "255,45,77"];
    const stars = Array.from({ length: 420 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 24 + Math.random() * maxR * 0.55,
      s: 0.5 + Math.random(),
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
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

export type IntroControl = { launch: () => void };

export function IntroScreen({
  onLaunch,
  onDone,
  control,
}: {
  onLaunch: () => void;
  onDone: () => void;
  control?: IntroControl;
}) {
  const [phase, setPhase] = useState<"typing" | "warp" | "fade">("typing");
  const { progress, done, finish } = useTypewriter(phase === "typing");
  const launchedRef = useRef(false);

  const handleLaunch = useCallback(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    setPhase("warp");
    const duration = REDUCED() ? 450 : WARP_MS;
    window.setTimeout(() => onLaunch(), duration * LAUNCH_AT);
    window.setTimeout(() => setPhase("fade"), duration);
    window.setTimeout(() => onDone(), duration + FADE_MS + 60);
  }, [onLaunch, onDone]);

  useEffect(() => {
    if (control) {
      control.launch = handleLaunch;
    }
  }, [control, handleLaunch]);

  return (
    <motion.div
      className="fixed inset-0 z-[1000] select-none overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 70% at 50% 42%, #0b1224 0%, #05070d 68%)",
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
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.7, ease: "easeOut" }}
              className="mt-9 max-w-[44em] text-[clamp(13px,1.3vw,17px)] leading-[1.9] text-white/70 [font-family:var(--archive-font-cn)]"
            >
              队名来自《星际迷航》的星舰 Enterprise。我们要做的，是驾驶自己的战舰，勇闯前人未至之境。在这里，你将亲手设计、制造并驾驶真正的机器人，站上全国最大的大学生机器人赛场。
            </motion.p>

            {/* 启航: 红色斜切平行四边形大按钮 (open-source HUD 语言) */}
            <motion.div
              initial={{ opacity: 0, y: 26, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.45 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              className="relative mt-12"
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleLaunch();
                }}
                className="group relative cursor-pointer px-10 py-5 md:px-24 md:py-7"
                style={{
                  background: "linear-gradient(120deg, #ff2d4d, #d81f3e)",
                  transform: "skewX(-16deg)",
                  boxShadow: "0 12px 44px rgba(255,45,77,0.42)",
                }}
              >
                <span
                  className="flex items-center gap-3 whitespace-nowrap md:gap-5"
                  style={{ transform: "skewX(16deg)" }}
                >
                  <Rocket className="h-6 w-6 text-white transition-transform duration-300 group-hover:-translate-y-1 md:h-7 md:w-7" />
                  <span className="text-3xl font-bold tracking-[0.3em] text-white [font-family:var(--archive-font-cn)] md:text-5xl md:tracking-[0.35em]">
                    启航
                  </span>
                  <span className="hidden text-xs tracking-[0.4em] text-white/75 [font-family:var(--archive-font-en)] md:inline">
                    SET SAIL · EXPLORE
                  </span>
                </span>
              </button>
            </motion.div>
          </>
        )}
      </motion.div>

      {phase !== "typing" && <WarpCanvas />}

      {phase !== "typing" && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at center, rgba(255,255,255,0.9) 0%, rgba(127,212,255,0.45) 14%, rgba(46,155,255,0.12) 32%, transparent 55%)",
            mixBlendMode: "screen",
          }}
          initial={{ opacity: 0, scale: 0.1 }}
          animate={{ opacity: 0.95, scale: 2.2 }}
          transition={{
            duration: (REDUCED() ? 450 : WARP_MS) / 1000,
            ease: [0.7, 0, 0.9, 0.35],
          }}
        />
      )}

      {phase !== "typing" && (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === "fade" ? 0 : 1 }}
          transition={
            phase === "fade"
              ? { duration: FADE_MS / 1000, ease: "easeOut" }
              : {
                  delay: ((REDUCED() ? 450 : WARP_MS) * 0.74) / 1000,
                  duration: ((REDUCED() ? 450 : WARP_MS) * 0.26) / 1000,
                  ease: "easeIn",
                }
          }
        />
      )}
    </motion.div>
  );
}
