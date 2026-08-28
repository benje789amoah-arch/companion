import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Whether a scroll reveal is allowed to run at all — decided once, at module
 * load, and never re-asked.
 *
 * Two reasons it is a module constant rather than state:
 *
 *  - **It must be known on the first render.** A reveal is a component that
 *    starts invisible. Deciding that after mount means rendering the content,
 *    hiding it, then fading it back in: a flash of exactly the thing the
 *    animation was supposed to introduce.
 *  - **A reveal that cannot fire must never hide anything.** `whileInView`
 *    leans on `IntersectionObserver`; where there isn't one — an old browser, a
 *    scraper, a headless renderer taking a screenshot — the observer never
 *    fires, the element never animates, and a section that was only ever meant
 *    to fade in ships blank. When the check below fails, `Reveal` renders a
 *    plain `div` and the page is simply visible.
 *
 * `prefers-reduced-motion` is folded into the same question because the answer
 * is the same: render it, don't move it.
 */
const revealsAllowed =
  typeof window !== 'undefined' &&
  typeof IntersectionObserver !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface RevealProps {
  children: ReactNode;
  className?: string;
  id?: string;
  /** Seconds. For staggering siblings; keep the total under ~0.4s. */
  delay?: number;
  /** How far it travels, in px. Small — this is a settle, not an entrance. */
  y?: number;
}

/**
 * The page's one reveal.
 *
 * Deliberately dull and deliberately singular: a short rise on an exponential
 * ease-out, no bounce, no scale, no blur. Sections differ from each other by
 * being different shapes, not by each arriving in its own way — six bespoke
 * entrances is the tell that nobody decided anything.
 */
export default function Reveal({ children, className, id, delay = 0, y = 18 }: RevealProps) {
  if (!revealsAllowed) {
    return (
      <div className={className} id={id}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      id={id}
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Exported for the hero, which orchestrates its own load rather than reveal. */
export { revealsAllowed };
