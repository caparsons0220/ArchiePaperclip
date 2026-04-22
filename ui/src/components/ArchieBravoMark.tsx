import { useId, type SVGProps } from "react";

export function ArchieBravoMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  const gradientId = `archie-bravo-face-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="15" y1="10" x2="49" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.58" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e7e9ed" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="15" fill="#111111" />
      <rect x="7" y="7" width="50" height="50" rx="12" fill={`url(#${gradientId})`} />
      <path
        d="M15 23.5C18 18.7 23.9 16 28.6 16"
        stroke="#111111"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M35.4 16C40.1 16 46 18.7 49 23.5"
        stroke="#111111"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <ellipse cx="24" cy="35" rx="5.8" ry="8.8" fill="#111111" />
      <path d="M28.8 30.4L23.1 35L28.8 39.6Z" fill={`url(#${gradientId})`} />
      <ellipse cx="40" cy="35" rx="5.8" ry="8.8" fill="#111111" />
      <path d="M35.2 30.4L40.9 35L35.2 39.6Z" fill={`url(#${gradientId})`} />
      <path
        d="M22.5 46.5C26.4 50 37.6 50 41.5 46.5C39.4 51 24.6 51 22.5 46.5Z"
        fill="#111111"
      />
    </svg>
  );
}
