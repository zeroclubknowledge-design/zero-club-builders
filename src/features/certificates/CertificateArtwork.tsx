import { useId } from "react";
import { supabase } from "@/lib/supabase";
import { certificateTemplates, readableOn, safeAccent, type CertificateDesign } from "./design";

/**
 * The certificate itself.
 *
 * Drawn as one SVG at A4-landscape proportion so the preview, the public page
 * and the printed PDF are the same artwork at different sizes. Everything is
 * set in the Zero Club brand face (Montserrat) and composed on a deliberate
 * vertical rhythm — eyebrow, name, programme, citation, signatories — rather
 * than relying on whatever the browser picks as a default.
 */

const FONT = "Montserrat, 'Inter Tight', -apple-system, system-ui, sans-serif";

type Palette = {
  paper: string;
  ink: string;
  muted: string;
  hair: string;
  accent: string;
  band: string;
  bandInk: string;
};

const palettes: Record<string, Palette> = {
  folio: {
    paper: "#fbf7ef", ink: "#211b33", muted: "#6f6880",
    hair: "#d8cfbd", accent: "#6846c5", band: "#2a2140", bandInk: "#fbf7ef",
  },
  cobalt: {
    paper: "#fdfcf9", ink: "#101a3c", muted: "#6a7290",
    hair: "#d6dae8", accent: "#243be3", band: "#151f59", bandInk: "#fdfcf9",
  },
  spectrum: {
    paper: "#fffaf4", ink: "#241a16", muted: "#7d6a61",
    hair: "#ecdbcd", accent: "#c8451f", band: "#241a16", bandInk: "#fffaf4",
  },
  coral: {
    paper: "#fff9f7", ink: "#2a1a1c", muted: "#836b6d",
    hair: "#f0d9d5", accent: "#c24f4c", band: "#7d2f30", bandInk: "#fff9f7",
  },
  mosaic: {
    paper: "#f9fbfa", ink: "#0f2b28", muted: "#5f7c78",
    hair: "#cfe0dc", accent: "#1c6f67", band: "#0e3b37", bandInk: "#f9fbfa",
  },
  orbit: {
    paper: "#f8fbf7", ink: "#102c22", muted: "#5d786b",
    hair: "#d4e3d6", accent: "#0f6b52", band: "#0d3a2c", bandInk: "#f8fbf7",
  },
};

const paletteFor = (id: string) => palettes[id] || palettes.folio;

/** Greedy wrap with an ellipsis when the text is longer than the space allows. */
function lines(text: string, limit: number, max = 3) {
  const result: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > limit && line) {
      result.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) result.push(line);
  return result
    .slice(0, max)
    .map((line, i) =>
      i === max - 1 && result.length > max ? line.slice(0, limit - 1) + "…" : line,
    );
}

/** A fine engraved corner: two hairlines and a small diamond. */
function Corner({ x, y, sx, sy, color, opacity = 0.8 }: {
  x: number; y: number; sx: 1 | -1; sy: 1 | -1; color: string; opacity?: number;
}) {
  return (
    <g opacity={opacity} stroke={color} strokeWidth="1" fill={color}>
      <path d={`M${x} ${y + 46 * sy}V${y}H${x + 46 * sx}`} fill="none" />
      <path d={`M${x + 9 * sx} ${y + 9 * sy}l7 ${7 * sy}l-7 ${7 * sy}l-7 ${-7 * sy}Z`} stroke="none" />
    </g>
  );
}

/** The issuer's mark: concentric rings around a checkmark, engraved. */
function Seal({ cx, cy, r, accent, paper, ink }: {
  cx: number; cy: number; r: number; accent: string; paper: string; ink: string;
}) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={r} fill="none" stroke={accent} strokeWidth="1.4" />
      <circle r={r - 5} fill="none" stroke={accent} strokeWidth="0.7" opacity="0.55" />
      <circle r={r - 9} fill={paper} stroke={accent} strokeWidth="0.7" opacity="0.45" />
      {Array.from({ length: 32 }).map((_, i) => {
        const angle = (i / 32) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={Math.cos(angle) * (r - 5)}
            y1={Math.sin(angle) * (r - 5)}
            x2={Math.cos(angle) * (r - 2.5)}
            y2={Math.sin(angle) * (r - 2.5)}
            stroke={accent}
            strokeWidth="0.9"
            opacity="0.6"
          />
        );
      })}
      <path
        d={`M${-r * 0.26} 0l${r * 0.15} ${r * 0.15}l${r * 0.3} ${-r * 0.32}`}
        fill="none"
        stroke={ink}
        strokeWidth={Math.max(2, r * 0.07)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        y={r * 0.56}
        textAnchor="middle"
        fontFamily={FONT}
        fontSize={Math.max(5.5, r * 0.155)}
        fontWeight="700"
        letterSpacing="0.16em"
        fill={accent}
      >
        VERIFIED
      </text>
    </g>
  );
}

export function CertificateArtwork({
  design,
  side = "front",
  learner = "Alex Morgan",
  course = "Your bootcamp title",
  code = "SAMPLE · NOT ISSUED",
  date = "Completion date",
  hours,
}: {
  design: CertificateDesign;
  side?: "front" | "back";
  learner?: string;
  course?: string;
  code?: string;
  date?: string;
  hours?: number;
}) {
  const raw = useId().replace(/:/g, "");
  const t = certificateTemplates.find((t) => t.id === design.template) || certificateTemplates[0];
  const brandOn = !!design.use_brand;
  const base = paletteFor(t.id);
  // With branding on, the issuer's colour runs the frame, rules, seal and the
  // reverse — the whole credential belongs to them. Ink stays dark so the
  // result is legible on paper whatever colour they pick.
  const accent = safeAccent(design.brand_accent, "#cc208f");
  const p: Palette = brandOn
    ? { ...base, accent, band: accent, bandInk: readableOn(accent) }
    : base;
  const brand =
    brandOn && (design.brand_name || "").trim() ? (design.brand_name || "").trim() : "Zero Club";
  const asset = (url: string) =>
    url.includes("/storage/v1/object/public/certificate-assets/")
      ? supabase.storage
          .from("certificate-assets")
          .getPublicUrl(url.split("/storage/v1/object/public/certificate-assets/")[1]).data
          .publicUrl
      : url;
  const logo = design.use_brand ? asset(design.brand_logo) : "/logo.png";
  const signature = design.signature_url ? asset(design.signature_url) : "";
  const back = side === "back";
  const style = t.style as "border" | "ribbon" | "left" | "right" | "both" | "orbit";

  // Body alignment differs per template; the footer is always centred so the
  // signature, seal and date read as one formal block.
  const centred = style === "border" || style === "ribbon" || style === "both" || style === "orbit";
  const contentX = centred ? 500 : style === "left" ? 590 : 410;
  const anchor = centred ? "middle" : "start";
  const limit = centred ? 46 : 38;

  const nameLines = lines(learner, 30, 2);
  const courseLines = lines(course, limit, 2);
  const citation = design.back_text?.trim() || "";
  const nameSize = nameLines.length > 1 ? 33 : learner.length > 24 ? 38 : 44;
  const afterName = nameLines.length > 1 ? 306 : 290;

  const sheet = (
    <svg
      viewBox="0 0 1000 700"
      role="img"
      aria-label={`${t.name} certificate ${side}`}
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full"
      style={{ fontFamily: FONT }}
    >
      <defs>
        <linearGradient id={`${raw}-paper`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={p.paper} />
          <stop offset="100%" stopColor={p.paper} />
        </linearGradient>
        <linearGradient id={`${raw}-band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.band} />
          <stop offset="100%" stopColor={p.band} stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={`${raw}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1000" height="700" fill={`url(#${raw}-paper)`} />

      {back ? (
        <BackSheet {...{ p, style, design, brand, logo, signature, courseLines, code, hours }} />
      ) : (
        <>
          {/* ── Template ornament ─────────────────────────────────────── */}
          {style === "border" && (
            <>
              <rect x="26" y="26" width="948" height="648" rx="2" fill="none" stroke={p.accent} strokeWidth="1.2" opacity="0.55" />
              <rect x="34" y="34" width="932" height="632" rx="1" fill="none" stroke={p.accent} strokeWidth="0.6" opacity="0.32" />
              <rect x="46" y="46" width="908" height="608" fill="none" stroke={p.hair} strokeWidth="0.8" />
              <Corner x={46} y={46} sx={1} sy={1} color={p.accent} />
              <Corner x={954} y={46} sx={-1} sy={1} color={p.accent} />
              <Corner x={46} y={654} sx={1} sy={-1} color={p.accent} />
              <Corner x={954} y={654} sx={-1} sy={-1} color={p.accent} />
            </>
          )}

          {style === "ribbon" && (
            <>
              <rect x="0" y="0" width="1000" height="10" fill={p.accent} />
              <rect x="0" y="690" width="1000" height="10" fill={p.accent} />
              <rect x="24" y="24" width="952" height="652" fill="none" stroke={p.hair} strokeWidth="0.8" />
              <path d="M888 0h64v150l-32 -22l-32 22Z" fill={p.accent} opacity="0.9" />
            </>
          )}

          {style === "left" && (
            <>
              <rect x="0" y="0" width="156" height="700" fill={`url(#${raw}-band)`} />
              {Array.from({ length: 5 }).map((_, i) => (
                <rect
                  key={i}
                  x="0"
                  y={60 + i * 140}
                  width="156"
                  height="70"
                  fill={p.bandInk}
                  opacity={0.035}
                />
              ))}
              <path d="M156 0v700" stroke={p.accent} strokeWidth="2" opacity="0.6" />
              <text
                x="78"
                y="350"
                transform="rotate(-90 78 350)"
                textAnchor="middle"
                fontFamily={FONT}
                fontSize="11"
                fontWeight="600"
                letterSpacing="0.42em"
                fill={p.bandInk}
                opacity="0.62"
              >
                ZERO CLUB · RECOGNITION
              </text>
            </>
          )}

          {style === "right" && (
            <>
              <rect x="844" y="0" width="156" height="700" fill={`url(#${raw}-band)`} />
              <path d="M844 0v700" stroke={p.accent} strokeWidth="2" opacity="0.6" />
              <circle cx="922" cy="140" r="52" fill="none" stroke={p.bandInk} strokeWidth="0.9" opacity="0.35" />
              <circle cx="922" cy="140" r="34" fill="none" stroke={p.bandInk} strokeWidth="0.9" opacity="0.25" />
              <text
                x="922"
                y="352"
                transform="rotate(90 922 352)"
                textAnchor="middle"
                fontFamily={FONT}
                fontSize="11"
                fontWeight="600"
                letterSpacing="0.42em"
                fill={p.bandInk}
                opacity="0.62"
              >
                ZERO CLUB · RECOGNITION
              </text>
            </>
          )}

          {style === "both" && (
            <>
              <rect x="0" y="0" width="96" height="700" fill={`url(#${raw}-band)`} />
              <rect x="904" y="0" width="96" height="700" fill={`url(#${raw}-band)`} />
              {Array.from({ length: 7 }).map((_, i) => (
                <g key={i}>
                  <rect x="0" y={40 + i * 96} width="96" height="48" fill={p.bandInk} opacity={0.04} />
                  <rect x="904" y={40 + i * 96} width="96" height="48" fill={p.bandInk} opacity={0.04} />
                </g>
              ))}
              <rect x="96" y="0" width="808" height="700" fill="none" stroke={p.accent} strokeWidth="0.8" opacity="0.5" />
            </>
          )}

          {style === "orbit" && (
            <>
              <g fill="none" stroke={p.accent} opacity="0.10">
                <circle cx="880" cy="640" r="300" strokeWidth="1.2" />
                <circle cx="880" cy="640" r="228" strokeWidth="1" />
                <circle cx="880" cy="640" r="156" strokeWidth="0.8" />
                <circle cx="120" cy="60" r="190" strokeWidth="1" />
                <circle cx="120" cy="60" r="120" strokeWidth="0.8" />
              </g>
              <rect x="30" y="30" width="940" height="640" fill="none" stroke={p.hair} strokeWidth="0.8" />
              <path d="M30 96h90" stroke={p.accent} strokeWidth="2" />
              <path d="M880 604h90" stroke={p.accent} strokeWidth="2" />
            </>
          )}

          {/* ── Masthead ─────────────────────────────────────────────── */}
          {logo && (
            <image
              href={logo}
              x={500 - 21}
              y="50"
              width="42"
              height="42"
              preserveAspectRatio="xMidYMid meet"
            />
          )}
          <text
            x="500"
            y="120"
            textAnchor="middle"
            fontFamily={FONT}
            fontSize="14"
            fontWeight="700"
            letterSpacing="0.34em"
            fill={p.ink}
          >
            {brand.slice(0, 40).toUpperCase()}
          </text>
          <line x1="440" x2="560" y1="136" y2="136" stroke={p.accent} strokeWidth="1.4" opacity="0.7" />

          {/* ── Eyebrow ──────────────────────────────────────────────── */}
          <text
            x={contentX}
            y="178"
            textAnchor={anchor}
            fontFamily={FONT}
            fontSize="10.5"
            fontWeight="600"
            letterSpacing="0.38em"
            fill={p.accent}
          >
            CERTIFICATE OF COMPLETION
          </text>

          {/* ── Learner ──────────────────────────────────────────────── */}
          <text
            x={contentX}
            y={nameLines.length > 1 ? 236 : 252}
            textAnchor={anchor}
            fontFamily={FONT}
            fontSize={nameSize}
            fontWeight="600"
            letterSpacing="-0.02em"
            fill={p.ink}
          >
            {nameLines[0]}
          </text>
          {nameLines[1] && (
            <text
              x={contentX}
              y="276"
              textAnchor={anchor}
              fontFamily={FONT}
              fontSize={nameSize}
              fontWeight="600"
              letterSpacing="-0.02em"
              fill={p.ink}
            >
              {nameLines[1]}
            </text>
          )}

          <text
            x={contentX}
            y={afterName + 24}
            textAnchor={anchor}
            fontFamily={FONT}
            fontSize="12"
            fontWeight="500"
            letterSpacing="0.03em"
            fill={p.muted}
          >
            has successfully completed
          </text>

          {courseLines.map((line, i) => (
            <text
              key={i}
              x={contentX}
              y={afterName + 58 + i * 27}
              textAnchor={anchor}
              fontFamily={FONT}
              fontSize="21"
              fontWeight="600"
              letterSpacing="-0.01em"
              fill={p.ink}
            >
              {line}
            </text>
          ))}

          {citation &&
            lines(citation, centred ? 64 : 56, 2).map((line, i) => (
              <text
                key={i}
                x={contentX}
                y={afterName + 118 + i * 19}
                textAnchor={anchor}
                fontFamily={FONT}
                fontSize="11.5"
                fontWeight="400"
                fill={p.muted}
              >
                {line}
              </text>
            ))}

          {/* ── Footer: signature, seal, date ────────────────────────── */}
          <line x1="190" x2="810" y1="470" y2="470" stroke={p.hair} strokeWidth="1" />

          <g transform="translate(280 540)">
            {signature && (
              <image
                href={signature}
                x="-95"
                y="-52"
                width="190"
                height="48"
                preserveAspectRatio="xMidYMid meet"
              />
            )}
            <line x1="-95" x2="95" y1="0" y2="0" stroke={p.ink} strokeWidth="0.8" opacity="0.45" />
            <text
              y="22"
              textAnchor="middle"
              fontFamily={FONT}
              fontSize="12"
              fontWeight="600"
              fill={p.ink}
            >
              {design.signer_name.slice(0, 30) || "Authorized signatory"}
            </text>
            <text
              y="39"
              textAnchor="middle"
              fontFamily={FONT}
              fontSize="9"
              fontWeight="500"
              letterSpacing="0.12em"
              fill={p.muted}
            >
              {(design.signer_title || "Instructor").slice(0, 40).toUpperCase()}
            </text>
          </g>

          <Seal cx={500} cy={536} r={40} accent={p.accent} paper={p.paper} ink={p.ink} />

          <g transform="translate(720 540)">
            <line x1="-95" x2="95" y1="0" y2="0" stroke={p.ink} strokeWidth="0.8" opacity="0.45" />
            <text
              y="22"
              textAnchor="middle"
              fontFamily={FONT}
              fontSize="12"
              fontWeight="600"
              fill={p.ink}
            >
              {date}
            </text>
            <text
              y="39"
              textAnchor="middle"
              fontFamily={FONT}
              fontSize="9"
              fontWeight="500"
              letterSpacing="0.12em"
              fill={p.muted}
            >
              DATE OF ISSUE
            </text>
          </g>

          <text
            x="500"
            y="648"
            textAnchor="middle"
            fontFamily={FONT}
            fontSize="9.5"
            fontWeight="500"
            letterSpacing="0.14em"
            fill={p.muted}
          >
            {code} · VERIFIABLE AT ZEROCLUBS.XYZ/CERTIFICATE
          </text>
        </>
      )}
    </svg>
  );

  return sheet;
}

/** The reverse: the learning behind the achievement, set like a title page. */
function BackSheet({
  p,
  style,
  design,
  brand,
  logo,
  signature,
  courseLines,
  code,
  hours,
}: {
  p: Palette;
  style: string;
  design: CertificateDesign;
  brand: string;
  logo: string;
  signature: string;
  courseLines: string[];
  code: string;
  hours?: number;
}) {
  const geometric = ["left", "right", "both", "orbit"].includes(style);
  const textWidth = geometric ? 64 : 78;
  const body = lines(design.back_text, textWidth, 6);
  return (
    <>
      <rect width="1000" height="700" fill={p.band} />
      {geometric && (
        <g opacity="0.14" stroke={p.bandInk} fill="none">
          <circle cx="880" cy="620" r="300" strokeWidth="1.2" />
          <circle cx="880" cy="620" r="220" strokeWidth="1" />
          <circle cx="880" cy="620" r="140" strokeWidth="0.8" />
        </g>
      )}
      <rect x="30" y="30" width="940" height="640" fill="none" stroke={p.bandInk} strokeWidth="0.7" opacity="0.22" />

      {logo && (
        <image
          href={logo}
          x="72"
          y="64"
          width="40"
          height="40"
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <text
        x="124"
        y="92"
        fontFamily={FONT}
        fontSize="12"
        fontWeight="700"
        letterSpacing="0.26em"
        fill={p.bandInk}
      >
        {brand.slice(0, 40).toUpperCase()}
      </text>

      <text
        x="72"
        y="168"
        fontFamily={FONT}
        fontSize="10"
        fontWeight="600"
        letterSpacing="0.34em"
        fill={p.accent}
      >
        THE LEARNING BEHIND THE ACHIEVEMENT
      </text>

      {courseLines.map((line, i) => (
        <text
          key={i}
          x="72"
          y={212 + i * 38}
          fontFamily={FONT}
          fontSize="30"
          fontWeight="600"
          letterSpacing="-0.02em"
          fill={p.bandInk}
        >
          {line}
        </text>
      ))}

      <line x1="72" x2="620" y1={212 + courseLines.length * 38 - 6} y2={212 + courseLines.length * 38 - 6} stroke={p.accent} strokeWidth="1.2" opacity="0.7" />

      {body.map((line, i) => (
        <text
          key={i}
          x="72"
          y={300 + i * 24}
          fontFamily={FONT}
          fontSize="13"
          fontWeight="400"
          fill={p.bandInk}
          opacity="0.82"
        >
          {line}
        </text>
      ))}

      {hours ? (
        <text
          x="72"
          y={300 + body.length * 24 + 26}
          fontFamily={FONT}
          fontSize="12"
          fontWeight="600"
          letterSpacing="0.06em"
          fill={p.bandInk}
          opacity="0.9"
        >
          {hours} HOURS OF LEARNING
        </text>
      ) : null}

      <line x1="72" x2="928" y1="556" y2="556" stroke={p.bandInk} strokeWidth="0.7" opacity="0.25" />

      <g transform="translate(72 600)">
        {signature && (
          <image
            href={signature}
            x="0"
            y="-44"
            width="170"
            height="40"
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        <text fontFamily={FONT} fontSize="12" fontWeight="600" fill={p.bandInk}>
          {design.signer_name.slice(0, 30) || "Authorized signatory"}
        </text>
        <text
          y="18"
          fontFamily={FONT}
          fontSize="9"
          fontWeight="500"
          letterSpacing="0.12em"
          fill={p.bandInk}
          opacity="0.6"
        >
          {(design.signer_title || "Instructor").slice(0, 40).toUpperCase()}
        </text>
      </g>

      <text
        x="928"
        y="600"
        textAnchor="end"
        fontFamily={FONT}
        fontSize="10"
        fontWeight="500"
        letterSpacing="0.12em"
        fill={p.bandInk}
        opacity="0.7"
      >
        CREDENTIAL · {code}
      </text>
      <text
        x="928"
        y="620"
        textAnchor="end"
        fontFamily={FONT}
        fontSize="9.5"
        fontWeight="400"
        fill={p.bandInk}
        opacity="0.55"
      >
        Verify at zeroclubs.xyz/certificate/
        {code.startsWith("SAMPLE") ? "your-certificate-code" : code}
      </text>
    </>
  );
}
