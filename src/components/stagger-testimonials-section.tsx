"use client";

import {
  StaggerTestimonials,
  type StaggerTestimonial,
} from "@/components/ui/stagger-testimonials";

const ENTERPRIZE_VOICES: readonly StaggerTestimonial[] = [
  {
    quote:
      "从 FRC 到 RM,我不断追寻所谓的胜利，却逐渐发现比赛带给我的远不止胜负。我依然想继续下去——有志同道合的队友，有未了的执念，也有值得为之奋斗的理想。",
    author: "苏疆懿 SJY",
    role: "25赛季英雄机械负责人 · 26赛季机械组长",
  },
  {
    quote:
      "我们就像现实版的《西游记》：各有所长，为同一个目标并肩前行。接受不完美，依然选择共同前行——妖怪永远打不完，但真经就始终在前方。",
    author: "贺天伦 圆科长",
    role: "24赛季哨兵机械 · 25赛季平衡步兵机械",
  },
  {
    quote:
      "造一台很酷的机器人，是很浪漫的一件事。所谓‘基础’并不重要——只要你热爱这个比赛，或者对机器人开发有浓厚兴趣，我们都期待你的加入！",
    author: "许钜森 许神",
    role: "24赛季哨兵机械 · 25赛季舵轮步兵机械",
  },
] as const;

export function StaggerTestimonialsSection() {
  return (
    <div aria-label="队员心声" className="py-4 md:py-8" role="group">
      <StaggerTestimonials columns={3} testimonials={ENTERPRIZE_VOICES} />
    </div>
  );
}
