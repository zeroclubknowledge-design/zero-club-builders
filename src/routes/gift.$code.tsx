import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { GiftCardVisual, giftServices } from "@/components/GiftCardVisual";

/**
 * Public landing page for a shared Zero Club Gift.
 *
 * Gift links used to point at /app/gifts/<code>, which is inside the signed-in
 * app: client-rendered, behind auth, and therefore invisible to the crawler
 * that builds a WhatsApp or X preview. Every gift previewed as the generic
 * "Zero Club — A private club for builders" card.
 *
 * This page is server-rendered, so the amount, what the gift is for and a
 * picture of the card itself are all in the HTML the moment it is served.
 * Anyone signed in is sent straight through to claim it.
 */
export const Route = createFileRoute("/gift/$code")({
  component: GiftLinkPage,

  loader: async ({ params }) => {
    try {
      const { data, error } = await supabase.rpc("get_gift_card_public", { gift_code: params.code });
      if (error || !data?.found) return null;
      return data as {
        code: string;
        amount: number;
        service: string;
        template_id: string;
        message: string | null;
        custom_purpose: string | null;
        status: string;
      };
    } catch {
      return null;
    }
  },

  head: ({ loaderData, params }) => {
    const label = !loaderData
      ? "Zero Club"
      :
      giftServices.find((item) => item.id === loaderData.service)?.label || loaderData.service;

    const amount = loaderData
      ? "₦" + Math.round(Number(loaderData.amount) || 0).toLocaleString("en-NG")
      : null;
    const claimed = loaderData ? loaderData.status !== "active" : false;

    const title = !amount
      ? "You have received a Zero Club Gift"
      : claimed
      ? `This ${amount} Zero Club Gift has been claimed`
      : `You have received a ${amount} Zero Club Gift`;

    const description =
      loaderData?.custom_purpose ||
      loaderData?.message ||
      (!amount
        ? "Open your Zero Club Gift to claim it."
        : loaderData!.service === "support" || loaderData!.service === "custom"
        ? `${amount} straight into your Zero Club wallet. Open to claim it.`
        : `${amount} of Zero Club credit for ${label}. Open to claim it.`);

    // Dynamic raster PNG drawn directly for this exact gift card (amount, template, note, code)
    // Sized 1200x630, standard OpenGraph format supported by WhatsApp, Telegram, X, iMessage.
    const image = `https://www.zeroclubs.xyz/api/gift-card/${params.code}.png?v=4`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Zero Club" },
        { property: "og:url", content: `https://www.zeroclubs.xyz/gift/${params.code}?v=4` },
        { property: "og:image", content: image },
        { property: "og:image:secure_url", content: image },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: `${amount || "A"} Zero Club Gift` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
    };
  },
});

function GiftLinkPage() {
  const card = Route.useLoaderData();
  const { code } = Route.useParams();
  const target = `/app/gifts/${code}`;

  // Already signed in? Go straight to claiming it.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) window.location.replace(target);
    });
    return () => { cancelled = true; };
  }, [target]);

  const claimed = card && card.status !== "active";

  return (
    <div className="min-h-screen bg-[#f8f7f5] text-foreground dark:bg-background">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[720px] items-center px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            <span className="font-display text-[16px] font-semibold tracking-tight">
              Zero <span className="text-primary">Club</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[560px] px-5 py-12 text-center">
        {!card ? (
          <>
            <Gift className="mx-auto h-10 w-10 text-muted-foreground/30" strokeWidth={1.5} />
            <h1 className="mt-5 font-display text-[26px] font-semibold tracking-tight">Gift not found</h1>
            <p className="mt-2.5 text-[14px] leading-7 text-muted-foreground">
              This link may be mistyped, or the gift has been removed.
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              {claimed ? "Already claimed" : "A gift for you"}
            </p>
            <h1 className="mt-3 font-display text-[26px] font-semibold leading-tight tracking-tight">
              {claimed ? "This gift has been claimed" : "You have received a Zero Club Gift"}
            </h1>

            <div className="mx-auto mt-7 flex w-full justify-center">
              <GiftCardVisual
                amount={card.amount}
                service={card.service}
                templateId={card.template_id}
                code={card.code}
                message={card.message || undefined}
              />
            </div>

            {!claimed && (
              <a
                href={target}
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-8 text-[14.5px] font-semibold text-background transition hover:opacity-90"
              >
                Claim this gift <ArrowRight className="h-4 w-4" />
              </a>
            )}
          </>
        )}
      </main>
    </div>
  );
}
