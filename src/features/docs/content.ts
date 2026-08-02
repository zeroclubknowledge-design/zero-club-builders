export type DocSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  note?: string;
};

export type DocPage = {
  slug: string;
  group: string;
  title: string;
  summary: string;
  readTime: string;
  sections: DocSection[];
};

export const docPages: DocPage[] = [
  {
    slug: "welcome",
    group: "Start here",
    title: "Welcome to Zero Club",
    summary: "Understand the network, the language we use, and how visible progress connects everything.",
    readTime: "4 min",
    sections: [
      {
        title: "What Zero Club is",
        paragraphs: [
          "Zero Club is a professional social network for people who learn, build, teach, and create opportunities. It brings community, structured learning, proof of work, commerce, and reputation into one connected product.",
          "The network is designed around visible progress. A useful post, completed classwork, shipped project, thoughtful answer, successful bootcamp, or paid product can all strengthen the same identity instead of disappearing across disconnected platforms.",
        ],
      },
      {
        title: "The core loop",
        bullets: [
          "Learn through bootcamps, tutors, clubs, peers, and practical resources.",
          "Build by turning lessons and ideas into projects, notes, and contributions.",
          "Show proof through Ships, profile history, classwork, and public progress.",
          "Connect with people whose direction, skills, or needs overlap with yours.",
          "Earn through opportunities, teaching, products, access, and community value.",
        ],
        note: "Zero Club is not designed to reward noise. The strongest signal is useful work repeated over time.",
      },
      {
        title: "Who the network serves",
        paragraphs: ["Every account shares the same social foundation, but tools and metrics change according to the work that account needs to do."],
        bullets: [
          "Learners build skills, proof, relationships, and access to work.",
          "Tutors create bootcamps, teach cohorts, manage curriculum, and earn from expertise.",
          "Institutions coordinate programmes, tutors, learners, communities, and outcomes.",
          "Zero Club administrators protect platform quality, safety, payments, and operations.",
        ],
      },
    ],
  },
  {
    slug: "getting-started",
    group: "Start here",
    title: "Getting started",
    summary: "Set up a credible account, choose the right role, and make your first useful contribution.",
    readTime: "5 min",
    sections: [
      {
        title: "Create and confirm your account",
        paragraphs: ["Zero Club uses passwordless access. Enter your email, request a secure code or magic link, and confirm it from the same device whenever possible."],
        bullets: ["Use an email address you control.", "Never forward your sign-in code or magic link.", "Add another account only through Account settings.", "Logging out ends the active session and returns you to the public landing page."],
      },
      {
        title: "Choose the role that matches your work",
        paragraphs: ["Select Learner, Tutor, or Institution during setup. Your choice affects dashboards, membership plans, analytics, and publishing access. It does not prevent you from learning or contributing socially."],
        note: "Use an Institution account for a registered hub, school, academy, or programme operator. Individual educators should use Tutor.",
      },
      {
        title: "Your first 30 minutes",
        bullets: [
          "Add a recognisable photo, display name, short bio, location, and useful links.",
          "Choose goals and skills so discovery can become more relevant.",
          "Follow a small number of people whose work you genuinely want to track.",
          "Publish an introduction that states what you are learning or building now.",
          "Save one opportunity, bootcamp, club, or note to return to later.",
        ],
      },
    ],
  },
  {
    slug: "accounts-and-profiles",
    group: "Identity",
    title: "Accounts and profiles",
    summary: "Build one professional identity from your work, relationships, and experience across Zero Club.",
    readTime: "6 min",
    sections: [
      {
        title: "Your public identity",
        paragraphs: ["A profile is the durable record behind your activity. It combines your introduction, network, XP, posts, Ships, media, likes, learning, and relevant account signals."],
        bullets: ["Posts show what you are thinking and doing now.", "Ships show completed or meaningfully released work.", "Media collects the visual proof attached to your activity.", "XP communicates accumulated experience and cannot be transferred."],
      },
      {
        title: "Profiles should make the next action easy",
        paragraphs: ["Other members can move from a profile into a direct conversation using Message. The button is intentionally hidden on your own profile because account editing belongs in Profile settings."],
        bullets: ["Write a bio that says what you do and where you are going.", "Use clickable links to connect portfolios, repositories, demos, and source material.", "Keep your recent Ships relevant to the work you want to attract.", "Use a banner that supports your identity without hiding profile controls."],
      },
      {
        title: "Multiple accounts",
        paragraphs: ["Account settings lets you add an existing account or create a new one without blending their profiles. Switching changes the active Zero Club identity; signing out should not silently move you into a different saved account."],
        note: "Never create duplicate identities to manipulate votes, giveaways, metrics, or competition results.",
      },
    ],
  },
  {
    slug: "metrics-and-reputation",
    group: "Identity",
    title: "Metrics, XP, and ZP",
    summary: "Know the difference between experience, spendable points, and the metrics that explain progress.",
    readTime: "6 min",
    sections: [
      {
        title: "XP represents experience",
        paragraphs: ["XP is a non-transferable record of experience earned through meaningful participation. It belongs to the profile and helps other people understand the depth and consistency of a member's journey."],
        bullets: ["XP cannot be sent, sold, withdrawn, or gifted.", "Qualifying work can include learning, shipping, contributing, completing programmes, and community participation.", "XP should indicate experience, not financial value.", "Abuse or reversed activity may result in XP corrections."],
      },
      {
        title: "ZP represents Zero Points",
        paragraphs: ["ZP is the point balance members can send or use where Zero Club explicitly supports it. It is distinct from cash wallet balances and distinct from XP."],
        note: "A high XP profile is experienced. A ZP balance is usable. They must never be presented as the same thing.",
      },
      {
        title: "Metrics adapt to account type",
        bullets: [
          "Learner metrics focus on consistency, learning, Ships, profile reach, and participation.",
          "Tutor metrics focus on enrolment, completion, learner outcomes, quality, and teaching revenue.",
          "Institution metrics focus on programme reach, cohort health, tutor performance, completion, and operations.",
          "Every metric should link back to the activity or outcome that produced it whenever possible.",
        ],
      },
    ],
  },
  {
    slug: "feed-posts-and-ships",
    group: "Create and share",
    title: "Feed, posts, and Ships",
    summary: "Publish useful work, control how it appears, and turn updates into durable proof.",
    readTime: "7 min",
    sections: [
      {
        title: "The Feed",
        paragraphs: ["The Feed is where current activity across the network becomes discoverable. Tabs separate broad discovery, people you follow, live sessions, relevant news, and academy content."],
        bullets: ["Discover surfaces work beyond your existing network.", "Following prioritises accounts you chose to follow.", "Live shows active and upcoming broadcasts.", "News and Academy separate information from structured learning signals."],
      },
      {
        title: "Posts and media",
        paragraphs: ["A post can contain text, links, images, video, and conversation. Feed previews keep media compact without cropping the original; the post detail page shows the complete asset and full discussion."],
        bullets: ["Edit your post to update both written content and attached media.", "Use Quote when your own context matters; use Repost for a direct reshare.", "Bookmark privately when you want to return later.", "Links, including project and deployment URLs, should remain clickable."],
      },
      {
        title: "Ships are structured proof",
        paragraphs: ["Use a Ship when you have released, completed, or meaningfully advanced a project. Add a clear title, the problem, your contribution, media, and a working link where available."],
        note: "A Ship should help another person inspect the work. A vague announcement belongs in a regular post.",
      },
      {
        title: "Comments and ownership",
        paragraphs: ["Comments support text, voice, gallery, and video where available. You can send, edit, or delete your own comment. Actions such as Follow or Message appear only for another member's comment."],
      },
    ],
  },
  {
    slug: "zeronotes",
    group: "Create and share",
    title: "ZeroNotes",
    summary: "Write long-form ideas, learning records, and technical stories with a focused publishing workflow.",
    readTime: "5 min",
    sections: [
      {
        title: "When to use ZeroNotes",
        paragraphs: ["ZeroNotes is for work that needs more structure than a Feed post: tutorials, reflections, case studies, research notes, breakdowns, and durable learning records."],
      },
      {
        title: "Writing and editing",
        bullets: ["Use the Title field for a concise article title; it has a deliberate character limit.", "Write the body in the editor and structure it with headings and paragraphs.", "Unused or malformed paragraphs can be removed with Backspace during editing.", "Publishing remains accessible near the writing area when you pause, reducing the need to reach the page header on mobile."],
      },
      {
        title: "Make a note useful",
        bullets: ["State the idea or problem early.", "Use headings that let readers scan.", "Link evidence, demos, sources, and related work.", "End with a conclusion, decision, or practical next step.", "Update the note when the underlying work changes."],
      },
    ],
  },
  {
    slug: "clubs-and-spaces",
    group: "Community",
    title: "Clubs and focused spaces",
    summary: "Organise community activity so conversations, learning, questions, and submissions do not compete for attention.",
    readTime: "8 min",
    sections: [
      {
        title: "The anatomy of a Club",
        paragraphs: ["A Club is a focused community with membership, roles, settings, notifications, and several purpose-built spaces. The General experience is deliberately different from Announcements, Classwork, and Q&A."],
      },
      {
        title: "General and Announcements",
        bullets: ["General supports conversation, voice notes, images, video, files, replies, and member profiles.", "A member's avatar opens that member's profile.", "Only admins can write in Announcements.", "Admin attachment options can include a wallet-backed giveaway."],
      },
      {
        title: "Classwork and Q&A",
        bullets: ["Classwork begins with an assignment card created by a tutor or admin.", "Learners open an assignment before viewing details or submitting their work.", "Q&A begins with a question card rather than an open chat stream.", "Members open a question to ask, clarify, and contribute answers in that focused thread."],
      },
      {
        title: "Membership and administration",
        paragraphs: ["Request to Join gives admins enough context to make a membership decision. Club Squad supports profile access and direct messages without hijacking normal scrolling. Settings control identity, permissions, access, moderation, and lifecycle."],
        note: "A temporary bootcamp club disappears when its programme ends. Connecting a bootcamp to an existing permanent club is a subscribed tutor capability.",
      },
    ],
  },
  {
    slug: "bootcamps",
    group: "Learning",
    title: "Bootcamps",
    summary: "Understand discovery, curriculum, enrolment, teaching, verification, temporary clubs, and programme ownership.",
    readTime: "9 min",
    sections: [
      {
        title: "For learners",
        paragraphs: ["A bootcamp details page begins with the programme description and outcomes, then presents its curriculum and learning contents before pricing and purchase actions. This order lets a learner understand the programme before making a payment decision."],
        bullets: ["Review the tutor or institution, outcomes, schedule, requirements, and curriculum.", "Expand curriculum sections to understand the sequence of lessons.", "Review price, available coupon, refund information, and access terms at the page footer.", "After enrolment, use the cohort club for live teaching, announcements, questions, and classwork."],
      },
      {
        title: "For tutors",
        paragraphs: ["Tutors can create and launch bootcamps on the free plan. The creation flow separates Basics, Curriculum, and Launch so programme information can be reviewed before publishing."],
        bullets: ["Basics covers identity, category, outcomes, audience, schedule, media, and instructor details.", "Curriculum contains sections, lessons, resources, previews, and ordering.", "Launch covers pricing, coupons, capacity, access, and final checks.", "The Tutor Studio bootcamp details page allows the owner or assigned tutor to edit and save an existing programme."],
      },
      {
        title: "Temporary and existing Clubs",
        paragraphs: ["Every launched bootcamp can create a temporary cohort club at no additional subscription cost. The club exists for the programme lifecycle and disappears after the bootcamp ends. Connecting the programme to an existing, persistent Club requires an eligible paid tutor plan."],
      },
      {
        title: "Verification and Zero AI",
        paragraphs: ["A verification badge helps learners distinguish programmes whose teaching expertise has been assessed. The planned Zero AI verification interview evaluates a tutor's knowledge of the subject they intend to teach."],
        note: "Bootcamp creation is free. Zero AI assistance and the bootcamp verification pathway are paid-plan capabilities while Zero AI remains under development.",
      },
    ],
  },
  {
    slug: "opportunities",
    group: "Work and commerce",
    title: "Opportunities",
    summary: "Use the professional gig marketplace to discover work and respond with relevant proof.",
    readTime: "5 min",
    sections: [
      {
        title: "What belongs in Opportunities",
        paragraphs: ["Opportunities is a gig marketplace, not a task list. Every listing should describe a real need, expected output, useful skills, timing, working arrangement, and compensation where applicable."],
      },
      {
        title: "Who can publish",
        paragraphs: ["Only Institution accounts and Zero Club administrators can publish gigs. This controlled supply protects quality and gives builders a clearer understanding of who stands behind a brief."],
        note: "Tutors and learners can discover and apply, but cannot publish marketplace gigs from their account type.",
      },
      {
        title: "Apply through proof",
        bullets: ["Read the full brief before responding.", "Explain why your experience matches the specific work.", "Attach or link the most relevant Ship, Note, profile section, or project.", "Keep private or sensitive discussion in direct Messages.", "Never move money or identity verification into an untrusted external flow."],
      },
    ],
  },
  {
    slug: "wallet-and-gifts",
    group: "Work and commerce",
    title: "Wallet, currency, and Gifts",
    summary: "Manage balances, move money, and support another member with purpose-bound gift cards.",
    readTime: "8 min",
    sections: [
      {
        title: "Wallet foundations",
        paragraphs: ["The Wallet is the financial layer attached to your Zero Club account. It records available balances, money added, transfers, earnings, gifts, prizes, withdrawals, and transaction states."],
        bullets: ["Add Money funds the selected wallet balance.", "Send transfers supported value to another Zero Club member.", "Withdraw moves eligible funds through an available payout method.", "History explains the amount, currency, direction, status, and time of every transaction."],
      },
      {
        title: "Currency follows the user",
        paragraphs: ["Changing currency in Wallet settings updates monetary presentation across the product, including Gifts and supported commerce surfaces. A converted display does not rewrite the original transaction record."],
      },
      {
        title: "Zero Club Gifts",
        paragraphs: ["A Gift lets one member fund a specific next step for another. The creator selects an amount, a visual template, and the Zero Club service for which the value can be claimed."],
        bullets: ["The Gift is created only when the funding account can cover it.", "The recipient opens the shared gift and claims it into the intended service context.", "A successful claim confirms both the value and the newly available service.", "Purpose restriction prevents well-intended support from being spent elsewhere."],
      },
      {
        title: "Locked prizes and giveaways",
        paragraphs: ["When an admin publishes a cash giveaway or a host funds a Zero Games prize, the required amount is locked from their available wallet balance. The winner is paid automatically after the authorised award or valid game result."],
      },
    ],
  },
  {
    slug: "store-and-commerce",
    group: "Work and commerce",
    title: "Zero Store and creator commerce",
    summary: "Package digital value, present it credibly, and connect purchases to your builder identity.",
    readTime: "5 min",
    sections: [
      {
        title: "What you can offer",
        paragraphs: ["Zero Store is intended for digital products, resources, and private access that can be clearly described and delivered through the platform's supported commerce flow."],
        bullets: ["Templates, guides, files, and learning resources.", "Digital tools and downloadable assets.", "Access to private learning or community experiences.", "Other platform-approved products tied to a credible creator identity."],
      },
      {
        title: "A professional listing",
        bullets: ["Use a literal title that tells buyers what the product is.", "Explain the included files, access, updates, and limitations.", "Use images that reveal the real product rather than unrelated decoration.", "Set a clear price and delivery expectation.", "Keep the listing updated when a new version is released."],
      },
      {
        title: "Trust and ownership",
        paragraphs: ["A purchase grants only the rights stated in the listing. Creators should distinguish personal use, commercial use, and ownership transfer. Buyers should not assume that access to a file transfers intellectual property rights."],
      },
    ],
  },
  {
    slug: "zerohub",
    group: "Build",
    title: "ZeroHub and shipped projects",
    summary: "Maintain projects as living work with releases, access terms, and visible progress.",
    readTime: "5 min",
    sections: [
      {
        title: "A home for shipped work",
        paragraphs: ["ZeroHub gives a project more continuity than a single announcement. A project can retain its identity while the creator adds newer versions, release context, media, links, and updated access terms."],
      },
      {
        title: "Versions",
        bullets: ["Add the latest version above earlier releases.", "Describe what changed and why it matters.", "Keep older releases visible when they help explain the project's evolution.", "Connect repository, deployment, demo, or documentation links where appropriate."],
      },
      {
        title: "Using another member's work",
        paragraphs: ["A creator can make work available for free or set a price for the rights they are prepared to grant. The listing must say whether the buyer receives usage rights, commercial rights, modification rights, or full ownership."],
        note: "Payment alone does not imply unrestricted ownership. The stated licence or transfer terms control how the work may be used.",
      },
    ],
  },
  {
    slug: "zero-games",
    group: "Build",
    title: "Zero Games",
    summary: "Compete through skill, invite the network, and win offers or host-funded prizes.",
    readTime: "6 min",
    sections: [
      {
        title: "The games",
        bullets: ["Zero Sudoku is a multiplayer race where the first valid completion wins.", "Zero Words is a word competition designed around field knowledge, speed, and shared challenges.", "Practice modes help members understand a game before entering a live competition."],
      },
      {
        title: "Create a competition",
        paragraphs: ["A host chooses the game, competition settings, participant access, and reward type. They can copy an invitation link, send it to friends, or share the competition to Feed for relevant members to join."],
      },
      {
        title: "Reward models",
        bullets: ["Free with an offer: no funds are staked; the winner unlocks a defined Zero Club offer.", "Host-funded prize: the host sets a cash amount that is locked before the competition becomes available.", "A valid winner receives the offer or wallet transfer through the competition result flow."],
        note: "XP is never staked or transferred. Experience stays attached to the profile.",
      },
    ],
  },
  {
    slug: "zero-ai",
    group: "Build",
    title: "Zero AI",
    summary: "The principles, planned responsibilities, and human controls behind Zero Club's context-aware assistant.",
    readTime: "7 min",
    sections: [
      {
        title: "What Zero AI is for",
        paragraphs: ["Zero AI is intended to help members understand material, think through work, document progress, plan learning, improve teaching operations, and make the next practical decision. It should use relevant Zero Club context only with appropriate access and user awareness."],
      },
      {
        title: "Planned experiences",
        bullets: ["Learner assistance for explanations, practice plans, reflection, and project direction.", "Tutor assistance for curriculum structure, teaching preparation, and learner support.", "Institution assistance for programme insight, operations, and cohort intervention.", "Tutor expertise interviews that contribute to bootcamp verification review.", "Contextual guidance across Notes, projects, Metrics, and other supported workflows."],
      },
      {
        title: "Boundaries",
        bullets: ["Zero AI should not impersonate a tutor, learner, institution, or administrator.", "AI output must not silently publish, transfer funds, grade high-stakes work, or make irreversible account decisions.", "Members remain responsible for reviewing generated content and verifying important claims.", "Sensitive account, wallet, and private community data requires strict access controls."],
        note: "Zero AI is under development. Product surfaces should clearly distinguish available capabilities from planned ones.",
      },
    ],
  },
  {
    slug: "tutors-and-institutions",
    group: "For educators",
    title: "Tutors and institutions",
    summary: "Choose the right workspace and understand how teaching ownership, membership, and administration differ.",
    readTime: "7 min",
    sections: [
      {
        title: "Tutor Studio",
        paragraphs: ["Tutor Studio is the operating workspace for an individual educator. It brings bootcamps, curriculum, learners, coupons, performance, settings, and programme editing into a focused desktop and mobile experience."],
      },
      {
        title: "Institution Hub",
        paragraphs: ["Institution Hub replaces Tutor Studio for an Institution account. It supports programme operations at organisation level, including assigned tutors, multiple bootcamps, cohorts, institutional metrics, and administration."],
        bullets: ["Institution navigation remains inside the standard desktop frame.", "Back to app returns the institution to the social product.", "Assigned tutors and authorised admins can edit and save bootcamps they manage.", "Institution metrics must represent programme and organisational outcomes, not learner activity."],
      },
      {
        title: "Membership plans",
        paragraphs: ["Learner and Tutor plans differ because their jobs on Zero Club differ. Both have a free Basic plan. Paid tiers unlock role-relevant capacity and capabilities rather than applying the same feature list to every account."],
        bullets: ["Learner Premium: NGN 3,000.", "Learner Premium+: NGN 7,000.", "Tutor Premium: NGN 5,000.", "Tutor Premium+: NGN 12,000.", "Institution plans are presented separately according to organisational needs."],
      },
    ],
  },
  {
    slug: "safety-and-notifications",
    group: "Trust and support",
    title: "Safety, moderation, and notifications",
    summary: "Control attention, report harmful activity, and understand how important events reach you.",
    readTime: "6 min",
    sections: [
      {
        title: "Notifications",
        paragraphs: ["In-app notifications cover relevant activity such as likes, comments, follows, messages, programme updates, and community actions. A compact incoming notification appears near the header; the Notifications page preserves the longer activity history."],
        bullets: ["A comment notification should open the related post and display the comment when access allows.", "Push notifications require browser or device permission and an active registered subscription.", "Notification settings control which supported events can reach the device.", "Fast optimistic UI should not pretend an event is complete before the server confirms it."],
      },
      {
        title: "Moderation tools",
        paragraphs: ["Members can report content or people where supported. Club admins manage membership and space-level conduct. Zero Club administrators handle platform-wide safety, account status, marketplace quality, financial risk, and escalations."],
      },
      {
        title: "Protect your account",
        bullets: ["Never share a magic link or one-time code.", "Review the recipient and amount before any wallet action.", "Use account controls to block or report suspicious contact.", "Treat external links, files, and payment requests with care.", "Contact Zero Club support when account access or money movement looks unfamiliar."],
      },
    ],
  },
];

export const defaultDocPage = docPages[0];

export function getDocPage(slug?: string) {
  return docPages.find((page) => page.slug === slug) || defaultDocPage;
}
