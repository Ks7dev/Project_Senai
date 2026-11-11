"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A carousel slide. */
export type CarouselSlide = {
  id: string
  eyebrow?: string
  title: string
  subtitle?: string
  ctaLabel?: string
  ctaHref?: string
  imageKey?: string
  imageAlt?: string
}

const INTERVAL_MS = 7000

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

/**
 * Subscribes to the reduced motion preference.
 *
 * @param onChange - Called when the preference changes.
 * @returns Unsubscribe function.
 */
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/**
 * Whether the user asked the system for reduced motion. On the server
 * it assumes yes, so nothing auto-plays before hydration.
 *
 * @returns True when animations should be avoided.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true
  )
}

/**
 * Accessible editorial carousel (RF47, RNF13): pause/play button,
 * previous/next buttons, arrow keys, slide picker, no autoplay when
 * the user prefers reduced motion, and announcements only while
 * paused (WAI-ARIA carousel pattern).
 *
 * @param props - Slides to show.
 * @returns The carousel.
 */
export function HeroCarousel({ slides }: { slides: CarouselSlide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const count = slides.length
  const playing = count > 1 && !paused && !reducedMotion
  const setPlaying = (value: boolean) => setPaused(!value)

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count]
  )

  useEffect(() => {
    if (!playing || count < 2) return
    const timer = window.setInterval(() => go(index + 1), INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [playing, index, count, go])

  if (count === 0) return null
  const slide = slides[index]

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques"
      className="relative overflow-hidden rounded-lg bg-subtle"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1)
        if (event.key === "ArrowLeft") go(index - 1)
      }}
      onFocus={() => setPlaying(false)}
    >
      <div
        aria-live={playing ? "off" : "polite"}
        className="grid min-h-[22rem] lg:min-h-[32rem] lg:grid-cols-2"
      >
        <div
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} de ${count}`}
          className="flex flex-col justify-center gap-md p-lg lg:p-2xl"
        >
          {slide.eyebrow && (
            <p className="text-caps text-clay uppercase">{slide.eyebrow}</p>
          )}
          <h2 className="text-display-mobile lg:text-display">{slide.title}</h2>
          {slide.subtitle && (
            <p className="max-w-lg text-body-lg text-ink-muted">
              {slide.subtitle}
            </p>
          )}
          {slide.ctaLabel && slide.ctaHref && (
            <Link
              href={slide.ctaHref}
              className={cn(buttonVariants({ size: "lg" }), "self-start")}
            >
              {slide.ctaLabel}
            </Link>
          )}
        </div>
        {slide.imageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/media/${slide.imageKey}-1024.webp`}
            srcSet={`/media/${slide.imageKey}-640.webp 640w, /media/${slide.imageKey}-1024.webp 1024w, /media/${slide.imageKey}-1600.webp 1600w`}
            sizes="(min-width: 1200px) 50vw, 100vw"
            alt={slide.imageAlt ?? ""}
            className="h-64 w-full object-cover lg:h-full"
          />
        ) : (
          <div aria-hidden className="hidden bg-primary-tint lg:block" />
        )}
      </div>

      {count > 1 && (
        <div className="flex flex-wrap items-center gap-sm border-t border-line-subtle bg-canvas/80 px-md py-sm">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? "Pausar carrossel" : "Iniciar carrossel"}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => go(index - 1)}
            aria-label="Slide anterior"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => go(index + 1)}
            aria-label="Próximo slide"
          >
            <ChevronRightIcon />
          </Button>
          <ul className="ml-auto flex gap-xs" aria-label="Escolher slide">
            {slides.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Ir para o slide ${i + 1}: ${item.title}`}
                  aria-current={i === index ? "true" : undefined}
                  className={cn(
                    "size-3 rounded-full border border-primary",
                    i === index ? "bg-primary" : "bg-transparent"
                  )}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
