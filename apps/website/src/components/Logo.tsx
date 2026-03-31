interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ size = "md", showText = true }: LogoProps) {
  const sizes = {
    sm: { icon: 32, text: "text-xl" },
    md: { icon: 40, text: "text-2xl" },
    lg: { icon: 56, text: "text-4xl" }
  };

  const iconSize = sizes[size].icon;
  const textSize = sizes[size].text;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <svg fill="none" height={iconSize} viewBox="0 0 100 100" width={iconSize} xmlns="http://www.w3.org/2000/svg">
          <g className="animate-pulse">
            <ellipse cx="50" cy="60" fill="#5eb3b8" rx="22" ry="26" stroke="#4da0a5" strokeWidth="2" />
            <path d="M 32 48 Q 28 35 30 25 Q 31 20 35 22 Q 37 24 36 29 Q 34 40 36 48 Z" fill="#5eb3b8" stroke="#4da0a5" strokeWidth="1.5" />
            <path d="M 40 42 Q 38 28 39 18 Q 40 13 44 14 Q 46 16 45 21 Q 43 32 43 42 Z" fill="#71c4c9" stroke="#4da0a5" strokeWidth="1.5" />
            <path d="M 50 40 Q 49 24 50 12 Q 51 6 55 7 Q 57 9 56 14 Q 54 26 52 40 Z" fill="#5eb3b8" stroke="#4da0a5" strokeWidth="1.5" />
            <path d="M 60 42 Q 60 28 61 18 Q 62 13 66 14 Q 68 16 67 21 Q 65 32 63 42 Z" fill="#71c4c9" stroke="#4da0a5" strokeWidth="1.5" />
            <path d="M 68 48 Q 72 35 70 25 Q 69 20 65 22 Q 63 24 64 29 Q 66 40 64 48 Z" fill="#5eb3b8" stroke="#4da0a5" strokeWidth="1.5" />
          </g>

          <g className="sparkles">
            <circle cx="20" cy="30" fill="#f5c563" opacity="0.8" r="2">
              <animate attributeName="opacity" dur="2s" repeatCount="indefinite" values="0.3;1;0.3" />
            </circle>
            <circle cx="80" cy="35" fill="#ffa463" opacity="0.8" r="2">
              <animate attributeName="opacity" dur="2.5s" repeatCount="indefinite" values="0.8;0.3;0.8" />
            </circle>
            <circle cx="50" cy="5" fill="#f5c563" opacity="0.9" r="2.5">
              <animate attributeName="opacity" dur="1.8s" repeatCount="indefinite" values="0.4;1;0.4" />
            </circle>
          </g>

          <g className="face">
            <ellipse cx="43" cy="58" fill="#1a2b2e" opacity="0.8" rx="2.5" ry="3" />
            <ellipse cx="57" cy="58" fill="#1a2b2e" opacity="0.8" rx="2.5" ry="3" />
            <path d="M 40 66 Q 50 70 60 66" fill="none" opacity="0.7" stroke="#1a2b2e" strokeLinecap="round" strokeWidth="2" />
            <ellipse cx="37" cy="64" fill="#ffa463" opacity="0.3" rx="3" ry="2" />
            <ellipse cx="63" cy="64" fill="#ffa463" opacity="0.3" rx="3" ry="2" />
          </g>

          <path d="M 28 85 Q 35 82 42 85 Q 50 88 58 85 Q 65 82 72 85" fill="none" opacity="0.4" stroke="#71c4c9" strokeLinecap="round" strokeWidth="3" />
        </svg>
      </div>

      {showText ? (
        <div className="flex items-baseline">
          <span className={`${textSize} font-bold text-[#5eb3b8]`}>Chill</span>
          <span className={`${textSize} font-bold text-[#1a2b2e]`}>Claw</span>
        </div>
      ) : null}
    </div>
  );
}
