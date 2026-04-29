import Image from "next/image";

import { cn } from "@/lib/utils";

const sizes = {
  sm: { box: "size-7", px: 28 },
  md: { box: "size-9", px: 36 },
  lg: { box: "size-11", px: 44 },
} as const;

type LogoSize = keyof typeof sizes;

type LogoMarkProps = {
  className?: string;
  size?: LogoSize;
  /** A11y: hide decorative icon from assistive tech when used next to a wordmark. */
  "aria-hidden"?: boolean;
};

/** Brand mark: Clara avatar in a circular ring with a soft violet/lime glow. */
export function LogoMark({
  className,
  size = "md",
  "aria-hidden": ariaHidden = true,
}: LogoMarkProps) {
  const { box, px } = sizes[size];
  return (
    <span
      className={cn("relative inline-block shrink-0 rounded-full", box, className)}
      aria-hidden={ariaHidden}
      style={{
        boxShadow:
          "0 0 0 2px var(--background), 0 6px 14px -6px rgb(124 91 255 / 0.45)",
      }}
    >
      <Image
        src="/clara-avatar-simple.png"
        alt=""
        width={px}
        height={px}
        priority
        className="h-full w-full rounded-full object-cover"
      />
    </span>
  );
}

type LogoProps = {
  className?: string;
  /** Tamaño del icono. */
  size?: LogoSize;
  /** Muestra el nombre junto al ícono. */
  withWordmark?: boolean;
  /** Tamaño del texto; por defecto acorde a `size`. */
  textClassName?: string;
};

export function Logo({
  className,
  size = "md",
  withWordmark = true,
  textClassName,
}: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} aria-hidden={withWordmark} />
      {withWordmark ? (
        <span
          className={cn(
            "font-display font-bold tracking-[-0.02em] text-foreground",
            size === "sm" && "text-base",
            size === "md" && "text-lg",
            size === "lg" && "text-xl",
            textClassName,
          )}
        >
          Clara
        </span>
      ) : null}
    </span>
  );
}
