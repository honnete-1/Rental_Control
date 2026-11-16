import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

import { cn } from "@/lib/utils";

/* All buttons are at least 44px high (WCAG target size) and always carry a text label. */
export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-teal-600 text-white hover:bg-teal-700",
        secondary: "border-2 border-navy-800 bg-surface text-navy-800 hover:bg-navy-50 dark:border-slate-300 dark:text-slate-100 dark:hover:bg-navy-700",
        ghost: "text-navy-800 hover:bg-navy-50 dark:text-slate-100 dark:hover:bg-navy-700",
        danger: "bg-danger-700 text-white hover:bg-danger-600",
        navy: "bg-navy-800 text-white hover:bg-navy-700",
      },
      size: {
        md: "",
        lg: "min-h-14 px-6 text-lg",
        sm: "min-h-11 px-3 text-sm",
        icon: "min-w-11 px-2",
      },
      full: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Variants {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, loading, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, full }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export function ButtonLink({ className, variant, size, full, ...props }: LinkProps & Variants) {
  return <Link className={cn(buttonVariants({ variant, size, full }), className)} {...props} />;
}
