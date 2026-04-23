import React from "react";
import { Spinner } from "./Spinner";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  isLoading?: boolean;
}

const BASE_CLASSES =
  "group relative flex items-center justify-center rounded-xl px-6 font-bold transition-all duration-300 ease-out disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pluto-500 focus-visible:ring-offset-2 hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]";

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "h-12 bg-pluto-500 text-white hover:bg-pluto-600 hover:shadow-lg hover:shadow-pluto-500/30",
  secondary:
    "h-12 border border-pluto-200 bg-pluto-50 text-pluto-700 hover:border-pluto-300 hover:bg-pluto-100 hover:text-pluto-800 hover:shadow-md hover:shadow-pluto-500/5",
};

const ButtonBase = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      isLoading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const variantClasses = VARIANT_CLASSES[variant];
    const showPrimaryGlow = variant === "primary";

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${BASE_CLASSES} ${variantClasses} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5 sm:gap-2">
            <Spinner
              size="sm"
              className={variant === "primary" ? "text-white" : "text-pluto-500"}
            />
            <span className="hidden xs:inline">Loading...</span>
          </span>
        ) : (
          children
        )}
        {showPrimaryGlow && (
          <div className="absolute inset-0 -z-10 bg-pluto-500/30 opacity-0 blur-xl transition-all duration-300 group-hover:scale-110 group-hover:opacity-100 group-hover:blur-2xl" />
        )}
      </button>
    );
  },
);
ButtonBase.displayName = "Button";

export const Button = React.memo(ButtonBase);
Button.displayName = "Button";
