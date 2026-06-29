import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const sizeCls: Record<Size, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

const variantCls: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, iconLeft, iconRight, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn("btn", variantCls[variant], sizeCls[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});
