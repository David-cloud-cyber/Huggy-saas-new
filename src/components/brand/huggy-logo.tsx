import * as React from "react";
import { cn } from "../../lib/utils";

type HuggyLogoMarkProps = React.SVGProps<SVGSVGElement> & {
  decorative?: boolean;
};

export function HuggyLogoMark({ className, decorative = true, ...props }: HuggyLogoMarkProps) {
  return (
    <svg
      {...props}
      className={cn("huggy-logo-mark", className)}
      viewBox="0 0 32 32"
      fill="none"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : "Logo Huggy"}
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--logo-bg, var(--text))" />
      <path d="M16 8L25 13.5V14.5L16 9.5L7 14.5V13.5L16 8Z" fill="var(--logo-fg, var(--bg))" />
      <path d="M7 16.5V24.5L11.5 22V14L7 16.5Z" fill="var(--logo-fg, var(--bg))" />
      <path d="M25 16.5V24.5L16 24.5V22H20.5V14L25 16.5Z" fill="var(--logo-fg, var(--bg))" />
    </svg>
  );
}

type HuggyBrandProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  label?: string;
  showName?: boolean;
};

export function HuggyBrand({ className, label = "Huggy accueil", showName = true, children, ...props }: HuggyBrandProps) {
  return (
    <a {...props} className={cn("huggy-brand", className)} aria-label={label} href={props.href || "/"}>
      <HuggyLogoMark width={32} height={32} />
      {showName ? <span className="huggy-wordmark">{children || "Huggy"}</span> : null}
    </a>
  );
}
