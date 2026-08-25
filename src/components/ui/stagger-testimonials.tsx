"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Quote } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StaggerTestimonial {
  quote: string;
  author: string;
  role: string;
  initials?: string;
}

export interface StaggerTestimonialsProps {
  testimonials: readonly StaggerTestimonial[];
  /** Column count at the lg breakpoint; sm uses 2, base uses 1. */
  columns?: 2 | 3 | 4;
  /** Vertical offset class applied per column index to create the stagger. */
  columnOffsets?: readonly string[];
  className?: string;
  columnClassName?: string;
  cardClassName?: string;
}

const COLUMN_GRID: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

const DEFAULT_OFFSETS: readonly string[] = [
  "lg:mt-0",
  "lg:mt-16",
  "lg:mt-8",
  "lg:mt-24",
];

function initialsOf(author: string) {
  const latin = author.match(/[A-Za-z]/g);
  if (latin && latin.length >= 2) return (latin[0] + latin[1]).toUpperCase();
  return author.slice(0, 1);
}

export function StaggerTestimonials({
  testimonials,
  columns = 3,
  columnOffsets = DEFAULT_OFFSETS,
  className,
  columnClassName,
  cardClassName,
}: StaggerTestimonialsProps) {
  const reduceMotion = useReducedMotion();

  const buckets = React.useMemo(() => {
    const result: StaggerTestimonial[][] = Array.from(
      { length: columns },
      () => [],
    );
    testimonials.forEach((item, index) => {
      result[index % columns].push(item);
    });
    return result;
  }, [testimonials, columns]);

  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-6 sm:gap-7",
        COLUMN_GRID[columns],
        className,
      )}
    >
      {buckets.map((bucket, columnIndex) => (
        <div
          className={cn(
            "flex flex-col gap-6 sm:gap-7",
            columnOffsets[columnIndex % columnOffsets.length],
            columnClassName,
          )}
          key={columnIndex}
        >
          {bucket.map((item, itemIndex) => (
            <motion.figure
              className={cn(
                "group relative overflow-hidden rounded-lg border border-border bg-card p-6 text-card-foreground shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-[0_28px_70px_rgba(0,0,0,0.5)] md:p-7",
                cardClassName,
              )}
              initial={reduceMotion ? false : { opacity: 0, y: 36 }}
              key={`${item.author}-${itemIndex}`}
              transition={{
                duration: 0.55,
                delay: reduceMotion ? 0 : (columnIndex + itemIndex) * 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
              viewport={{ once: true, margin: "-60px" }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-secondary/50 to-transparent"
              />
              <Quote
                aria-hidden="true"
                className="mb-4 text-primary transition-colors duration-300 group-hover:text-accent"
                size={22}
                strokeWidth={1.8}
              />
              <blockquote className="text-sm leading-7 text-card-foreground/95 md:text-[15px] md:leading-8">
                {item.quote}
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 font-[Audiowide] text-xs text-primary"
                >
                  {item.initials ?? initialsOf(item.author)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {item.author}
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    {item.role}
                  </span>
                </span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      ))}
    </div>
  );
}

export default StaggerTestimonials;
