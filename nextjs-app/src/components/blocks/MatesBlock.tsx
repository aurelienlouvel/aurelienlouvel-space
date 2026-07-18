"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Icon } from "@/components/primitives/Icon";
import type { Mate } from "@/sanity/queries";

const SPRING = {
  type: "spring",
  stiffness: 280,
  damping: 26,
} as const;

// Deterministic rotation from Sanity _key — same value across all pages/reloads
function seededRotation(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return ((h & 0xff) / 255) * 6 - 3; // -3° to +3°
}

export function MatesBlock({ mates }: { mates: Mate[] }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const filtered = mates.filter((m) => m.person != null);

  return (
    <div className="flex -space-x-1 pt-2">
      {filtered.map((mate) => {
        const { person, roles } = mate;
        const fullName = `${person.firstName} ${person.lastName}`;
        const initials = fullName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        const isHovered = hoveredKey === mate._key;
        const baseRotation = seededRotation(mate._key) * 2.5;

        return (
          <div
            key={mate._key}
            className="relative"
            style={{ zIndex: isHovered ? 10 : 1 }}
            onPointerEnter={() => setHoveredKey(mate._key)}
            onPointerLeave={() => setHoveredKey(null)}
            onClick={() =>
              person.linkedinUrl &&
              window.open(person.linkedinUrl, "_blank", "noopener")
            }
          >
            {/* Avatar */}
            <motion.div
              animate={{
                rotate: isHovered ? 0 : baseRotation,
                scale: isHovered ? 1.6 : 1,
              }}
              transition={SPRING}
              className="cursor-pointer [filter:drop-shadow(0_1px_4px_rgb(0_0_0/0.08))]"
            >
              <Avatar className="!h-10 rounded-lg ring-2 ring-white after:rounded-lg">
                <AvatarImage
                  src={person.avatarUrl ?? undefined}
                  alt={fullName}
                  className="aspect-auto rounded-lg"
                />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </motion.div>

            {/* Info panel — appears below, slides out from behind the avatar */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  className="pointer-events-none absolute top-full left-1/2 mt-5 flex -translate-x-1/2 flex-col items-center gap-1.5"
                  style={{ transformOrigin: "50% calc(0% - 32px)" }}
                  initial={{
                    opacity: 0,
                    y: -28,
                    scale: 0.4,
                    rotate: baseRotation,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  exit={{
                    opacity: 0,
                    y: -20,
                    scale: 0.4,
                    transition: { duration: 0.12 },
                  }}
                  transition={SPRING}
                >
                  <p className="text-lg font-semibold text-stone-900 whitespace-nowrap text-center">
                    {person.firstName} {person.lastName}
                  </p>
                  {(roles ?? []).map((role, ri) => (
                    <div
                      key={role._id}
                      style={{
                        rotate: `${(Math.abs(seededRotation(role._id)) * 0.3 * (ri % 2 === 0 ? 1 : -1)).toFixed(1)}deg`,
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap${role.color ? ` bg-${role.color}-100 text-${role.color}-950` : " bg-stone-100 text-stone-900"}`}
                    >
                      {role.icon && (
                        <Icon name={role.icon} size={10} strokeWidth={2} />
                      )}
                      {role.name}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
