import { useId } from "react";
import { ProCertificateFront, isProTemplate } from "./ProCertificateArtwork";
import { certificateTemplates, certificatePalette, certificateFont, logoScale, readableOn, safeAccent, type CertificateDesign, type CertificatePalette } from "./design";

// Static system faces keep exported SVG/PDF weights consistent with the preview.
const SANS = "Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
type Palette = CertificatePalette;

/** Wrap without dropping names or programme text; long tokens fit via textLength. */
function wrap(text: string, limit: number, max: number) {
  const rows: string[] = [];
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const last = rows.length - 1;
    if (last < 0 || (rows[last].length + word.length + 1 > limit && rows.length < max)) rows.push(word);
    else rows[last] += ` ${word}`;
  }
  return rows;
}

function Type({ x, y, children, size = 12, fill, center = false, serif = false, weight = 400, tracking = 0, maxWidth, font }: {
  x: number; y: number; children: string; size?: number; fill: string; center?: boolean; serif?: boolean;
  weight?: number; tracking?: number; maxWidth?: number; font?: string;
}) {
  const estimated = Array.from(children).reduce((sum, ch) => sum + (/[MW@%]/.test(ch) ? .9 : /[ilI.,' :]/.test(ch) ? .3 : .59), 0) * size + Math.max(0, children.length - 1) * tracking;
  return <text x={x} y={y} fill={fill} fontFamily={font || (serif ? SERIF : "inherit")} fontSize={size} fontWeight={weight}
    letterSpacing={tracking} textAnchor={center ? "middle" : "start"}
    {...(maxWidth && estimated > maxWidth ? { textLength: maxWidth, lengthAdjust: "spacingAndGlyphs" as const } : {})}>{children}</text>;
}

/** An issuer's decorative completion seal, with no external accreditation claim. */
function CompletionSeal({ x, y, p, r = 35 }: { x: number; y: number; p: Palette; r?: number }) {
  const petals = Array.from({ length: 96 }, (_, i) => {
    const a = i * Math.PI / 48, radius = r + (i % 2 ? -2 : 2);
    return `${Math.cos(a) * radius},${Math.sin(a) * radius}`;
  }).join(" ");
  return <g transform={`translate(${x} ${y})`} aria-label="Issuer completion seal">
    <polygon points={petals} fill={p.paper} stroke={p.metal} strokeWidth=".8" />
    <circle r={r - 5} fill="none" stroke={p.accent} strokeWidth=".7" />
    <circle r={r - 9} fill="none" stroke={p.metal} strokeWidth=".5" />
    <path d="M-10 -2l7 7 14-16" fill="none" stroke={p.accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <Type x={0} y={17} size={5.6} tracking={.9} center fill={p.ink} weight={600}>COMPLETION</Type>
  </g>;
}

function Ornament({ id, p, reverse }: { id: string; p: Palette; reverse?: boolean }) {
  const line = p.metal;
  return <g aria-hidden="true">
    {id === "folio" && <>
      <rect x="24" y="24" width="952" height="652" fill="none" stroke={line} strokeWidth="1.1" />
      <rect x="30" y="30" width="940" height="640" fill="none" stroke={line} strokeWidth=".45" />
      <rect x="43" y="43" width="914" height="614" fill="none" stroke={line} strokeWidth=".6" />
      {[[43,43,1,1],[957,43,-1,1],[43,657,1,-1],[957,657,-1,-1]].map(([x,y,sx,sy],i)=><g key={i} transform={`translate(${x} ${y}) scale(${sx} ${sy})`}>
        <path d="M0 62V0h62M7 42V7h35M0 24Q24 24 24 0M0 36Q36 36 36 0" fill="none" stroke={line} strokeWidth=".7" />
        <path d="M10 10l5-5 5 5-5 5Z" fill={line} />
      </g>)}
    </>}
    {id === "cobalt" && <>
      <rect width="12" height="700" fill={p.deep} /><rect x="12" width="5" height="700" fill={p.accent} />
      <rect x="40" y="32" width="922" height="636" fill="none" stroke={p.accent} strokeWidth=".55" opacity=".3" />
      <path d="M820 0h180v175L820 0Z" fill={p.deep} /><path d="M891 0h109v105Z" fill={p.accent} />
      <path d="M828 0l172 172" stroke={line} strokeWidth="2" /><rect x="800" y="666" width="162" height="2" fill={p.accent} />
    </>}
    {id === "spectrum" && <>
      <rect x="890" width="110" height="700" fill={p.deep} /><path d="M890 0h110v195L890 85Z" fill={p.accent} />
      <g stroke={line} strokeWidth=".65" fill="none" opacity=".6">
        {Array.from({length:8},(_,i)=><path key={i} d={`M${910+i*11} 690V${240+i*21}`} />)}
        <circle cx="945" cy="165" r="35" /><circle cx="945" cy="165" r="24" />
      </g><path d="M65 43h92M65 43v22M65 657h92" stroke={line} strokeWidth="1" />
    </>}
    {id === "coral" && <>
      <rect x="26" y="26" width="948" height="648" fill="none" stroke={line} strokeWidth=".6" />
      <path d="M1000 360V700H775c-52-155 41-281 225-340Z" fill={p.deep} />
      <path d="M1000 407V700H839c-39-122 27-231 161-293Z" fill={p.accent} />
      <path d="M1000 443C885 499 841 587 873 700" fill="none" stroke={line} strokeWidth="1.3" />
      <path d="M55 26v88l13-8 13 8V26" fill={p.accent} /><circle cx="931" cy="608" r="33" fill="none" stroke={line} strokeWidth=".7" />
    </>}
    {id === "mosaic" && <>
      <rect x="26" y="26" width="948" height="648" fill="none" stroke={line} strokeWidth=".8" />
      {[34,934].map(x=><g key={x}>
        <rect x={x} y="34" width="32" height="632" fill={p.deep} />
        {Array.from({length:18},(_,i)=><g key={i} transform={`translate(${x} ${34+i*35})`}>
          <path d="M0 0h32v32H0Z" fill="none" stroke={line} strokeWidth=".3" />
          <path d={i%2 ? "M0 0Q32 0 32 32H0Z" : "M0 32Q0 0 32 0v32Z"} fill={p.accent} />
          <path d="M8 16l8-8 8 8-8 8Z" fill="none" stroke={line} strokeWidth=".45" />
        </g>)}
      </g>)}<path d="M78 40h844M78 660h844" stroke={line} strokeWidth=".6" />
    </>}
    {id === "orbit" && <>
      <path d="M0 0h1000v18H0ZM0 682h1000v18H0Z" fill={p.deep} />
      <g fill="none" stroke={p.accent} opacity={reverse ? .17 : .11}>
        {[110,135,160,185,210].map(r=><circle key={r} cx="970" cy="60" r={r} strokeWidth=".65" />)}
        {[85,110,135,160].map(r=><circle key={r} cx="20" cy="670" r={r} strokeWidth=".65" />)}
      </g><path d="M43 150V43h107M850 657h107V550" fill="none" stroke={line} strokeWidth=".8" />
      <g fill={p.accent}>{[[43,43],[957,657],[150,43],[850,657]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2.3" />)}</g>
    </>}
  </g>;
}

export type CertificateArtworkProps = { design: CertificateDesign; side?: "front" | "back"; learner?: string; course?: string; code?: string; date?: string; hours?: number };

export function PremiumCertificateArtwork({ design, side = "front", learner = "Alex Morgan", course = "Your bootcamp title", code = "SAMPLE · NOT ISSUED", date = "Completion date", hours }: CertificateArtworkProps) {
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  // PRO collection fronts have their own layouts; their backs use the shared record below.
  if (side !== "back" && isProTemplate(design.template)) return <ProCertificateFront design={design} learner={learner} course={course} code={code} date={date} />;
  const template = certificateTemplates.find(t=>t.id===design.template) || certificateTemplates[0];
  const a = design.appearance || {};
  const p = certificatePalette(design, side);
  const centered = a.alignment === "center" || (a.alignment !== "left" && ["folio","mosaic","orbit"].includes(template.id));
  const bodyFont = certificateFont(a.body_font, isProTemplate(design.template) ? "Montserrat, Arial, Helvetica, sans-serif" : SANS);
  const nameFont = certificateFont(a.recipient_font, SERIF);
  const titleColor = safeAccent(a.title_color, p.ink);
  const nameColor = safeAccent(a.recipient_color, p.ink);
  const courseColor = safeAccent(a.course_color, p.ink);
  const panelText = safeAccent(a.panel_text_color, readableOn(p.deep));
  const size = (value: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(value) ? Math.max(min,Math.min(max,value!)) : fallback;
  const x = centered ? 500 : 88, width = centered ? 780 : 690;
  const brand = (design.use_brand ? design.brand_name.trim() : "Zero Club") || "Zero Club";
  const logo = design.use_brand ? design.brand_logo : "/logo.png";
  const scale = logoScale(design), logoH = 36 * scale, logoW = 120 * scale;
  const names = wrap(learner, 34, 2), courses = wrap(course, 55, 3);
  const back = side === "back", sample = code.startsWith("SAMPLE");
  const verifyUrl = `https://zeroclubs.xyz/certificate/${encodeURIComponent(code)}`;
  const typography = { fill:p.ink, center:centered, maxWidth:width };
  const rule = (y: number) => <line x1={centered?140:88} x2={centered?860:778} y1={y} y2={y} stroke={p.metal} strokeWidth=".6" opacity=".65" />;
  const pro = isProTemplate(design.template);
  const title = certificateFont(a.heading_font, pro ? "Montserrat, Arial, Helvetica, sans-serif" : template.id === "cobalt" || template.id === "orbit" ? SANS : SERIF);
  // On a dark (PRO) background the logo sits on a white tile so it never disappears.
  const logoTile = pro && readableOn(p.paper) === "#ffffff";
  const metadata = (label:string,value:string,mx:number,my:number,mw=250) => <g>
    <Type x={mx} y={my} fill={p.muted} size={8} tracking={1.6} weight={600}>{label}</Type>
    <Type x={mx} y={my+24} fill={label==="ISSUED TO"?nameColor:p.ink} size={12} weight={500} maxWidth={mw}>{value}</Type>
  </g>;
  return <svg viewBox="0 0 1000 700" role="img" aria-label={`${template.name} certificate ${side}`} xmlns="http://www.w3.org/2000/svg" className="h-auto w-full" style={{fontFamily:bodyFont}}>
    <defs><pattern id={`${uid}-grain`} width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".35" fill={p.muted} opacity=".1" /></pattern></defs>
    <rect width="1000" height="700" fill={p.paper} />{a.show_texture !== false && <rect width="1000" height="700" fill={`url(#${uid}-grain)`} />}
    {a.show_ornaments !== false && <Ornament id={template.id} p={p} reverse={back} />}
    {!back ? <>
      {logo && <image href={logo} x={centered?500-logoW/2:88} y="55" width={logoW} height={logoH} preserveAspectRatio="xMidYMid meet" />}
      <Type x={centered?500:88+logoW+18} y={centered?150:81+logoH/2} {...typography} maxWidth={centered?680:600-logoW} center={centered} size={12} weight={600} tracking={2.2}>{brand.toUpperCase()}</Type>
      <Type x={x} y={220} center={centered} font={title} size={size(a.title_size,template.id==="cobalt"?39:43,28,48)} tracking={-1} fill={titleColor} maxWidth={width}>{a.heading ?? "Certificate of Completion"}</Type>
      <Type x={x} y={262} {...typography} size={9} tracking={2.6} weight={500}>{a.recipient_label ?? "THIS CERTIFIES THAT"}</Type>
      {names.map((line,i)=><Type key={i} x={x} y={names.length>1?306+i*39:325} {...typography} fill={nameColor} size={size(a.recipient_size,names.length>1?36:46,24,names.length>1?40:50)} font={nameFont}>{line}</Type>)}
      <Type x={x} y={381} {...typography} fill={p.muted} size={11}>{a.completion_text ?? "has successfully completed the programme"}</Type>
      {courses.map((line,i)=><Type key={i} x={x} y={414+i*24} {...typography} fill={courseColor} size={size(a.course_size,courses.length>2?17:21,14,24)} weight={600}>{line}</Type>)}
      {courses.length<3 && <Type x={x} y={477} {...typography} size={10} fill={p.muted}>{a.recognition_text ?? "Awarded in recognition of commitment, learning and practical development."}</Type>}
      {rule(500)}
      <g>
        {design.signature_url && <rect x={centered?170:84} y="512" width="188" height="48" fill={safeAccent(a.signature_background_color,readableOn(p.paper)==="#ffffff"?"#ffffff":p.paper)} />}
        {design.signature_url && <image href={design.signature_url} x={centered?174:88} y="516" width="180" height="40" preserveAspectRatio="xMidYMid meet" />}
        <line x1={centered?174:88} x2={centered?354:268} y1="562" y2="562" stroke={p.ink} strokeWidth=".65" />
        <Type x={centered?264:88} y={582} center={centered} fill={p.ink} size={11} weight={600} maxWidth={190}>{design.signer_name || "Authorized signatory"}</Type>
        <Type x={centered?264:88} y={600} center={centered} fill={p.muted} size={8} tracking={1} maxWidth={190}>{(design.signer_title || "Instructor").toUpperCase()}</Type>
      </g>
      {a.show_seal !== false && <CompletionSeal x={centered?500:440} y={553} p={p} />}
      <Type x={centered?736:620} y={553} center={centered} fill={p.ink} size={11} maxWidth={180}>{date}</Type>
      <line x1={centered?646:620} x2={centered?826:778} y1="562" y2="562" stroke={p.ink} strokeWidth=".65" />
      <Type x={centered?736:620} y={582} center={centered} fill={p.muted} size={8} tracking={1.4}>DATE OF ISSUE</Type>
      <a href={sample?undefined:verifyUrl} aria-label={sample?"Sample certificate":`Verify certificate ${code}`}>
        <Type x={500} y={640} fill={p.muted} center size={8.5} tracking={.8} maxWidth={centered?780:710}>{sample ? "SAMPLE · NOT ISSUED" : `CREDENTIAL ${code}  ·  ZEROCLUBS.XYZ/CERTIFICATE`}</Type>
      </a>
    </> : <>
      {logo && logoTile && <rect x="80" y="50" width={logoW + 16} height={logoH + 16} rx="10" fill="#ffffff" />}
      {logo && <image href={logo} x="88" y="58" width={logoW} height={logoH} preserveAspectRatio="xMidYMid meet" />}
      <Type x={88+logoW+18} y={84+logoH/2} fill={p.ink} size={11} weight={600} tracking={1.6} maxWidth={630-logoW}>{brand.toUpperCase()}</Type>
      <Type x={88} y={176} fill={p.accent} size={9} tracking={2.4} weight={600}>RECORD OF COMPLETION</Type>
      {wrap(course,43,2).map((line,i)=><Type key={i} x={88} y={222+i*34} fill={courseColor} font={title} size={31} maxWidth={560}>{line}</Type>)}
      <line x1="88" x2="650" y1="281" y2="281" stroke={p.metal} strokeWidth=".6" />
      <Type x={88} y={311} fill={p.muted} size={8} weight={600} tracking={1.6}>PROGRAMME NOTE</Type>
      {wrap(design.back_text || "Awarded in recognition of practical learning, commitment and demonstrated achievement.",70,6).map((line,i)=><Type key={i} x={88} y={340+i*20} fill={p.ink} size={11.5} maxWidth={550}>{line}</Type>)}
      {metadata("ISSUED TO",learner,88,496,320)}{metadata("DATE OF ISSUE",date,430,496,210)}
      {metadata(design.cosigner?.name ? "SIGNED BY" : "AUTHORIZED SIGNATORY",[design.signer_name || "Authorized signatory", design.cosigner?.name].filter(Boolean).join("  ·  "),88,563,320)}
      {metadata(hours&&hours>0?"LEARNING HOURS":"CREDENTIAL TYPE",hours&&hours>0?`${hours} hours`:"Certificate of completion",430,563,210)}
      <rect x="690" y="304" width="160" height="296" fill={p.deep} /><path d="M704 318h132v268H704Z" fill="none" stroke={p.metal} strokeWidth=".5" opacity=".6" />
      {a.show_seal !== false && <CompletionSeal x={770} y={365} p={p} r={29} />}
      <Type x={770} y={429} fill={panelText} size={9} weight={600} center tracking={1.5}>ISSUER RECORD</Type>
      <Type x={770} y={451} fill={panelText} size={9} center maxWidth={126}>{sample?"Sample · not issued":code}</Type>
      <line x1="719" x2="821" y1="473" y2="473" stroke={panelText} strokeWidth=".5" opacity=".35" />
      <a href={sample?undefined:verifyUrl} aria-label={sample?"Sample verification details":`Verify certificate ${code}`}>
        <Type x={770} y={501} fill={panelText} size={8} weight={600} center>Verify this credential</Type>
        <Type x={770} y={525} fill={panelText} size={7} center>zeroclubs.xyz/certificate/</Type>
        <Type x={770} y={544} fill={panelText} size={7.5} center maxWidth={123}>{sample?"your-certificate-code":code}</Type>
      </a>
      <Type x={88} y={639} fill={p.muted} size={8} maxWidth={750}>This record accompanies the certificate. Verify the issued details and current status using the credential link.</Type>
    </>}
  </svg>;
}
