"use client";

import { motion, useAnimationControls } from "motion/react";
import { useLayoutEffect } from "react";

export function AnimatedItem({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const controls = useAnimationControls();

  useLayoutEffect(() => {
    controls.start({
      opacity: 1,
      scale: 1,
      y: 0,
      rotate: 0,
      transition: { type: "spring", stiffness: 300, damping: 26, delay },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.92, y: 10, rotate: -1.5 }}
      animate={controls}
    >
      {children}
    </motion.div>
  );
}
