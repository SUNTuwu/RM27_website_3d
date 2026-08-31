"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Camera,
  Check,
  CodeXml,
  Copy,
  Mail,
  QrCode,
  Tv,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

const WECHAT_GROUP_QR_SRC = "/assets/images/wx/qrcode.webp";

type Channel = {
  label: string;
  value: string;
  icon: LucideIcon;
} &
  (
    | { kind: "link"; href: string; action: string }
    | { kind: "copy"; copyText: string }
    | { kind: "static"; action: string }
    | { kind: "qr"; action: string; qrSrc: string; qrAlt: string }
  );

const CHANNELS: readonly Channel[] = [
  {
    kind: "qr",
    label: "微信招新群",
    value: "扫码加入 RM2027 招新群",
    action: "VIEW QR",
    qrSrc: WECHAT_GROUP_QR_SRC,
    qrAlt: "RM2027 微信招新群二维码",
    icon: Users,
  },
  {
    kind: "link",
    label: "EMAIL",
    value: "robomasterhkust@gmail.com",
    href: "mailto:robomasterhkust@gmail.com?subject=RM2027%20%E6%8B%9B%E6%96%B0%E5%92%A8%E8%AF%A2",
    action: "WRITE",
    icon: Mail,
  },
  {
    kind: "static",
    label: "微信公众号",
    value: "HKUST ENTERPRIZE",
    action: "FOLLOW",
    icon: QrCode,
  },
  {
    kind: "link",
    label: "BILIBILI",
    value: "港科大ENTERPRIZE战队",
    href: "https://space.bilibili.com/634988052",
    action: "WATCH",
    icon: Tv,
  },
  {
    kind: "link",
    label: "GITHUB",
    value: "hkustenterprize",
    href: "https://github.com/hkustenterprize",
    action: "STAR",
    icon: CodeXml,
  },
  {
    kind: "link",
    label: "INSTAGRAM",
    value: "@hkust_enterprize_robomaster",
    href: "https://www.instagram.com/hkust_enterprize_robomaster/",
    action: "FOLLOW",
    icon: Camera,
  },
];

const pillClass = cn(
  "mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-4 py-1.5",
  "[font-family:var(--archive-font-en)] text-[11px] tracking-[0.2em] text-[#7fd4ff]",
  "transition-colors duration-200",
  "group-hover:border-[#ff2d4d] group-hover:bg-[#ff2d4d] group-hover:text-white",
);

function ChannelCard({ channel, index }: { channel: Channel; index: number }) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const Icon = channel.icon;

  const handleCopy = async () => {
    if (channel.kind !== "copy") return;
    try {
      await navigator.clipboard.writeText(channel.copyText);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = channel.copyText;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const pill =
    channel.kind === "copy" ? (
      <button type="button" onClick={handleCopy} className={cn(pillClass, "cursor-pointer")}>
        {copied ? (
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
        {copied ? "COPIED" : "COPY"}
      </button>
    ) : (
      <span className={pillClass}>
        {channel.action}
        {channel.kind === "qr" ? (
          <QrCode className="h-3.5 w-3.5" strokeWidth={1.75} />
        ) : (
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </span>
    );

  const body =
    channel.kind === "qr" ? (
      <span className="flex items-stretch justify-between gap-4">
        <span className="flex min-w-0 flex-col gap-2.5">
          <span className="flex items-center justify-between gap-3">
            <span className="[font-family:var(--archive-font-en)] text-[11px] tracking-[0.2em] text-muted-foreground">
              {channel.label}
            </span>
            <Icon
              className="h-4 w-4 shrink-0 text-muted-foreground/70"
              strokeWidth={1.75}
            />
          </span>
          <b className="text-lg font-bold leading-snug text-foreground [overflow-wrap:anywhere]">
            {channel.value}
          </b>
          {pill}
        </span>
        <img
          src={channel.qrSrc}
          alt={channel.qrAlt}
          loading="lazy"
          decoding="async"
          className="h-24 w-24 shrink-0 self-center rounded-lg border border-border/60 bg-white object-contain p-1.5 sm:h-28 sm:w-28"
        />
      </span>
    ) : (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="[font-family:var(--archive-font-en)] text-[11px] tracking-[0.2em] text-muted-foreground">
          {channel.label}
        </span>
        <Icon
          className="h-4 w-4 shrink-0 text-muted-foreground/70"
          strokeWidth={1.75}
        />
      </div>
      <b className="text-lg font-bold leading-snug text-foreground [overflow-wrap:anywhere]">
        {channel.value}
      </b>
      {pill}
    </>
  );

  const cardClass = cn(
    "group relative flex h-full flex-col gap-2.5 rounded-xl bg-card/40 p-7 backdrop-blur-sm sm:p-8",
    "transition-transform duration-300 hover:-translate-y-1",
  );

  return (
    <motion.li
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.55,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="list-none"
    >
      <div
        className="relative h-full rounded-2xl border border-border/50 p-2"
        data-channel-frame
      >
        <GlowingEffect
          spread={40}
          glow
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={2}
          movementDuration={1.2}
        />
        {channel.kind === "link" ? (
          <a
            href={channel.href}
            target={channel.href.startsWith("mailto:") ? undefined : "_blank"}
            rel={channel.href.startsWith("mailto:") ? undefined : "noopener"}
            className={cn(cardClass, "no-underline")}
            data-channel-card
          >
            {body}
          </a>
        ) : channel.kind === "qr" ? (
          <>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              aria-haspopup="dialog"
              aria-label={`${channel.label}：点开查看二维码`}
              className={cn(cardClass, "w-full cursor-pointer text-left")}
              data-channel-card
            >
              {body}
            </button>
            <QrLightbox
              open={qrOpen}
              onClose={() => setQrOpen(false)}
              src={channel.qrSrc}
              alt={channel.qrAlt}
            />
          </>
        ) : (
          <div className={cardClass} data-channel-card>{body}</div>
        )}
      </div>
    </motion.li>
  );
}

function QrLightbox({
  open,
  onClose,
  src,
  alt,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // 注意: 不要用 is-scroll-locked 锁背景滚动 —— 该锁会让 html 高度塌缩、
  // scrollY 归零, 触发 2D→3D 返场, 浮层背景会从招新档案跳回 3D 赛场
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[300] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="关闭二维码浮层"
            onClick={onClose}
            className="absolute inset-0 cursor-zoom-out bg-black/75 backdrop-blur-sm"
          />
          <motion.figure
            className="relative m-0 flex flex-col items-center gap-4"
            initial={{ opacity: 0, scale: 0.92, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="[font-family:var(--archive-font-en)] text-[11px] tracking-[0.25em] text-[#7fd4ff]">
              WECHAT GROUP
            </span>
            <img
              src={src}
              alt={alt}
              className="w-[min(72vw,320px)] rounded-xl bg-white p-3 shadow-2xl"
            />
            <figcaption className="text-sm text-white/85">
              微信扫码，加入 RM2027 招新群
            </figcaption>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="absolute -right-3 -top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/60 text-white/90 backdrop-blur transition-colors hover:bg-[#ff2d4d]"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function GlowingChannelsSection() {
  return (
    <ul className="my-12 mb-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {CHANNELS.map((channel, index) => (
        <ChannelCard key={channel.label} channel={channel} index={index} />
      ))}
    </ul>
  );
}
