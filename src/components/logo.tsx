import { cn } from "@/lib/utils";

const sizes = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-11 w-11",
} as const;

type LogoSize = keyof typeof sizes;

type LogoMarkProps = {
  className?: string;
  size?: LogoSize;
  /** A11y: hide decorative icon from assistive tech when used next to a wordmark. */
  "aria-hidden"?: boolean;
};

/** Square mark: bar chart in a rounded tile (meses / flujo de gastos). */
export function LogoMark({ className, size = "md", "aria-hidden": ariaHidden = true }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={cn(sizes[size], "shrink-0", className)}
      aria-hidden={ariaHidden}
    >
      <rect width="40" height="40" rx="10" className="fill-primary" />
      <rect x="8" y="22" width="6" height="10" rx="2" className="fill-primary-foreground/95" />
      <rect x="17" y="16" width="6" height="16" rx="2" className="fill-primary-foreground" />
      <rect x="26" y="10" width="6" height="22" rx="2" className="fill-primary-foreground" />
    </svg>
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

export function Logo({ className, size = "md", withWordmark = true, textClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} aria-hidden={withWordmark} />
      {withWordmark ? (
        <span
          className={cn(
            "font-heading font-bold tracking-[-0.02em] text-foreground",
            size === "sm" && "text-base",
            size === "md" && "text-lg",
            size === "lg" && "text-xl",
            textClassName,
          )}
        >
          <span className="text-primary">e</span>Tracker
        </span>
      ) : null}
    </span>
  );
}
