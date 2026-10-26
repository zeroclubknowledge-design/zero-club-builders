/**
 * The welcome email every new member gets once, right after they confirm
 * their email. Table layout and inline styles only, so it renders the same in
 * Gmail, Outlook and Apple Mail. Matches the sign-in code email (same card,
 * logo tile and footer) so the two read as one brand.
 */

const SITE = "https://www.zeroclubs.xyz";
const BRAND = "#c3217e";
const INK = "#201b1f";
const MUTED = "#70666d";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const STEPS = [
  {
    title: "Complete your profile",
    body: "Add a photo, a one-line headline and your skills, so people know who you are and what you build.",
    cta: "Set up my profile",
    path: "/app/profile",
  },
  {
    title: "Join a Club",
    body: "Clubs are communities built around a craft. Join one or two to meet people doing the same work and see what they're shipping.",
    cta: "Explore Clubs",
    path: "/app/clubs",
  },
  {
    title: "Start a Bootcamp",
    body: "Learn by doing with guided, hands-on Bootcamps run by Clubs and tutors, and earn a certificate when you finish.",
    cta: "Browse Bootcamps",
    path: "/app/bootcamps",
  },
  {
    title: "Ship your first proof",
    body: "Post something you've built, however small. Real work is how you get noticed on Zero Club, and every proof adds to your portfolio.",
    cta: "Ship a proof",
    path: "/app/ship",
  },
];

export function welcomeEmail({ name }: { name: string }) {
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  const safeFirst = escapeHtml(first);
  const subject = `Welcome to Zero Club, ${first}`;
  const preheader = "You're in. Here's how to get the most out of your first week.";

  const steps = STEPS.map(
    (step, i) => `
            <tr>
              <td style="padding:0 0 18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="40" valign="top" style="width:40px;padding-top:1px;">
                      <div style="width:30px;height:30px;border-radius:15px;background:#f9e7f4;color:${BRAND};font-size:14px;font-weight:700;line-height:30px;text-align:center;">${i + 1}</div>
                    </td>
                    <td valign="top">
                      <div style="font-size:16px;font-weight:700;color:${INK};line-height:1.35;">${step.title}</div>
                      <div style="margin-top:4px;font-size:14px;color:${MUTED};line-height:1.6;">${step.body}</div>
                      <a href="${SITE}${step.path}" style="display:inline-block;margin-top:8px;font-size:14px;font-weight:700;color:${BRAND};text-decoration:none;">${step.cta} &rarr;</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`,
  ).join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f7f6f2;color:${INK};font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f6f2;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e3e6;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 22px;border-bottom:1px solid #eee9ec;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="38" height="38" bgcolor="#f9e7f4" style="width:38px;height:38px;vertical-align:middle;padding:0;border-radius:8px;overflow:hidden;">
                      <img src="${SITE}/email-logo.png" width="38" height="38" alt="Zero Club" style="display:block;width:38px;height:38px;border:0;background:#f9e7f4;color:${BRAND};font-size:9px;line-height:38px;text-align:center;" />
                    </td>
                    <td style="vertical-align:middle;padding-left:12px;font-size:18px;font-weight:700;color:${INK};">Zero Club</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND};">Welcome aboard</div>
                <h1 style="margin:12px 0 12px;font-size:28px;line-height:1.2;font-weight:600;color:${INK};">You're in, ${safeFirst}.</h1>
                <p style="margin:0;color:${MUTED};font-size:15px;line-height:1.7;">Zero Club is where people learn by building, prove their skills with real work, and grow alongside others who care about the same things. Your account is ready. Here's how to make the most of your first week.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 30px;">
                  <tr>
                    <td bgcolor="${BRAND}" style="border-radius:999px;">
                      <a href="${SITE}/app" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Open Zero Club</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <div style="border-top:1px solid #eee9ec;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 10px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#8a8086;margin-bottom:18px;">Your first steps</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${steps}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf3f8;border-radius:10px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <div style="font-size:15px;font-weight:700;color:${INK};">Also part of your account</div>
                      <div style="margin-top:10px;font-size:14px;color:${MUTED};line-height:1.65;">
                        <a href="https://form.zeroclubs.xyz" style="color:${INK};font-weight:700;text-decoration:none;">Zero Form</a> &middot; register for bootcamps, waitlists and events from every Club.<br />
                        <a href="https://gifts.zeroclubs.xyz" style="color:${INK};font-weight:700;text-decoration:none;">Zero Gifts</a> &middot; send and claim gift cards for learning on Zero Club.
                      </div>
                      <div style="margin-top:10px;font-size:13px;color:#8a8086;line-height:1.6;">Sign in to both with this same account. No new password needed.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 34px;">
                <p style="margin:0;font-size:14px;color:${MUTED};line-height:1.7;">Questions, ideas or stuck on something? Just reply to this email and a real person on the team will get back to you.</p>
                <p style="margin:16px 0 0;font-size:14px;color:${INK};line-height:1.6;">Glad you're here,<br /><b>The Zero Club team</b></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#fbfaf8;border-top:1px solid #eee9ec;color:#8a8086;font-size:11px;line-height:1.6;">Build proof. Find your people. Move your work forward.<br />You're receiving this because you just created a Zero Club account. This is a one-time welcome email.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `You're in, ${first}.`,
    "",
    "Zero Club is where people learn by building, prove their skills with real work, and grow alongside others who care about the same things. Your account is ready. Here's how to make the most of your first week.",
    "",
    `Open Zero Club: ${SITE}/app`,
    "",
    "YOUR FIRST STEPS",
    ...STEPS.flatMap((step, i) => [`${i + 1}. ${step.title}`, `   ${step.body}`, `   ${SITE}${step.path}`, ""]),
    "ALSO PART OF YOUR ACCOUNT",
    "Zero Form (https://form.zeroclubs.xyz): register for bootcamps, waitlists and events from every Club.",
    "Zero Gifts (https://gifts.zeroclubs.xyz): send and claim gift cards for learning on Zero Club.",
    "",
    "Questions, ideas or stuck on something? Just reply to this email and a real person on the team will get back to you.",
    "",
    "Glad you're here,",
    "The Zero Club team",
  ].join("\n");

  return { subject, html, text };
}
