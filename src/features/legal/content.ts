/**
 * Zero Club's Terms of Service and Privacy Policy.
 *
 * Plain data so the text can be edited without touching the page layout.
 * A block is a paragraph (string) or a bulleted list ({ list }).
 * Update LEGAL_UPDATED whenever either document changes materially.
 */

export const LEGAL_UPDATED = "30 September 2026";
export const LEGAL_EFFECTIVE = "30 September 2026";
export const CONTACT_EMAIL = "contact@zeroclubs.xyz";
export const PRIVACY_EMAIL = "contact@zeroclubs.xyz";

export type LegalBlock = string | { list: string[] } | { note: string };
export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };
export type LegalDoc = {
  slug: "terms" | "privacy";
  eyebrow: string;
  title: string;
  summary: string;
  highlights: { title: string; body: string }[];
  sections: LegalSection[];
};

export const TERMS: LegalDoc = {
  slug: "terms",
  eyebrow: "Legal",
  title: "Terms of Service",
  summary:
    "The agreement between you and Zero Club when you learn, teach, build, sell or run a community on our platform. Please read it — it explains what you can expect from us and what we expect from you.",
  highlights: [
    { title: "One account per person", body: "Your account is personal. Keep it secure and don't create more than one." },
    { title: "Your work stays yours", body: "You own what you post. You give us a licence only to run and show it on Zero Club." },
    { title: "Be a good club member", body: "No harassment, scams, plagiarism or illegal content. We act on reports." },
    { title: "Money is handled carefully", body: "Wallet, payments, payouts and refunds follow the clear rules below." },
  ],
  sections: [
    {
      id: "agreement",
      title: "1. About these Terms",
      blocks: [
        "These Terms of Service (the \"Terms\") govern your use of Zero Club — our website at zeroclubs.xyz, our mobile applications, ZeroStart (the Zero Ambassador platform) and every related feature, product and service (together, the \"Services\"). \"Zero Club\", \"we\", \"us\" and \"our\" refer to the operator of the Services. \"You\" means the person or organisation using them.",
        "By creating an account, or by using the Services in any way, you agree to these Terms and to our Privacy Policy. If you do not agree, please do not use the Services.",
        "If you use Zero Club on behalf of a school, company or other organisation (for example through an Institution account), you confirm that you are authorised to accept these Terms for it, and \"you\" includes that organisation.",
      ],
    },
    {
      id: "eligibility",
      title: "2. Who can use Zero Club",
      blocks: [
        "You must be at least 13 years old to use Zero Club. If you are under 18, or under the age of majority where you live, you may only use the Services with the permission and supervision of a parent or guardian, who also agrees to these Terms on your behalf.",
        "You may not use Zero Club if we have previously suspended or removed your account, or if you are barred from receiving the Services under applicable law.",
      ],
    },
    {
      id: "accounts",
      title: "3. Your account",
      blocks: [
        { list: [
          "One person, one account. Each person may hold a single personal Zero Club account. Creating additional accounts — including through email aliases or on a device that already has an account — is not allowed, and we may suspend accounts that break this rule.",
          "Accurate information. Use your real name or a name you are publicly known by, and keep your details up to date.",
          "Security. You sign in with one-time codes sent to your email, or with Google. You are responsible for keeping access to that email or Google account secure, and for everything that happens under your account. Tell us straight away at " + CONTACT_EMAIL + " if you think your account has been compromised.",
          "Email providers. To protect the community from spam, accounts must use an email address from a recognised provider. Temporary or disposable addresses are not accepted.",
          "Usernames. We may reclaim or change a username that impersonates someone, infringes a trademark or is misleading.",
        ] },
      ],
    },
    {
      id: "modes",
      title: "4. Learners, Tutors, Creators and Institutions",
      blocks: [
        "One Zero Club account can learn, teach and build communities. Some roles carry extra responsibilities:",
        { list: [
          "Tutors. Tutor mode and Tutor Studio are available only after your Tutor application has been reviewed and approved by Zero Club. You confirm that everything in your application is true. We may request more information, decline an application, or withdraw Tutor access if the standards in these Terms are not met.",
          "Tutor standards. Tutors must teach original material or material they are licensed to use, describe bootcamps and classes accurately, show up for sessions they schedule, treat every learner with respect, and keep learners' information private.",
          "Creators and club owners. If you run a club, you are responsible for its content, its rules and how you moderate it, in addition to these Terms.",
          "Institutions. Schools and organisations may publish bootcamps and programmes through Institution accounts, and are responsible for the accuracy of what they publish and for their own obligations to their students.",
          "Zero Ambassadors. Ambassadors are approved by Zero Club and are bound by the ZeroStart programme rules, including the commission and campaign review rules shown in ZeroStart. The Ambassador badge may be removed if those rules are broken.",
        ] },
      ],
    },
    {
      id: "content",
      title: "5. Your content",
      blocks: [
        "\"Your content\" means anything you post or upload: posts, Ships and projects, comments, messages, club messages, notes, images, videos, voice notes, bootcamp material, products and profile information.",
        { list: [
          "You own your content. Posting it on Zero Club does not transfer ownership to us.",
          "Licence to us. So we can run the Services, you grant Zero Club a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, display, distribute, adapt (for example, resize or compress) and promote your content on and in connection with the Services. This licence ends when you delete the content or your account, except where it has been shared by others, is needed for legal reasons, or remains in backups for a limited time.",
          "Your responsibility. You confirm that you have the rights to everything you post and that it does not break the law or anyone else's rights.",
          "Visibility. Public posts, profiles and Ships can be seen by anyone, including people who are not signed in, and may appear in search engines and link previews when shared.",
        ] },
      ],
    },
    {
      id: "conduct",
      title: "6. Community standards",
      blocks: [
        "Zero Club is a place for learning in public and building together. You agree not to:",
        { list: [
          "harass, bully, threaten, intimidate or discriminate against anyone;",
          "post content that is illegal, sexually explicit, hateful, violent or that exploits children in any way;",
          "impersonate any person or organisation, or misrepresent your skills, credentials or affiliations;",
          "plagiarise, or claim other people's work, projects or course material as your own;",
          "scam, defraud or mislead other members, including through fake products, fake bootcamps, fake reviews or fake engagement;",
          "send spam, unsolicited promotions or chain messages, or artificially inflate likes, follows, referrals or campaign results;",
          "share another person's private information without their permission;",
          "upload malware, or attempt to access accounts, systems or data you are not authorised to access;",
          "scrape, crawl or copy the Services or other members' data by automated means without our written permission;",
          "use the Services to break any law, including consumer, financial, data protection and intellectual property law.",
        ] },
        "You can report content or accounts from within the app. We review reports and may remove content, restrict features, or suspend or terminate accounts that break these standards.",
      ],
    },
    {
      id: "live",
      title: "7. Live classes, chats and clubs",
      blocks: [
        "Live rooms, club chats and direct messages are for genuine collaboration. Hosts are responsible for the conduct of their sessions. Do not record, screenshot or redistribute a live session or private conversation without the consent of the people in it, unless the host has clearly said the session is being recorded. Zero Club may end a session or remove a participant to keep the community safe.",
      ],
    },
    {
      id: "payments",
      title: "8. Payments, wallet and payouts",
      blocks: [
        { list: [
          "Paid features. Some features — such as bootcamps, memberships, club access, store products and premium experiences — are paid. Prices are shown before you pay, together with the currency.",
          "Payment processing. Card and bank payments are processed by our payment partners (such as Paystack). We do not store your full card details. Your use of their services is also subject to their terms.",
          "Zero Club wallet. Your wallet shows a balance you can use within Zero Club and, where available, withdraw to a verified bank account. Balances are shown in your chosen display currency at the Zero Club wallet rate. The wallet is not a bank account and does not earn interest.",
          "Earnings and payouts. Tutors, club owners, sellers and Ambassadors may receive earnings into their wallet. We may hold, review or reverse earnings connected to fraud, chargebacks, refunds, rule violations or errors, and may ask for identity or bank verification before paying out.",
          "Fees. Where Zero Club charges a platform fee or commission, it is shown before you publish or sell.",
          "Refunds. Digital products and services are generally non-refundable once access has been provided, except where the seller or tutor offers a refund, where a bootcamp or class is cancelled and not rescheduled, or where the law requires otherwise. Contact the seller or tutor first; if you cannot resolve it, contact us.",
          "Taxes. You are responsible for any taxes that apply to your earnings.",
        ] },
      ],
    },
    {
      id: "rewards",
      title: "9. ZP, XP, badges and rewards",
      blocks: [
        "Points such as ZP and XP, levels, streaks, badges, Zero Cards and other rewards recognise your activity on Zero Club. Unless we clearly state otherwise, they have no cash value, cannot be sold or transferred, and may be adjusted if they were earned through error, abuse or activity that breaks these Terms. Referral and Ambassador rewards are paid only for genuine new members.",
      ],
    },
    {
      id: "ip",
      title: "10. Zero Club's rights",
      blocks: [
        "The Services — including the Zero Club name and logo, design, software, features and the content we create — belong to Zero Club and its licensors and are protected by law. These Terms do not give you any right to use our name, logo or brand except to refer to Zero Club accurately. If you send us feedback or ideas, we may use them without any obligation to you.",
        "If you believe content on Zero Club infringes your copyright or other rights, email " + CONTACT_EMAIL + " with details of the work, where it appears on Zero Club and your contact information. We will review it and act where appropriate.",
      ],
    },
    {
      id: "third-parties",
      title: "11. Third-party services and links",
      blocks: [
        "The Services may link to, embed or integrate third-party websites and services (for example, video, sign-in or payment providers, or links members share). We are not responsible for them, and your use of them is governed by their own terms and policies.",
      ],
    },
    {
      id: "availability",
      title: "12. Changes to the Services",
      blocks: [
        "Zero Club is growing and we regularly add, change and remove features. We try to give notice of significant changes. We may also temporarily limit the Services for maintenance, security or reasons beyond our control.",
      ],
    },
    {
      id: "termination",
      title: "13. Suspension and ending your account",
      blocks: [
        "You can stop using Zero Club at any time and ask us to delete your account from Settings or by emailing " + CONTACT_EMAIL + ". Any available wallet balance can be withdrawn before deletion, subject to section 8.",
        "We may suspend or terminate your account, or restrict features, if you break these Terms, if we are required to by law, or to protect members, Zero Club or others. Where appropriate we will tell you why and how to appeal. Sections that by their nature should continue — such as content licences needed for legal reasons, payment obligations, disclaimers and limits of liability — survive termination.",
      ],
    },
    {
      id: "disclaimers",
      title: "14. Disclaimers",
      blocks: [
        "Zero Club connects learners, tutors, creators and organisations. Unless we say so expressly, we do not create, verify or guarantee the content, courses, products, advice or outcomes offered by members, including jobs, income or certifications. Tutor approval means an application met our review standards at the time; it is not a guarantee of any particular result.",
        "The Services are provided \"as is\" and \"as available\". To the fullest extent permitted by law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose and non-infringement.",
      ],
    },
    {
      id: "liability",
      title: "15. Limitation of liability",
      blocks: [
        "To the fullest extent permitted by law, Zero Club will not be liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, revenue, data or goodwill, arising from your use of the Services. Our total liability for any claim relating to the Services is limited to the greater of the amount you paid to Zero Club in the 12 months before the claim, or ₦50,000.",
        "Nothing in these Terms limits liability that cannot be limited by law, including liability for fraud or for death or personal injury caused by negligence.",
      ],
    },
    {
      id: "indemnity",
      title: "16. Indemnity",
      blocks: [
        "If you break these Terms or the law, or your content infringes someone's rights, you agree to cover the reasonable losses, costs and legal fees that Zero Club incurs as a result, to the extent permitted by law.",
      ],
    },
    {
      id: "law",
      title: "17. Governing law and disputes",
      blocks: [
        "These Terms are governed by the laws of the Federal Republic of Nigeria. If a dispute arises, please contact us first — most concerns can be resolved quickly. If we cannot resolve it informally within 30 days, the courts of Nigeria will have jurisdiction, unless the law where you live gives you the right to bring a claim in your local courts.",
      ],
    },
    {
      id: "changes",
      title: "18. Changes to these Terms",
      blocks: [
        "We may update these Terms from time to time. When we make material changes we will notify you in the app or by email before they take effect. Continuing to use the Services after that means you accept the updated Terms.",
      ],
    },
    {
      id: "contact",
      title: "19. Contact us",
      blocks: [
        "Questions about these Terms? Email " + CONTACT_EMAIL + " or use the contact form on zeroclubs.xyz.",
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  slug: "privacy",
  eyebrow: "Legal",
  title: "Privacy Policy",
  summary:
    "How Zero Club collects, uses, shares and protects your personal information, and the choices and rights you have. We collect only what we need to run a trusted community for learners and builders.",
  highlights: [
    { title: "We don't sell your data", body: "Your personal information is never sold to advertisers or data brokers." },
    { title: "No passwords stored", body: "You sign in with one-time email codes or Google, so there is no password to leak." },
    { title: "You're in control", body: "Access, correct, download or delete your information at any time." },
    { title: "Protected by law", body: "We follow the Nigeria Data Protection Act 2023 and similar laws where you live." },
  ],
  sections: [
    {
      id: "scope",
      title: "1. About this policy",
      blocks: [
        "This Privacy Policy explains how Zero Club (\"we\", \"us\") handles personal information when you use zeroclubs.xyz, our mobile apps, ZeroStart and our related services (the \"Services\"). Zero Club is the data controller for the personal information described here.",
        "It should be read together with our Terms of Service. If you have questions, contact us at " + PRIVACY_EMAIL + ".",
      ],
    },
    {
      id: "collect",
      title: "2. Information we collect",
      blocks: [
        "Information you give us:",
        { list: [
          "Account details — your email address, name, username, profile photo, banner, bio, location, website and interests.",
          "Your content — posts, Ships, comments, messages, club messages, notes, voice notes, images, videos and anything else you upload.",
          "Applications — for example Tutor or Ambassador applications, including your professional headline, experience, links (such as LinkedIn or a portfolio), availability and sample class.",
          "Payments and payouts — purchase history and, if you withdraw earnings, the bank name, account name and account number you provide. Card details are handled by our payment partners, not stored by us.",
          "Communications — messages you send to our team, reports and feedback.",
        ] },
        "Information collected automatically:",
        { list: [
          "Usage information — pages and features you use, actions such as likes, follows and joins, and approximate times of activity.",
          "Device information — device and browser type, operating system, app version, IP address and an anonymous device identifier we create to keep accounts one-per-person and to prevent abuse.",
          "Notification data — if you turn on push notifications, a push subscription token for your device.",
          "Cookies and local storage — small files on your device that keep you signed in, remember your preferences (such as your theme) and keep the app working. We do not use third-party advertising cookies.",
        ] },
        "Information from others:",
        { list: [
          "Google sign-in — if you choose it, your name, email address and profile photo from Google.",
          "Other members — for example when someone mentions you, tags your work, sends you a message, invites you to a club or refers you.",
          "Payment partners — confirmation that a payment succeeded or failed.",
        ] },
      ],
    },
    {
      id: "use",
      title: "3. How we use your information",
      blocks: [
        { list: [
          "To provide the Services — create and secure your account, show your profile and content, run clubs, bootcamps, live classes, messaging, the store and your wallet.",
          "To keep Zero Club safe — verify email providers, enforce one account per person, review Tutor and Ambassador applications, detect spam, fraud and abuse, and act on reports.",
          "To process payments and payouts — take payments, credit earnings and commissions, and pay out to your bank.",
          "To communicate with you — sign-in codes, notifications you have turned on, important service and security messages, and replies to your requests.",
          "To personalise — show relevant posts, clubs, bootcamps and people based on your interests and activity.",
          "To improve — understand how features are used, fix problems and develop new features.",
          "To meet legal obligations — keep records required by law and respond to lawful requests.",
        ] },
      ],
    },
    {
      id: "legal-basis",
      title: "4. Our legal bases",
      blocks: [
        "We process personal information only where we have a lawful basis: to perform our contract with you (providing the Services), with your consent (for example push notifications or optional profile information, which you can withdraw at any time), for our legitimate interests (keeping the community safe, preventing fraud and improving the Services, balanced against your rights), and to comply with legal obligations.",
      ],
    },
    {
      id: "sharing",
      title: "5. How information is shared",
      blocks: [
        { list: [
          "With the community — your public profile and public posts are visible to everyone. Club content is visible to that club's members. Direct messages are visible to the people in the conversation.",
          "With tutors, club owners and institutions — when you join their bootcamp, class or club, they can see your profile and your participation, such as progress, submissions and attendance.",
          "With Ambassadors — an Ambassador who referred you can see that you joined and the value of purchases that earned them commission, but not your messages or payment details.",
          "With service providers — companies that host and run parts of the Services for us under contract, including database and storage hosting, website hosting, live video, email delivery, push notification delivery and payment processing. They may only use your information to provide services to us.",
          "For legal reasons — when required by law, court order or a lawful request by authorities, or to protect the rights, safety and property of our members, Zero Club or others.",
          "Business changes — if Zero Club is involved in a merger, acquisition or sale of assets, your information may transfer as part of it, and we will tell you before it becomes subject to a different privacy policy.",
        ] },
        { note: "We do not sell your personal information, and we do not share it with advertisers." },
      ],
    },
    {
      id: "transfers",
      title: "6. International transfers",
      blocks: [
        "Some of our service providers store or process data outside Nigeria. When your information is transferred abroad, we use providers with strong security and appropriate safeguards, as required by the Nigeria Data Protection Act 2023 and other applicable laws.",
      ],
    },
    {
      id: "retention",
      title: "7. How long we keep it",
      blocks: [
        "We keep your information for as long as your account is active and as needed to provide the Services. When you delete content, it is removed from the Services and from our backups within a reasonable period. When you delete your account, we delete or anonymise your personal information within 30 days, except where we must keep certain records for longer — for example payment, tax and fraud-prevention records, or information connected to an open report or legal claim.",
      ],
    },
    {
      id: "security",
      title: "8. Security",
      blocks: [
        "We protect your information with industry-standard measures, including encryption in transit, passwordless sign-in, access controls that limit who can see each piece of data, and database rules that stop members reading information that isn't theirs. No system is completely secure, so please keep access to your email account safe and tell us immediately at " + PRIVACY_EMAIL + " if you notice anything suspicious.",
      ],
    },
    {
      id: "rights",
      title: "9. Your rights and choices",
      blocks: [
        "Depending on where you live, you have the right to:",
        { list: [
          "access the personal information we hold about you and receive a copy;",
          "correct information that is inaccurate or incomplete — most of it you can edit yourself in your profile and settings;",
          "delete your account and personal information;",
          "object to or restrict certain processing, and withdraw consent at any time;",
          "receive your information in a portable format;",
          "complain to a data protection authority — in Nigeria, the Nigeria Data Protection Commission (NDPC).",
        ] },
        "You can also control push notifications in Settings or on your device, and choose who can find and message you in your privacy settings. To exercise any right, email " + PRIVACY_EMAIL + ". We will respond within 30 days and may need to verify your identity first.",
      ],
    },
    {
      id: "children",
      title: "10. Children",
      blocks: [
        "Zero Club is not directed at children under 13, and we do not knowingly collect information from them. Members aged 13 to 17 should use the Services with a parent or guardian's permission. If you believe a child under 13 has created an account, contact us and we will delete it.",
      ],
    },
    {
      id: "changes",
      title: "11. Changes to this policy",
      blocks: [
        "We may update this Privacy Policy as the Services change. If we make material changes we will notify you in the app or by email before they take effect. The date at the top shows when it was last updated.",
      ],
    },
    {
      id: "contact",
      title: "12. Contact us",
      blocks: [
        "For privacy questions or requests, email " + PRIVACY_EMAIL + " with the subject \"Privacy\". We're happy to help.",
      ],
    },
  ],
};
