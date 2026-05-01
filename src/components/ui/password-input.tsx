"use client";

import { Eye, EyeOff } from "lucide-react";
import { ComponentProps, forwardRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  /** Localised aria-label for the toggle button. */
  toggleLabel?: string;
};

/**
 * Password field with a built-in eye icon to toggle plaintext visibility.
 * Used by /login and /register so users can verify what they typed without
 * having to clear and retype.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, toggleLabel = "Show password", ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={visible ? "text" : "password"}
          // Reserve room on the right for the toggle button so the cursor never
          // collides with it.
          className={cn("pr-10", className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={toggleLabel}
          aria-pressed={visible}
          tabIndex={-1}
          className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center px-3 outline-none focus-visible:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
