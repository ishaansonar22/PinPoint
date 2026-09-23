import type { Variants } from "framer-motion";

/**
 * Card entrance variants. The reduced-motion versions keep the same keys
 * (hidden / show) so swapping them after mount never leaves an element stuck
 * in its hidden state; they just complete instantly.
 */
export const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const gridVariantsReduced: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0, delayChildren: 0 } },
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

export const cardVariantsReduced: Variants = {
  hidden: { opacity: 0, y: 0 },
  show: { opacity: 1, y: 0, transition: { duration: 0 } },
};
