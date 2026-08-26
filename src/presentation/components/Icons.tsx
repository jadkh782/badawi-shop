/**
 * Icons drawn inline rather than pulled from a set.
 *
 * Seven glyphs do not justify a dependency, and drawing them keeps the stroke weight matched
 * to the type. All of them inherit currentColor.
 */
type Props = { className?: string };

const base = 'h-6 w-6';
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const ScanIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <path d="M7 8v8M10 8v8M13.5 8v8M17 8v8" />
    </g>
  </svg>
);

export const CartIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L20 7H6" />
      <circle cx="9.5" cy="19.5" r="1.4" />
      <circle cx="17" cy="19.5" r="1.4" />
    </g>
  </svg>
);

export const BoxIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <path d="M21 8.5v7a2 2 0 0 1-1.05 1.76l-7 3.6a2 2 0 0 1-1.9 0l-7-3.6A2 2 0 0 1 3 15.5v-7a2 2 0 0 1 1.05-1.76l7-3.6a2 2 0 0 1 1.9 0l7 3.6A2 2 0 0 1 21 8.5Z" />
      <path d="m3.3 7.6 8.7 4.5 8.7-4.5M12 12.1V21" />
    </g>
  </svg>
);

export const ChartIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </g>
  </svg>
);

export const GearIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.2M12 19.8V22M22 12h-2.2M4.2 12H2M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6M19.1 19.1l-1.6-1.6M6.5 6.5 4.9 4.9" />
    </g>
  </svg>
);

export const BackIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <path d="M15 5l-7 7 7 7" />
    </g>
  </svg>
);

export const PlusIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </g>
  </svg>
);

export const SearchIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </g>
  </svg>
);

export const TorchIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" />
    </g>
  </svg>
);

export const CloseIcon = ({ className = base }: Props) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <g {...stroke}>
      <path d="M6 6l12 12M18 6 6 18" />
    </g>
  </svg>
);
