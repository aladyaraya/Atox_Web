/** Original vector artwork: orbital paths, an idea seed, and a flowing horizon. */
export function HeroArt() {
  return (
    <svg
      className="hp-art"
      viewBox="0 0 1440 900"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="hp-glow">
          <stop stopColor="#9270d9" stopOpacity=".2" />
          <stop offset="1" stopColor="#111014" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hp-orbit">
          <stop stopColor="#b397ff" stopOpacity=".1" />
          <stop offset=".45" stopColor="#c3adff" />
          <stop offset="1" stopColor="#d4fa70" stopOpacity=".4" />
        </linearGradient>
        <linearGradient id="hp-horizon">
          <stop stopColor="#b397ff" stopOpacity="0" />
          <stop offset=".6" stopColor="#b397ff" stopOpacity=".5" />
          <stop offset="1" stopColor="#d4fa70" stopOpacity=".1" />
        </linearGradient>
        <filter id="hp-blur">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>
      <ellipse cx="1080" cy="420" rx="460" ry="450" fill="url(#hp-glow)" />
      <g className="hp-art-orbits" transform="translate(1060 400)">
        {[0, 30, 60, 90, 120, 150].map((angle) => (
          <ellipse
            key={angle}
            rx="236"
            ry="100"
            transform={`rotate(${angle})`}
            stroke="url(#hp-orbit)"
            strokeWidth=".8"
          />
        ))}
        <circle
          r="169"
          stroke="#b397ff"
          strokeOpacity=".18"
          strokeDasharray="3 9"
        />
        <circle r="264" stroke="#b397ff" strokeOpacity=".15" />
        <path d="M-290 0H290M0-290V290" stroke="#b397ff" strokeOpacity=".13" />
        <circle cx="-167" cy="-120" r="4" fill="#b397ff" />
        <circle cx="193" cy="-106" r="4" fill="#d4fa70" />
        <circle cx="-140" cy="143" r="3" fill="#b397ff" />
      </g>
      <g className="hp-art-seed" transform="translate(1060 400)">
        <circle r="55" fill="#b397ff" opacity=".12" filter="url(#hp-blur)" />
        <path
          d="m0-51 14 37L51 0 14 14 0 51-14 14-51 0-14-14z"
          fill="#d4fa70"
        />
        <circle r="72" stroke="#d4fa70" strokeOpacity=".25" />
      </g>
      <g stroke="url(#hp-horizon)" strokeWidth=".7">
        {Array.from({ length: 25 }, (_, i) => (
          <path
            key={i}
            d={`M-120 ${810 + i * 12}C300 ${470 + i * 15} 680 ${1010 + i * 4} 1550 ${545 + i * 10}`}
          />
        ))}
      </g>
      <g fill="#b397ff" opacity=".5">
        {Array.from({ length: 35 }, (_, i) => (
          <circle
            key={i}
            cx={750 + ((i * 137) % 660)}
            cy={105 + ((i * 97) % 620)}
            r={i % 4 === 0 ? 1.8 : 0.8}
          />
        ))}
      </g>
    </svg>
  );
}
