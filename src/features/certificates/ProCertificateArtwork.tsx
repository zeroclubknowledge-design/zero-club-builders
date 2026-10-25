import { useEffect, useId } from "react";
import { certificateFont, certificatePalettes, logoScale, readableOn, safeAccent, type CertificateDesign, type CertificatePalette } from "./design";

/*
 * The PRO certificate collection: Vivid, Achievement, Creative Collective,
 * Aurora and Union. Fronts only; the back uses the shared record layout in
 * PremiumCertificateArtwork, coloured from the same palette.
 *
 * Every colour comes from the design's appearance (background, text, accent,
 * panels, linework), falling back to each template's own palette, so the
 * whole design can be recoloured from the studio.
 *
 * Vivid, Achievement and Union carry two signatures. The second comes from
 * design.cosigner: the person the bootcamp creator assigned, who signs from
 * their own account (sign_bootcamp_certificate). Until they sign, previews
 * show an "awaiting signature" space; issued certificates always have it.
 */

const MONT = "Montserrat, Arial, Helvetica, sans-serif";
const SCRIPT = "'Great Vibes', 'Brush Script MT', cursive";

export const PRO_TEMPLATE_IDS = ["vivid", "achieve", "collective", "aurora", "union"] as const;
export const isProTemplate = (id?: string) => !!id && (PRO_TEMPLATE_IDS as readonly string[]).includes(id);

/** Loads the script face used for names and signatures (once per page). */
function useScriptFont() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("zc-cert-script-font")) return;
    const link = document.createElement("link");
    link.id = "zc-cert-script-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap";
    document.head.appendChild(link);
  }, []);
}

function wrap(text: string, limit: number, max: number) {
  const rows: string[] = [];
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const last = rows.length - 1;
    if (last < 0 || (rows[last].length + word.length + 1 > limit && rows.length < max)) rows.push(word);
    else rows[last] += ` ${word}`;
  }
  return rows;
}

function T({ x, y, children, size = 12, fill, anchor = "start", weight = 400, tracking = 0, maxWidth, font, italic }: {
  x: number; y: number; children: string; size?: number; fill: string; anchor?: "start" | "middle" | "end";
  weight?: number; tracking?: number; maxWidth?: number; font?: string; italic?: boolean;
}) {
  const est = Array.from(children).reduce((s, ch) => s + (/[MW@%]/.test(ch) ? 0.92 : /[ilI.,' :|]/.test(ch) ? 0.3 : 0.62), 0) * size + Math.max(0, children.length - 1) * tracking;
  return (
    <text x={x} y={y} fill={fill} fontFamily={font || "inherit"} fontSize={size} fontWeight={weight} fontStyle={italic ? "italic" : undefined}
      letterSpacing={tracking} textAnchor={anchor}
      {...(maxWidth && est > maxWidth ? { textLength: maxWidth, lengthAdjust: "spacingAndGlyphs" as const } : {})}>{children}</text>
  );
}

/** "Certificate of Completion" → ["Certificate", "Of Completion"]. */
function splitHeading(heading: string, capitalise: boolean) {
  const m = heading.trim().match(/^(.*?)\s+((?:of|for|in)\s.+)$/i);
  if (!m) return [heading.trim(), ""] as const;
  const rest = capitalise ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : m[2].charAt(0).toLowerCase() + m[2].slice(1);
  return [m[1], rest] as const;
}

function yearOf(date: string) {
  const m = date.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : String(new Date().getFullYear());
}

function hexToRgb(hex: string) {
  const v = safeAccent(hex, "#ffffff").slice(1);
  return [0, 2, 4].map((o) => parseInt(v.slice(o, o + 2), 16) / 255);
}

/** A signature image, optionally recoloured to the ink colour, or a space waiting for it. */
function Sig({ href, cx, y, w = 210, h = 60, tint, filterId, ink, placeholder }: {
  href?: string; cx: number; y: number; w?: number; h?: number; tint: boolean; filterId: string; ink: string; placeholder: string;
}) {
  if (!href) {
    return (
      <g>
        <rect x={cx - w / 2} y={y} width={w} height={h} rx={8} fill="none" stroke={ink} strokeOpacity={0.35} strokeDasharray="5 5" />
        <T x={cx} y={y + h / 2 + 4} anchor="middle" size={10} tracking={1.2} fill={ink} weight={600}>{placeholder}</T>
      </g>
    );
  }
  return <image href={href} x={cx - w / 2} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" filter={tint ? `url(#${filterId})` : undefined} />;
}

function Asterisk({ x, y, r, fill, arms = 8, width }: { x: number; y: number; r: number; fill: string; arms?: number; width?: number }) {
  const w = width ?? r * 0.32;
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden>
      {Array.from({ length: arms }, (_, i) => (
        <rect key={i} x={-w / 2} y={-r} width={w} height={r} rx={w * 0.25} fill={fill} transform={`rotate(${(360 / arms) * i})`} />
      ))}
    </g>
  );
}

/** Scalloped badge outline. */
function scallop(r: number, bumps: number, depth: number) {
  return Array.from({ length: bumps * 8 }, (_, i) => {
    const a = (i / (bumps * 8)) * Math.PI * 2;
    const rr = r + Math.cos(a * bumps) * depth;
    return `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  }).join(" ");
}

function Medal({ x, y, r, ribbon, ring, star, fillCenter }: { x: number; y: number; r: number; ribbon: string; ring: string; star: string; fillCenter?: string }) {
  return (
    <g aria-hidden>
      <path d={`M${x - r * 1.25} ${y - r * 2.55}h${r * 0.9}l${r * 0.75} ${r * 1.55}l-${r * 0.45} ${r * 0.55}Z`} fill={ribbon} />
      <path d={`M${x + r * 1.25} ${y - r * 2.55}h-${r * 0.9}l-${r * 0.75} ${r * 1.55}l${r * 0.45} ${r * 0.55}Z`} fill={ribbon} />
      <g transform={`translate(${x} ${y})`}>
        <polygon points={scallop(r, 14, r * 0.07)} fill={fillCenter || "none"} stroke={ring} strokeWidth={r * 0.09} />
        <circle r={r * 0.72} fill="none" stroke={ring} strokeWidth={r * 0.07} />
      </g>
      <Asterisk x={x} y={y} r={r * 0.6} fill={star} arms={8} width={r * 0.28} />
    </g>
  );
}

/** Deterministic organic loops for the Achievement header. */
function organicLoops(seed: number, count: number, w: number, h: number) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return Array.from({ length: count }, () => {
    const cx = rnd() * w, cy = rnd() * h, rx = 18 + rnd() * 46, ry = 10 + rnd() * 26, rot = rnd() * 180;
    return { cx, cy, rx, ry, rot };
  });
}

export function proPalette(design: CertificateDesign): CertificatePalette {
  const base = certificatePalettes[design.template] || certificatePalettes.vivid;
  const a = design.appearance || {};
  return {
    paper: safeAccent(a.background_color, base.paper),
    ink: safeAccent(a.text_color, base.ink),
    muted: safeAccent(a.secondary_text_color, base.muted),
    accent: safeAccent(a.accent_color, base.accent),
    deep: safeAccent(a.panel_color, base.deep),
    metal: safeAccent(a.border_color, base.metal),
  };
}

export function ProCertificateFront({ design, learner, course, code, date }: { design: CertificateDesign; learner: string; course: string; code: string; date: string }) {
  useScriptFont();
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const id = design.template;
  const a = design.appearance || {};
  const p = proPalette(design);
  const body = certificateFont(a.body_font, MONT);
  const head = certificateFont(a.heading_font, MONT);
  const nameFont = a.recipient_font ? certificateFont(a.recipient_font, MONT) : id === "achieve" ? SCRIPT : MONT;
  const titleColor = safeAccent(a.title_color, id === "vivid" ? p.accent : p.ink);
  const nameColor = safeAccent(a.recipient_color, id === "achieve" ? "#0f4d3f" : p.ink);
  const courseColor = safeAccent(a.course_color, p.ink);
  const size = (v: number | undefined, fallback: number, min: number, max: number) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v!)) : fallback);
  const [h1, h2] = splitHeading(a.heading ?? "Certificate of Completion", !["collective", "aurora"].includes(id));
  const label = a.recipient_label ?? (id === "union" ? "This certifies that" : id === "vivid" ? "This certificate is presented to" : "This certificate is proudly presented to");
  const completion = a.completion_text ?? "has successfully completed";
  const recognition = a.recognition_text ?? "Awarded in recognition of commitment, learning and practical development.";
  const brand = (design.use_brand ? design.brand_name.trim() : "Zero Club") || "Zero Club";
  const logo = design.use_brand ? design.brand_logo : "/logo.png";
  const scale = logoScale(design);
  const ornaments = a.show_ornaments !== false;
  const seal = a.show_seal !== false;
  const texture = a.show_texture !== false;
  const sample = code.startsWith("SAMPLE");
  const verify = sample ? "SAMPLE · NOT ISSUED" : `CREDENTIAL ${code} · ZEROCLUBS.XYZ/CERTIFICATE`;
  const co = design.cosigner;
  const darkPaper = readableOn(p.paper) === "#ffffff";
  const tint = darkPaper; // recolour signatures to the ink colour on dark backgrounds
  const [ir, ig, ib] = hexToRgb(p.ink);
  const sigFilter = `${uid}-ink`;
  const sig1 = { href: design.signature_url || undefined, name: design.signer_name || "Authorized signatory", title: design.signer_title || "Instructor" };
  const sig2 = { href: co?.signature_url || undefined, name: co?.name || "Second signatory", title: co?.title || "Co-signatory" };
  const awaiting = "AWAITING SIGNATURE";
  const names = wrap(learner, 28, 2);
  const para = (limit: number, max: number) => wrap(`${completion} ${course}. ${recognition}`.replace(/\.\./g, "."), limit, max);

  const defs = (
    <defs>
      <filter id={sigFilter} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`0 0 0 0 ${ir} 0 0 0 0 ${ig} 0 0 0 0 ${ib} 0 0 0 1 0`} />
      </filter>
      <pattern id={`${uid}-grain`} width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".45" fill={darkPaper ? "#000" : p.muted} opacity={darkPaper ? 0.16 : 0.08} /></pattern>
      <filter id={`${uid}-shadow`} x="-10%" y="-30%" width="130%" height="170%"><feDropShadow dx="10" dy="12" stdDeviation="12" floodOpacity="0.28" /></filter>
      <clipPath id={`${uid}-page`}><rect width="1000" height="700" /></clipPath>
      <clipPath id={`${uid}-header`}><rect width="1000" height="228" /></clipPath>
      <radialGradient id={`${uid}-glow`} cx="0.42" cy="0.95" r="0.62">
        <stop offset="0" stopColor={p.metal} stopOpacity="0.95" />
        <stop offset="0.45" stopColor={p.metal} stopOpacity="0.55" />
        <stop offset="1" stopColor={p.paper} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-arch`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={p.accent} /><stop offset="0.6" stopColor={p.deep} /><stop offset="1" stopColor={p.paper} stopOpacity="0.2" />
      </linearGradient>
      <linearGradient id={`${uid}-disc`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff6d6" /><stop offset="0.55" stopColor="#ffd9ec" /><stop offset="1" stopColor="#ffffff" />
      </linearGradient>
      <radialGradient id={`${uid}-star`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={p.accent} /><stop offset="1" stopColor="#ffffff" />
      </radialGradient>
    </defs>
  );

  const Logo = ({ x, y, h, onDark }: { x: number; y: number; h: number; onDark?: boolean }) => logo ? (
    onDark ? <g><rect x={x} y={y} width={h * 1.25 * scale} height={h * scale} rx={10} fill="#ffffff" /><image href={logo} x={x + 6} y={y + 6} width={h * 1.25 * scale - 12} height={h * scale - 12} preserveAspectRatio="xMidYMid meet" /></g>
      : <image href={logo} x={x} y={y} width={h * 1.6 * scale} height={h * scale} preserveAspectRatio="xMinYMid meet" />
  ) : null;
  const logoW = (h: number, onDark?: boolean) => (onDark ? h * 1.25 : h * 1.6) * scale;

  return (
    <svg viewBox="0 0 1000 700" role="img" aria-label={`${id} certificate front`} xmlns="http://www.w3.org/2000/svg" className="h-auto w-full" style={{ fontFamily: body }}>
      {defs}
      <g clipPath={`url(#${uid}-page)`}>
        <rect width="1000" height="700" fill={p.paper} />

        {id === "vivid" && <>
          <rect width="200" height="700" fill={p.deep} />
          <text transform="translate(162 650) rotate(-90)" fill={p.metal} fontFamily={head} fontSize="150" fontWeight="800" textLength="600" lengthAdjust="spacingAndGlyphs">{h1}</text>
          {ornaments && <>
            {/* Hourglass triangles: bottom of the band and the top-right corner. */}
            <rect y="640" width="200" height="60" fill="#ffffff" />
            {Array.from({ length: 5 }, (_, i) => Array.from({ length: 2 }, (_, j) => (
              <path key={`b${i}${j}`} transform={`translate(${i * 40} ${640 + j * 30})`} d={(i + j) % 2 ? "M0 0h40L20 15ZM0 30h40L20 15Z" : "M0 0v30L20 15ZM40 0v30L20 15Z"} fill={p.deep} />
            )))}
            {Array.from({ length: 4 }, (_, i) => Array.from({ length: 2 }, (_, j) => (
              <path key={`t${i}${j}`} transform={`translate(${820 + i * 45} ${j * 45})`} d={(i + j) % 2 ? "M0 0h45L22.5 22.5ZM0 45h45L22.5 22.5Z" : "M0 0v45L22.5 22.5ZM45 0v45L22.5 22.5Z"} fill={p.accent} />
            )))}
          </>}
          <Logo x={238} y={44} h={46} />
          <T x={238 + logoW(46) + 14} y={80} fill={p.accent} size={26} weight={500} maxWidth={520 - logoW(46)}>{brand}</T>
          <T x={600} y={192} anchor="middle" fill={titleColor} font={head} size={size(a.title_size, 76, 28, 90)} weight={800} maxWidth={640}>{h1}</T>
          {h2 && <T x={600} y={238} anchor="middle" fill={p.accent} font={head} size={30} weight={500} maxWidth={600}>{h2}</T>}
          <T x={600} y={290} anchor="middle" fill={p.ink} size={17} maxWidth={600}>{label}</T>
          <line x1="340" x2="860" y1="310" y2="310" stroke={p.accent} strokeWidth="1.8" />
          <line x1="340" x2="860" y1="390" y2="390" stroke={p.accent} strokeWidth="1.8" />
          {names.map((l, i) => <T key={i} x={600} y={names.length > 1 ? 343 + i * 36 : 365} anchor="middle" fill={nameColor} font={nameFont} size={size(a.recipient_size, names.length > 1 ? 32 : 46, 24, 50)} weight={700} maxWidth={500}>{l}</T>)}
          {para(82, 3).map((l, i) => <T key={i} x={600} y={428 + i * 21} anchor="middle" fill={courseColor} size={14} maxWidth={720}>{l}</T>)}
          <Sig href={sig1.href} cx={310} y={496} tint={tint} filterId={sigFilter} ink={p.ink} placeholder={awaiting} />
          <T x={310} y={584} anchor="middle" fill={p.accent} size={16} weight={700} maxWidth={250}>{sig1.name}</T>
          <T x={310} y={607} anchor="middle" fill={p.ink} size={13} maxWidth={250}>{sig1.title}</T>
          <Sig href={sig2.href} cx={890} y={496} w={190} tint={tint} filterId={sigFilter} ink={p.ink} placeholder={awaiting} />
          <T x={890} y={584} anchor="middle" fill={p.accent} size={16} weight={700} maxWidth={200}>{sig2.name}</T>
          <T x={890} y={607} anchor="middle" fill={p.ink} size={13} maxWidth={200}>{sig2.title}</T>
          {seal && <g transform="translate(600 556)">
            <polygon points={scallop(60, 9, 5)} fill={p.accent} />
            <T x={0} y={-6} anchor="middle" fill={readableOn(p.accent)} size={34} weight={800}>{yearOf(date).slice(0, 2)}</T>
            <T x={0} y={30} anchor="middle" fill={readableOn(p.accent)} size={34} weight={800}>{yearOf(date).slice(2)}</T>
          </g>}
          <T x={600} y={668} anchor="middle" fill={p.muted} size={8.5} tracking={0.8} maxWidth={720}>{verify}</T>
        </>}

        {id === "achieve" && <>
          <rect width="1000" height="228" fill={p.deep} />
          {ornaments && <g clipPath={`url(#${uid}-header)`} opacity="0.16" fill="none" stroke={readableOn(p.deep) === "#ffffff" ? "#000000" : "#ffffff"} strokeWidth="3">
            {organicLoops(7, 150, 1000, 228).map((l, i) => <ellipse key={i} cx={l.cx} cy={l.cy} rx={l.rx * 0.55} ry={l.ry * 0.55} transform={`rotate(${l.rot} ${l.cx} ${l.cy})`} />)}
          </g>}
          <T x={78} y={128} fill={safeAccent(a.title_color, readableOn(p.deep))} font={head} size={size(a.title_size, 78, 28, 90)} weight={800} maxWidth={560}>{h1}</T>
          {h2 && <T x={78} y={178} fill={readableOn(p.deep)} font={head} size={40} maxWidth={560}>{h2}</T>}
          <Logo x={820} y={44} h={74} onDark />
          <T x={820 + logoW(74, true) / 2} y={172} anchor="middle" fill={readableOn(p.deep)} size={22} maxWidth={230}>{brand}</T>
          <T x={500} y={282} anchor="middle" fill={p.ink} size={19} weight={700} maxWidth={720}>{label}</T>
          {names.map((l, i) => <T key={i} x={500} y={names.length > 1 ? 330 + i * 46 : 360} anchor="middle" fill={nameColor} font={nameFont} size={size(a.recipient_size, names.length > 1 ? 44 : 60, 24, 66)} maxWidth={720}>{l}</T>)}
          {para(70, 3).map((l, i) => <T key={i} x={500} y={418 + i * 22} anchor="middle" fill={courseColor} size={15.5} maxWidth={720}>{l}</T>)}
          {seal && <Medal x={500} y={576} r={26} ribbon={p.accent} ring={p.accent} star={p.metal} fillCenter={p.paper} />}
          <Sig href={sig1.href} cx={290} y={512} w={220} h={58} tint={tint} filterId={sigFilter} ink={p.ink} placeholder={awaiting} />
          <line x1="190" x2="390" y1="578" y2="578" stroke={p.ink} strokeOpacity="0.25" />
          <T x={290} y={600} anchor="middle" fill={p.ink} size={15} weight={700} maxWidth={250}>{sig1.name}</T>
          <T x={290} y={622} anchor="middle" fill={p.muted} size={14} maxWidth={250}>{sig1.title}</T>
          <Sig href={sig2.href} cx={710} y={512} w={220} h={58} tint={tint} filterId={sigFilter} ink={p.ink} placeholder={awaiting} />
          <line x1="610" x2="810" y1="578" y2="578" stroke={p.ink} strokeOpacity="0.25" />
          <T x={710} y={600} anchor="middle" fill={p.ink} size={15} weight={700} maxWidth={250}>{sig2.name}</T>
          <T x={710} y={622} anchor="middle" fill={p.muted} size={14} maxWidth={250}>{sig2.title}</T>
          <T x={500} y={672} anchor="middle" fill={p.muted} size={8.5} tracking={0.8} maxWidth={720}>{verify}</T>
        </>}

        {id === "collective" && <>
          {texture && <rect width="1000" height="700" fill={`url(#${uid}-grain)`} />}
          {ornaments && <g fill="none" stroke={p.metal} strokeWidth="1.4" opacity="0.7">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={`a${i}`} d={`M${560 + i * 26} -10 C ${600 + i * 30} ${90 + i * 8}, ${760 + i * 18} ${40 + i * 14}, ${1010} ${170 - i * 12}`} />)}
            {[0, 1, 2, 3, 4].map((i) => <ellipse key={`b${i}`} cx="1000" cy="250" rx={60 + i * 34} ry={44 + i * 26} />)}
            {[0, 1, 2, 3].map((i) => <ellipse key={`c${i}`} cx="80" cy="0" rx={120 + i * 40} ry={60 + i * 22} />)}
            {[0, 1, 2, 3].map((i) => <ellipse key={`d${i}`} cx="520" cy="720" rx={160 + i * 40} ry={50 + i * 20} />)}
          </g>}
          <rect x="0" y="86" width="400" height="112" fill={p.deep} filter={`url(#${uid}-shadow)`} />
          <Logo x={52} y={108} h={68} />
          <T x={52 + logoW(68) + 14} y={150} fill={readableOn(p.deep)} size={20} weight={500} maxWidth={320 - logoW(68)}>{brand}</T>
          <line x1="0" x2="1000" y1="231" y2="231" stroke={p.ink} strokeWidth="1.6" />
          {seal && <g aria-hidden>
            <path d="M705 231h62l55 104-30 22Z" fill={p.ink} /><path d="M905 231h-62l-55 104 30 22Z" fill={p.ink} />
            <g transform="translate(805 418)"><polygon points={scallop(72, 14, 5)} fill="none" stroke={p.ink} strokeWidth="6" /><circle r="52" fill="none" stroke={p.ink} strokeWidth="5" /></g>
            <Asterisk x={805} y={418} r={44} fill={p.accent} arms={8} width={18} />
          </g>}
          <T x={55} y={332} fill={titleColor} font={head} size={size(a.title_size, 78, 28, 90)} weight={700} maxWidth={600}>{h1}</T>
          {h2 && <T x={55} y={384} fill={p.ink} font={head} size={40} maxWidth={600}>{h2}</T>}
          <T x={55} y={428} fill={p.muted} size={13.5} maxWidth={600}>{label}</T>
          <T x={55} y={466} fill={nameColor} font={nameFont} size={size(a.recipient_size, 34, 24, 44)} weight={700} maxWidth={600}>{learner}</T>
          <T x={55} y={498} fill={p.muted} size={13} maxWidth={600}>{completion}</T>
          {wrap(course.toUpperCase(), 44, 2).map((l, i) => <T key={i} x={55} y={528 + i * 25} fill={courseColor} size={size(a.course_size, 21, 14, 24)} weight={700} maxWidth={600}>{l}</T>)}
          <line x1="55" x2="520" y1={course.length > 44 ? 568 : 545} y2={course.length > 44 ? 568 : 545} stroke={p.ink} strokeWidth="1.8" />
          <Sig href={sig1.href} cx={150} y={584} w={200} h={52} tint={tint} filterId={sigFilter} ink={p.ink} placeholder={awaiting} />
          <line x1="55" x2="245" y1="642" y2="642" stroke={p.ink} strokeWidth="1" />
          <T x={55} y={662} fill={p.ink} size={13} weight={700} maxWidth={300}>{sig1.name}</T>
          <T x={55} y={681} fill={p.muted} size={11.5} maxWidth={300}>{sig1.title}</T>
          <T x={945} y={681} anchor="end" fill={p.muted} size={8.5} tracking={0.8} maxWidth={420}>{`${date} · ${verify}`}</T>
        </>}

        {id === "aurora" && <>
          <rect width="1000" height="700" fill={`url(#${uid}-glow)`} />
          {texture && <rect width="1000" height="700" fill={`url(#${uid}-grain)`} />}
          {ornaments && <g aria-hidden>
            {[{ y: 30, h: 320 }, { y: 388, h: 300 }].map((g, gi) => (
              <g key={gi}>
                {[0, 1, 2].map((k) => {
                  const x = 772 + k * 0, top = g.y + k * 72, w = 200 - k * 0, hgt = g.h - k * 72;
                  return <path key={k} d={`M${x} ${top + hgt}V${top + 100}a100 100 0 0 1 ${w} 0V${top + hgt}Z`} fill={`url(#${uid}-arch)`} opacity={0.35 + k * 0.25} />;
                })}
                <path d={`M${812} ${g.y + g.h * 0.55}a60 60 0 0 1 120 0Z`} fill={`url(#${uid}-disc)`} />
                <path d={`M${812} ${g.y + g.h * 0.55}a60 60 0 0 0 120 0Z`} fill={`url(#${uid}-disc)`} opacity="0.85" />
              </g>
            ))}
          </g>}
          {seal && <Asterisk x={660} y={318} r={62} fill={`url(#${uid}-star)`} arms={8} width={24} />}
          <Logo x={50} y={38} h={46} onDark />
          <T x={50 + logoW(46, true) + 14} y={70} fill={p.ink} size={20} weight={600} tracking={1} maxWidth={420}>{brand.toUpperCase()}</T>
          <T x={50} y={205} fill={titleColor} font={head} size={size(a.title_size, 94, 28, 100)} weight={800} maxWidth={620}>{h1}</T>
          {h2 && <T x={50} y={268} fill={p.ink} font={head} size={54} maxWidth={620}>{h2}</T>}
          <T x={50} y={330} fill={p.muted} size={14} maxWidth={560}>{label}</T>
          <T x={50} y={372} fill={nameColor} font={nameFont} size={size(a.recipient_size, 36, 24, 46)} weight={700} maxWidth={560}>{learner}</T>
          <T x={50} y={405} fill={p.muted} size={14} maxWidth={560}>{completion}</T>
          {wrap(course, 30, 2).map((l, i) => <T key={i} x={50} y={444 + i * 32} fill={courseColor} size={size(a.course_size, 30, 14, 34)} maxWidth={560}>{l}</T>)}
          {wrap(recognition, 66, 2).map((l, i) => <T key={i} x={50} y={(course.length > 30 ? 520 : 488) + i * 19} fill={p.muted} size={13} maxWidth={560}>{l}</T>)}
          <Sig href={sig1.href} cx={160} y={548} w={220} h={52} tint={tint} filterId={sigFilter} ink={p.ink} placeholder={awaiting} />
          <T x={50} y={624} fill={p.ink} size={24} maxWidth={360}>{sig1.name}</T>
          <line x1="50" x2="320" y1="636" y2="636" stroke={p.ink} strokeWidth="1.6" />
          <T x={50} y={660} fill={p.muted} size={15} maxWidth={360}>{sig1.title}</T>
          <T x={950} y={684} anchor="end" fill={p.muted} size={8.5} tracking={0.8} maxWidth={420}>{`${date} · ${verify}`}</T>
        </>}

        {id === "union" && <>
          {texture && <rect width="1000" height="700" fill={`url(#${uid}-grain)`} />}
          {ornaments && <g fill="none" stroke={p.metal} strokeWidth="14" strokeLinecap="round">
            <path d="M700 -20C650 110 720 190 820 186C900 183 955 156 1020 146" />
            <path d="M-20 668C120 652 230 590 330 582C420 575 452 640 446 720" />
          </g>}
          {seal && <><Asterisk x={662} y={276} r={32} fill={p.accent} arms={8} width={9} /><Asterisk x={372} y={424} r={21} fill={p.accent} arms={8} width={6.5} /></>}
          <Logo x={70} y={62} h={36} onDark />
          <T x={70 + logoW(36, true) + 12} y={88} fill={p.ink} size={22} weight={700} maxWidth={360}>{brand}</T>
          {(() => {
            const t = Date.parse(date);
            const valid = Number.isFinite(t) && !/completion/i.test(date);
            const d = valid ? new Date(t) : null;
            return <>
              <T x={932} y={86} anchor="end" fill={p.ink} size={18} weight={700}>{d ? d.toLocaleDateString(undefined, { weekday: "long" }) : "Issued"}</T>
              <T x={932} y={110} anchor="end" fill={p.ink} size={18} maxWidth={260}>{d ? d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : date}</T>
            </>;
          })()}
          <T x={70} y={222} fill={titleColor} font={head} size={size(a.title_size, 100, 28, 110)} weight={800} maxWidth={560}>{h1}</T>
          {h2 && <T x={70} y={298} fill={p.ink} font={head} size={50} weight={800} maxWidth={560}>{h2}</T>}
          <T x={70} y={392} fill={p.muted} size={16} maxWidth={400}>{label}</T>
          {(() => {
            const parts = learner.trim().split(/\s+/);
            const lines = parts.length > 1 ? [parts.slice(0, Math.ceil(parts.length / 2)).join(" "), parts.slice(Math.ceil(parts.length / 2)).join(" ")] : [learner];
            return lines.map((l, i) => <T key={i} x={70} y={450 + i * 60} fill={nameColor} font={nameFont} size={size(a.recipient_size, 56, 24, 60)} weight={800} maxWidth={400}>{l}</T>);
          })()}
          <line x1="510" x2="1000" y1="385" y2="385" stroke={p.accent} strokeWidth="2" />
          {para(52, 5).map((l, i) => <T key={i} x={510} y={430 + i * 24} fill={courseColor} size={14} maxWidth={420}>{l}</T>)}
          <Sig href={sig1.href} cx={605} y={540} w={190} h={56} tint={tint} filterId={sigFilter} ink={p.ink} placeholder={awaiting} />
          <T x={605} y={622} anchor="middle" fill={p.ink} size={17} weight={700} maxWidth={200}>{sig1.name}</T>
          <T x={605} y={642} anchor="middle" fill={p.muted} size={12} maxWidth={200}>{sig1.title}</T>
          <Sig href={sig2.href} cx={845} y={540} w={190} h={56} tint={tint} filterId={sigFilter} ink={p.ink} placeholder={awaiting} />
          <T x={845} y={622} anchor="middle" fill={p.ink} size={17} weight={700} maxWidth={200}>{sig2.name}</T>
          <T x={845} y={642} anchor="middle" fill={p.muted} size={12} maxWidth={200}>{sig2.title}</T>
          <T x={932} y={684} anchor="end" fill={p.muted} size={8.5} tracking={0.8} maxWidth={420}>{verify}</T>
        </>}
      </g>
    </svg>
  );
}
