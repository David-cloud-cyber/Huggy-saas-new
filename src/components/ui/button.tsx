import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { SPRING_PRESS } from "../../lib/ease";
import { cn } from "../../lib/utils";

export type HuggyButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type HuggyButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  variant?: HuggyButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
};

export const Button = React.forwardRef<HTMLButtonElement, HuggyButtonProps>(function Button(
  { className, variant = "primary", loading = false, loadingLabel = "Chargement…", children, disabled, ...props },
  ref,
) {
  const styles: Record<HuggyButtonVariant, string> = {
    primary: "huggy-ui-button huggy-ui-button-primary",
    secondary: "huggy-ui-button huggy-ui-button-secondary",
    ghost: "huggy-ui-button huggy-ui-button-ghost",
    danger: "huggy-ui-button huggy-ui-button-danger",
  };
  return (
    <motion.button
      ref={ref}
      type="button"
      className={cn(styles[variant], className)}
      whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      transition={SPRING_PRESS}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? loadingLabel : children}
    </motion.button>
  );
});
