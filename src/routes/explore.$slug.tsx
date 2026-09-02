import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Check,
  GraduationCap,
  MessageSquareText,
  ShieldCheck,
  Store,
  UsersRound,
  WalletCards,
} from "@/components/icons/solar";
import type { LucideIcon } from "@/components/icons/solar";
import { PublicHeader } from "@/components/public/PublicHeader";

type ProductPage = {
  name: string;
  eyebrow: string;
  statement: string;
  summary: string;
  Icon: LucideIcon;
  proof: Array<{ value: string; label: string }>;
  principles: Array<{ title: string; copy: string }>;
  workflow: string[];
  forWhom: string;
  docPage: string;
};

const products: Record<string, ProductPage> = {
  metrics: {
    name: "Metrics",
    eyebrow: "Progress you can explain",
    statement: "Measure momentum, not empty activity.",
    summary:
      "Zero Club Metrics turns learning, contribution, reach, earnings, and shipped work into an account-specific view of progress for learners, tutors, and institutions.",
    Icon: BarChart3,
    proof: [
      { value: "Role-aware", label: "Different signals for each account" },
      { value: "Live", label: "Connected to real platform activity" },
      { value: "Useful", label: "Designed for decisions, not vanity" },
    ],
    principles: [
      {
        title: "Learner momentum",
        copy: "Track learning consistency, shipped projects, earned XP, club participation, and profile discovery.",
      },
      {
        title: "Tutor performance",
        copy: "Understand enrolment, completion, learner outcomes, bootcamp quality, and teaching revenue.",
      },
      {
        title: "Institution oversight",
        copy: "See cohort health, tutor performance, programme reach, completion, and operational outcomes.",
      },
    ],
    workflow: [
      "Choose the period you want to understand",
      "Read the role-specific overview",
      "Inspect the work behind each number",
      "Use the signal to decide what to do next",
    ],
    forWhom:
      "Builders who want an honest record of growth, and educators who need evidence that their programmes are working.",
    docPage: "metrics-and-reputation",
  },
  "zero-ai": {
    name: "Zero AI",
    eyebrow: "Context-aware assistance",
    statement: "An AI partner that understands the work around you.",
    summary:
      "Zero AI is being designed to help members think, learn, teach, verify expertise, and move projects forward using the context of their Zero Club journey.",
    Icon: Bot,
    proof: [
      { value: "Grounded", label: "Built around your Zero Club context" },
      { value: "Practical", label: "Focused on the next useful action" },
      { value: "Responsible", label: "Human judgment remains in control" },
    ],
    principles: [
      {
        title: "Learn with direction",
        copy: "Break down difficult ideas, prepare learning plans, and turn knowledge into practice.",
      },
      {
        title: "Build with clarity",
        copy: "Think through briefs, unblock projects, improve documentation, and prepare work for shipping.",
      },
      {
        title: "Teach with confidence",
        copy: "Support curriculum planning and structured tutor verification without replacing expert review.",
      },
    ],
    workflow: [
      "Bring a question, lesson, or piece of work",
      "Give Zero AI the context that matters",
      "Review a practical response or next-step plan",
      "Apply your judgment and keep building",
    ],
    forWhom:
      "Learners, tutors, institutions, and teams that want useful assistance without losing ownership of the thinking.",
    docPage: "zero-ai",
  },
  feed: {
    name: "Feed",
    eyebrow: "Proof in motion",
    statement: "A professional feed built around progress.",
    summary:
      "Follow real work, share lessons, publish Ships, join live conversations, and let every meaningful contribution strengthen your public builder identity.",
    Icon: MessageSquareText,
    proof: [
      { value: "Posts", label: "Ideas, updates, media, and links" },
      { value: "Ships", label: "Structured proof of completed work" },
      { value: "Signal", label: "Feedback from people doing the work" },
    ],
    principles: [
      {
        title: "Discovery with purpose",
        copy: "Move between Discover, Following, Live, News, and Academy without losing the thread of useful work.",
      },
      {
        title: "Media that respects the work",
        copy: "Images and video stay readable in the feed and open fully on the post detail page.",
      },
      {
        title: "Conversation that travels",
        copy: "Comments, reposts, quotes, bookmarks, voice replies, and media replies keep discussion connected.",
      },
    ],
    workflow: [
      "Choose a post, Ship, or live update",
      "Add context people can understand",
      "Publish to the right audience",
      "Respond, iterate, and let the proof compound",
    ],
    forWhom:
      "Anyone who wants to be known for what they are learning, making, teaching, or contributing.",
    docPage: "feed-posts-and-ships",
  },
  bootcamps: {
    name: "Bootcamps",
    eyebrow: "Cohort learning",
    statement: "Structured learning that ends in visible work.",
    summary:
      "Zero Club Bootcamps bring curriculum, live teaching, classwork, community, enrolment, and proof of completion into one focused experience.",
    Icon: GraduationCap,
    proof: [
      { value: "Live", label: "Cohorts with real teaching" },
      { value: "Structured", label: "Curriculum, lessons, and classwork" },
      { value: "Visible", label: "Outcomes connect to builder profiles" },
    ],
    principles: [
      {
        title: "For learners",
        copy: "Understand what you will learn, review the curriculum, enrol securely, and finish with work you can show.",
      },
      {
        title: "For tutors",
        copy: "Create bootcamps for free, manage cohorts, price access, issue coupons, and edit every programme detail.",
      },
      {
        title: "For institutions",
        copy: "Coordinate tutors, cohorts, programmes, and outcomes from an institution-level workspace.",
      },
    ],
    workflow: [
      "Review outcomes, tutor, curriculum, and pricing",
      "Enrol and enter the temporary cohort club",
      "Learn live and submit classwork",
      "Complete the programme and add proof to your profile",
    ],
    forWhom:
      "Learners seeking practical outcomes and educators who want to deliver serious, accountable programmes.",
    docPage: "bootcamps",
  },
  clubs: {
    name: "Clubs",
    eyebrow: "Focused communities",
    statement: "Community organised around a shared direction.",
    summary:
      "Clubs give cohorts, teams, creators, and learning communities a focused home for conversation, announcements, classwork, questions, live spaces, and rewards.",
    Icon: UsersRound,
    proof: [
      { value: "General", label: "Conversation and shared media" },
      { value: "Classwork", label: "Assignments and submissions" },
      { value: "Q&A", label: "Questions with focused answer threads" },
    ],
    principles: [
      {
        title: "Clear spaces",
        copy: "General chat, announcements, classwork, and Q&A each have an interface designed for their purpose.",
      },
      {
        title: "Real moderation",
        copy: "Admins control announcements, membership, settings, live sessions, and community safety.",
      },
      {
        title: "Participation with stakes",
        copy: "Voice, media, files, and wallet-backed giveaways make participation richer and accountable.",
      },
    ],
    workflow: [
      "Discover or receive an invitation to a club",
      "Review its purpose and request access",
      "Participate in the right space",
      "Build trust through consistent contribution",
    ],
    forWhom:
      "Focused groups that need more structure than a chat room and more life than a course portal.",
    docPage: "clubs-and-spaces",
  },
  opportunities: {
    name: "Opportunities",
    eyebrow: "Gig marketplace",
    statement: "Find work through visible proof.",
    summary:
      "A professional gig marketplace where institutions and Zero Club administrators publish clear opportunities and builders respond with relevant, verifiable work.",
    Icon: BriefcaseBusiness,
    proof: [
      { value: "Clear briefs", label: "Scope, budget, skills, and timing" },
      { value: "Proof-first", label: "Applications backed by real work" },
      { value: "Focused", label: "Professional opportunities, not busywork" },
    ],
    principles: [
      {
        title: "Credible discovery",
        copy: "Profiles, Ships, XP, and contribution history help clients understand who can do the work.",
      },
      {
        title: "Structured applications",
        copy: "Builders can assess fit, prepare a response, and connect the most relevant proof.",
      },
      {
        title: "Controlled publishing",
        copy: "Only institution accounts and Zero Club administrators can publish gigs, protecting marketplace quality.",
      },
    ],
    workflow: [
      "Browse gigs by skill, budget, or status",
      "Open a brief and assess the requirements",
      "Apply with a focused response and proof",
      "Continue the conversation in Zero Club Messages",
    ],
    forWhom:
      "Builders ready to turn reputation into work and institutions looking for credible emerging talent.",
    docPage: "opportunities",
  },
  wallet: {
    name: "Wallet",
    eyebrow: "Built-in value layer",
    statement: "Move value without leaving the work.",
    summary:
      "The Zero Club Wallet brings balances, earnings, transfers, withdrawals, gift cards, and transaction history into the same place where members learn and build.",
    Icon: WalletCards,
    proof: [
      { value: "Local", label: "Currency follows your wallet setting" },
      { value: "Connected", label: "Earnings sit beside your work" },
      { value: "Protected", label: "Sensitive actions require confirmation" },
    ],
    principles: [
      {
        title: "Everyday money movement",
        copy: "Add money, send to another member, withdraw, and understand every transaction from one clear ledger.",
      },
      {
        title: "Purpose-bound gifts",
        copy: "Create a gift for a specific Zero Club service so support reaches the intended next step.",
      },
      {
        title: "Automated rewards",
        copy: "Wallet-backed giveaways and host-funded game prizes lock funds before publishing and pay winners automatically.",
      },
    ],
    workflow: [
      "Choose your preferred currency",
      "Fund or earn into your wallet",
      "Pay, transfer, gift, or withdraw",
      "Review status and history for every movement",
    ],
    forWhom:
      "Members and organisations that need payments to feel native to learning, community, and digital work.",
    docPage: "wallet-and-gifts",
  },
  store: {
    name: "Store",
    eyebrow: "Creator commerce",
    statement: "Turn useful work into something people can access.",
    summary:
      "Zero Store gives builders, tutors, and institutions a professional place to offer digital products, learning resources, and private access to the network.",
    Icon: Store,
    proof: [
      { value: "Digital", label: "Products made to deliver online" },
      { value: "Connected", label: "Discovery through profiles and Feed" },
      { value: "Owned", label: "A storefront attached to your identity" },
    ],
    principles: [
      {
        title: "A credible storefront",
        copy: "Your products sit alongside your public work, experience, and community reputation.",
      },
      {
        title: "Clear offers",
        copy: "Explain what a buyer receives, set a price, and present media that helps them decide.",
      },
      {
        title: "Native checkout",
        copy: "Zero Club Wallet keeps purchase and earnings activity connected to the rest of the product.",
      },
    ],
    workflow: [
      "Create a clear digital offer",
      "Add pricing, delivery details, and media",
      "Publish it to your profile and Store",
      "Track discovery and earnings from your account",
    ],
    forWhom:
      "Builders and educators with useful knowledge, resources, or access worth packaging professionally.",
    docPage: "store-and-commerce",
  },
};

export const Route = createFileRoute("/explore/$slug")({
  component: ProductDetailPage,
  loader: ({ params }) => {
    const product = products[params.slug];
    if (!product) throw notFound();
    return product;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name || "Explore"} - Zero Club` },
      { name: "description", content: loaderData?.summary || "Explore Zero Club." },
    ],
  }),
});

function ProductDetailPage() {
  const product = Route.useLoaderData() as ProductPage;
  const Icon = product.Icon;

  return (
    <div className="min-h-screen bg-[#f7f6f3] dark:bg-[#100e13] font-sans text-[#171717] dark:text-white">
      <PublicHeader section={product.name} />
      <main>
        <section>
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d176d]">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-[#cc208f]/10">
                  <Icon className="h-4 w-4 fill-current" />
                </span>
                {product.eyebrow}
              </div>
              <h1 className="mt-8 max-w-[760px] font-display text-[43px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[68px]">
                {product.statement}
              </h1>
            </div>
            <div className="border-l-2 border-[#cc208f] pl-5">
              <p className="text-[15px] leading-7 text-[#5f5a5d] dark:text-white/55">
                {product.summary}
              </p>
              <div className="mt-7 flex flex-wrap gap-2.5">
                <Link
                  to="/signup"
                  search={{ ref: undefined, club: undefined }}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-[#171717] px-5 text-[11.5px] font-semibold text-white"
                >
                  Start building <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  to="/docs"
                  search={{ page: product.docPage }}
                  className="inline-flex h-11 items-center rounded-md border border-[#171717]/15 px-5 text-[11.5px] font-semibold"
                >
                  Read the guide
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#171417] text-white">
          <div className="mx-auto grid max-w-[1180px] md:grid-cols-3 md:divide-x md:-0">
            {product.proof.map((item) => (
              <div key={item.value} className="px-6 py-8 md:px-8 md:py-10">
                <p className="font-display text-[22px] font-semibold tracking-tight text-[#f28fd0]">
                  {item.value}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-white/50">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-[1180px] px-5 py-16 md:px-8 md:py-24">
            <div className="max-w-[620px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9d176d]">
                Designed for useful work
              </p>
              <h2 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-[-0.025em] md:text-[46px]">
                What makes {product.name} different
              </h2>
            </div>
            <div className="mt-12/10/10 dark:border-white/10">
              {product.principles.map((item, index) => (
                <article
                  key={item.title}
                  className="grid gap-4 py-7 md:grid-cols-[80px_0.7fr_1fr] md:items-start md:gap-8 md:py-9"
                >
                  <span className="font-mono text-[10px] text-[#9d176d]">0{index + 1}</span>
                  <h3 className="font-display text-[21px] font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="max-w-[620px] text-[13px] leading-6 text-[#625d61] dark:text-white/60">
                    {item.copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-[#141118]">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[0.7fr_1fr]">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9d176d]">
                A clear path
              </p>
              <h2 className="mt-3 font-display text-[31px] font-semibold tracking-tight">
                How it works
              </h2>
              <p className="mt-5 max-w-sm text-[13px] leading-6 text-[#625d61] dark:text-white/60">
                {product.forWhom}
              </p>
            </div>
            <ol className="/10 dark:border-white/10">
              {product.workflow.map((step, index) => (
                <li key={step} className="flex items-center gap-5/10 dark:border-white/10 py-5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#171717] text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="text-[13px] font-medium leading-5">{step}</span>
                  <Check className="ml-auto h-4 w-4 shrink-0 text-[#cc208f]" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-[#f7f6f3] dark:bg-[#100e13] px-5 py-16 text-center md:py-20">
          <ShieldCheck className="mx-auto h-6 w-6 fill-[#cc208f] text-[#cc208f]" />
          <h2 className="mx-auto mt-5 max-w-xl font-display text-[30px] font-semibold tracking-tight md:text-[40px]">
            Put your next step where your progress can be seen.
          </h2>
          <Link
            to="/signup"
            search={{ ref: undefined, club: undefined }}
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-md bg-[#171717] px-5 text-[11.5px] font-semibold text-white"
          >
            Join Zero Club <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}
