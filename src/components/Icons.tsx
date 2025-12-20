"use client";

import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5", 
  lg: "w-6 h-6",
};

const defaultProps: SVGProps<SVGSVGElement> = {
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 2,
};

export function Icon({ size = "md", className = "", ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={`${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}

export function ClipboardIcon({ size = "sm", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </Icon>
  );
}

export function RefreshIcon({ size = "md", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </Icon>
  );
}

export function ChevronDownIcon({ size = "sm", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M19 9l-7 7-7-7" />
    </Icon>
  );
}

export function RequestsIcon({ size = "lg", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </Icon>
  );
}

export function ContactsIcon({ size = "lg", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </Icon>
  );
}

export function SettingsIcon({ size = "lg", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </Icon>
  );
}

export function SpinnerIcon({ size = "md", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={`animate-spin ${className}`} {...props}>
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </Icon>
  );
}

export function ExternalLinkIcon({ size = "sm", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </Icon>
  );
}
