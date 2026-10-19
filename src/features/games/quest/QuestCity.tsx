import { DISTRICTS, type QuestMission } from "./api";

/** Code-drawn city: every building grows when its district missions pass. */
export function QuestCity({ missions }: { missions: QuestMission[] }) {
  return (
    <svg
      viewBox="0 0 520 390"
      className="mx-auto w-full max-w-[600px]"
      role="img"
      aria-label="Shared city: buildings grow as your squad completes district missions"
    >
      <defs>
        <radialGradient id="quest-city-glow">
          <stop stopColor="#9254c8" stopOpacity=".3" />
          <stop offset="1" stopColor="#9254c8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="260" cy="235" rx="255" ry="150" fill="url(#quest-city-glow)" />
      <path d="M60 240 260 130 460 240 260 350Z" fill="#20132d" stroke="#ffffff18" />
      <path d="m160 185 200 110m-200 0 200-110" stroke="#ffffff20" strokeWidth="8" />
      {DISTRICTS.map((district, i) => {
        const progress = missions.filter(
          (m) => m.district === district.key && m.status === "complete",
        ).length;
        const x = [160, 360, 160, 360][i],
          y = [160, 160, 280, 280][i];
        const h = progress === 2 ? 105 : progress === 1 ? 55 : 20;
        return (
          <g key={district.key} transform={`translate(${x} ${y})`} opacity={progress ? 1 : 0.38}>
            <path
              d="m-90 45 90-48 90 48-90 48Z"
              fill={district.color}
              fillOpacity=".1"
              stroke={district.color}
              strokeOpacity=".4"
              strokeDasharray={progress ? undefined : "4 5"}
            />
            <g style={{ transform: `translateY(${-h}px)`, transition: "transform .8s ease" }}>
              <path d={`m-38 15 38 20v${h}l-38-20Z`} fill={district.color} fillOpacity=".45" />
              <path d={`m0 35 38-20v${h}l-38 20Z`} fill={district.color} fillOpacity=".7" />
              <path d="m-38 15 38-20 38 20-38 20Z" fill={district.color} />
              {progress > 0 &&
                [0, 1, 2].map((n) => (
                  <g key={n}>
                    <path
                      d={`m-29 ${30 + n * 14} 8 4m8 4 8 4m15 0 8-4m8-4 8-4`}
                      stroke="#fff"
                      strokeWidth="3"
                      opacity={n * 14 + 20 < h ? 0.8 : 0}
                    />
                  </g>
                ))}
              {progress === 2 && (
                <>
                  <path d="M0-5v-25" stroke={district.color} strokeWidth="2" />
                  <path d="m1-30 22 6-22 7" fill={district.color} />
                </>
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
