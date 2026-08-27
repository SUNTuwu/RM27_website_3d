"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Camera,
  Check,
  CodeXml,
  Copy,
  Mail,
  MessageCircle,
  QrCode,
  Tv,
  type LucideIcon,
} from "lucide-react";

import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

type Channel = {
  label: string;
  value: string;
  icon: LucideIcon;
} &
  (
    | { kind: "link"; href: string; action: string }
    | { kind: "copy"; copyText: string }
    | { kind: "static"; action: string }
  );

const CHANNELS: readonly Channel[] = [
  {
    kind: "copy",
    label: "QQ 招新群",
    value: "581184202",
    copyText: "581184202",
    icon: MessageCircle,
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

  const body = (
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
      {channel.kind === "copy" ? (
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
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
      )}
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
        ) : (
          <div className={cardClass} data-channel-card>{body}</div>
        )}
      </div>
    </motion.li>
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
