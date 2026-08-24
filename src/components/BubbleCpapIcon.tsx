import type { SVGProps } from "react";

export function BubbleCpapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="9" cy="14" r="4.5" />
      <circle cx="16.5" cy="8" r="3" />
      <circle cx="18" cy="16.5" r="1.5" />
      <circle cx="8" cy="5.5" r="1.25" />
    </svg>
  );
}
