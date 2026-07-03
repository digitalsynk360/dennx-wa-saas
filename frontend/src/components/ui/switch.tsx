"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: "sm" | "default";
}

/**
 * Accessible toggle switch with correctly aligned knob.
 * Uses translate-x for the knob so alignment is always pixel-perfect.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, size = "default", disabled, ...props }, ref) => {
    const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
    const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
    const knobTranslate =
      size === "sm"
        ? checked ? "translate-x-4" : "translate-x-0.5"
        : checked ? "translate-x-5" : "translate-x-0.5";

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        ref={ref}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex flex-shrink-0 cursor-pointer items-center rounded-full",
          "transition-colors duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          track,
          checked ? "bg-primary" : "bg-gray-200",
          className
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block rounded-full bg-white shadow ring-0",
            "transform transition-transform duration-200 ease-in-out",
            knob,
            knobTranslate
          )}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };