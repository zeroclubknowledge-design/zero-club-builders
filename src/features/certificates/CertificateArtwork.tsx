import { useId } from "react";
import { supabase } from "@/lib/supabase";
import { certificateTemplates, type CertificateDesign } from "./design";

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

/** Vector artwork stays crisp in previews and on both printed A4 landscape pages. */
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
  const id = useId().replace(/:/g, "");
  const t = certificateTemplates.find((t) => t.id === design.template) || certificateTemplates[0];
  const brand = design.use_brand ? design.brand_name : "Zero Club";
  const asset = (url: string) =>
    url.includes("/storage/v1/object/public/certificate-assets/")
      ? supabase.storage
          .from("certificate-assets")
          .getPublicUrl(url.split("/storage/v1/object/public/certificate-assets/")[1]).data
          .publicUrl
      : url;
  const logo = design.use_brand ? asset(design.brand_logo) : "/logo.png";
  const back = side === "back";
  const geometric = ["left", "right", "both", "orbit"].includes(t.style);
  const x = t.style === "left" ? 285 : t.style === "right" || t.style === "orbit" ? 75 : 500;
  const centered = t.style === "border" || t.style === "both" || t.style === "ribbon";
  const anchor = centered ? "middle" : "start";
  const width = centered ? 44 : 36;
  return (
    <svg
      viewBox="0 0 1000 700"
      role="img"
      aria-label={`${t.name} certificate ${side}`}
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      <defs>
        <pattern id={id} width="140" height="140" patternUnits="userSpaceOnUse">
          <rect width="140" height="140" fill={t.color} />
          <path d="M0 0H70V70H0Z" fill={t.style === "orbit" ? "#bfee36" : "#f7be48"} />
          <path
            d="M70 0A70 70 0 0 1 140 70H70Z"
            fill={t.style === "both" ? "#82d4cc" : "#fa9cbd"}
          />
          <path d="M0 70A70 70 0 0 0 70 140V70Z" fill="#173a56" />
          <circle cx="108" cy="108" r="26" fill={t.style === "orbit" ? "#cbe823" : "#8fa8de"} />
        </pattern>
      </defs>
      <rect width="1000" height="700" fill={back ? t.color : "#fffefa"} />
      {back ? (
        <>
          {geometric && <rect x="810" width="190" height="700" fill={`url(#${id})`} />}
          <text x="75" y="104" fill="white" fontSize="20" letterSpacing="5">
            THE LEARNING BEHIND THE ACHIEVEMENT
          </text>
          {lines(course, 36, 2).map((line, i) => (
            <text key={i} x="75" y={192 + i * 48} fill="white" fontSize="39" fontWeight="700">
              {line}
            </text>
          ))}
          {lines(design.back_text, 68, 5).map((line, i) => (
            <text key={i} x="75" y={330 + i * 26} fill="white" fontSize="19">
              {line}
            </text>
          ))}
          {hours ? (
            <text x="75" y="490" fill="white" fontSize="18">
              {hours} hours of learning
            </text>
          ) : null}
          <line x1="75" x2="730" y1="535" y2="535" stroke="white" opacity=".4" />
          <text x="75" y="575" fill="white" fontSize="24" fontWeight="700">
            {brand.slice(0, 42)}
          </text>
          {logo && (
            <>
              <rect x="700" y="548" width="70" height="70" rx="12" fill="white" />
              <image
                href={logo}
                x="708"
                y="556"
                width="54"
                height="54"
                preserveAspectRatio="xMidYMid meet"
              />
            </>
          )}
          <text x="75" y="610" fill="white" fontSize="15">
            Credential · {code}
          </text>
          <text x="75" y="641" fill="white" fontSize="14">
            Verify at zeroclubs.xyz/certificate/
            {code.startsWith("SAMPLE") ? "your-certificate-code" : code}
          </text>
        </>
      ) : (
        <>
          {t.style === "border" && (
            <>
              <rect
                x="20"
                y="20"
                width="960"
                height="660"
                rx="12"
                fill="none"
                stroke="#202329"
                strokeWidth="3"
              />
              <rect x="30" y="30" width="940" height="640" rx="8" fill="none" stroke="#d5d0c4" />
            </>
          )}
          {geometric && (
            <>
              {(t.style === "left" || t.style === "both") && (
                <rect width={t.style === "both" ? 145 : 220} height="700" fill={`url(#${id})`} />
              )}
              {t.style !== "left" && (
                <rect
                  x={t.style === "both" ? 855 : 780}
                  width="220"
                  height="700"
                  fill={`url(#${id})`}
                />
              )}
            </>
          )}
          {t.style === "ribbon" && <path d="M830 0H925V170L878 145L830 170Z" fill={t.color} />}
          {logo && (
            <image
              href={logo}
              x={centered ? 468 : x}
              y="60"
              width="64"
              height="64"
              preserveAspectRatio="xMidYMid meet"
            />
          )}
          <text x={x} y="151" textAnchor={anchor} fontSize="17" fontWeight="700" fill="#25282e">
            {brand.slice(0, 38)}
          </text>
          <text
            x={x}
            y="217"
            textAnchor={anchor}
            fontSize={t.style === "both" ? 42 : 46}
            fontWeight="700"
            fill="#15191f"
          >
            CERTIFICATE
          </text>
          <text x={x} y="252" textAnchor={anchor} fontSize="18" letterSpacing="4" fill={t.color}>
            OF COMPLETION
          </text>
          <text x={x} y="307" textAnchor={anchor} fontSize="17" fill="#69717a">
            This certificate is proudly presented to
          </text>
          {lines(learner, width, 2).map((line, i) => (
            <text
              key={i}
              x={x}
              y={355 + i * 34}
              textAnchor={anchor}
              fontSize={learner.length > 30 ? 29 : 36}
              fontWeight="700"
              fill="#15191f"
            >
              {line}
            </text>
          ))}
          <text x={x} y="421" textAnchor={anchor} fontSize="16" fill="#69717a">
            for successfully completing
          </text>
          {lines(course, width + 5, 2).map((line, i) => (
            <text
              key={i}
              x={x}
              y={455 + i * 27}
              textAnchor={anchor}
              fontSize="23"
              fontWeight="600"
              fill={t.color}
            >
              {line}
            </text>
          ))}
          <g transform={`translate(${centered ? 265 : x}, 510)`}>
            {design.signature_url && (
              <image
                href={asset(design.signature_url)}
                x="0"
                y="0"
                width="190"
                height="58"
                preserveAspectRatio="xMidYMid meet"
              />
            )}
            <line x1="0" x2="200" y1="64" y2="64" stroke="#b5b7bc" />
            <text x="0" y="87" fontSize="16" fontWeight="700" fill="#25282e">
              {design.signer_name.slice(0, 27) || "Authorized signatory"}
            </text>
            <text x="0" y="108" fontSize="12" fill="#69717a">
              {design.signer_title.slice(0, 38)}
            </text>
            <text x="270" y="62" fontSize="15" fill="#25282e">
              {date}
            </text>
            <line x1="270" x2="450" y1="72" y2="72" stroke="#b5b7bc" />
            <text x="270" y="92" fontSize="12" fill="#69717a">
              DATE OF ISSUE
            </text>
          </g>
          <text x="500" y="662" textAnchor="middle" fontSize="12" fill="#69717a">
            {code} · Verifiable on Zero Club
          </text>
        </>
      )}
    </svg>
  );
}
