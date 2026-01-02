"use client";

import { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
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
  // Destructure className from props to prevent it from overriding our computed className
  const { className: _propsClassName, ...restProps } = props as { className?: string };
  return (
    <svg
      {...defaultProps}
      {...restProps}
      className={`${sizeClasses[size]} ${className}`.trim()}
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

/**
 * Renders an external-link SVG icon.
 *
 * @param size - One of `"sm" | "md" | "lg"`; controls the icon's rendered width and height (default: `"sm"`).
 * @param className - Additional CSS classes to apply to the SVG element.
 * @returns The SVG element representing an external-link icon.
 */
export function ExternalLinkIcon({ size = "sm", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </Icon>
  );
}

/**
 * Renders a trash/delete SVG icon.
 *
 * @param size - Icon size ("sm" | "md" | "lg"); defaults to "sm".
 * @param className - Additional CSS classes applied to the SVG root.
 * @returns The rendered trash icon SVG element.
 */
export function TrashIcon({ size = "sm", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </Icon>
  );
}

/**
 * Renders a send (paper-plane) SVG icon.
 *
 * @param size - Icon size variant; one of "sm", "md", or "lg" (defaults to "sm")
 * @param className - Additional CSS classes applied to the SVG element
 * @returns A JSX element containing the send icon SVG
 */
export function SendIcon({ size = "sm", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </Icon>
  );
}

/**
 * Renders a circular request icon with a centered vertical line.
 *
 * @param size - Icon size variant; controls the rendered width/height (defaults to "sm")
 * @param className - Additional CSS classes to apply to the SVG; merged with size-derived classes
 * @returns The SVG element for the request icon
 */
export function RequestIcon({ size = "sm", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M12 9v6" />
    </Icon>
  );
}

/**
 * Renders a plus (+) icon.
 *
 * @param size - Controls the icon's size; one of "sm", "md", or "lg"
 * @param className - Additional CSS classes to apply to the SVG element
 * @returns An SVG element depicting a plus symbol
 */
export function PlusIcon({ size = "sm", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M12 4v16m8-8H4" />
    </Icon>
  );
}

export function SunIcon({ size = "md", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </Icon>
  );
}

export function MoonIcon({ size = "md", className = "", ...props }: IconProps) {
  return (
    <Icon size={size} className={className} {...props}>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </Icon>
  );
}