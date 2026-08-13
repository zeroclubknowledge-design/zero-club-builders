import { createFileRoute } from "@tanstack/react-router";

const CONTACT_RECIPIENT = "admin@zeroclubs.xyz";
const MAX_NAME_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  description?: unknown;
  website?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendContactMessage(request: Request) {
  let payload: ContactPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Please complete the contact form and try again." }, { status: 400 });
  }

  // A hidden field catches simple form bots without revealing that their
  // submission was discarded.
  if (text(payload.website)) return Response.json({ ok: true });

  const name = text(payload.name);
  const email = text(payload.email).toLowerCase();
  const subject = text(payload.subject);
  const description = text(payload.description);

  if (!name || !email || !subject || !description) {
    return Response.json({ error: "Name, email, subject, and message are required." }, { status: 400 });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  if (name.length > MAX_NAME_LENGTH || subject.length > MAX_SUBJECT_LENGTH || description.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: "One or more fields are too long." }, { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const contactFromEmail = process.env.CONTACT_FROM_EMAIL || "Zero Club <contact@zeroclubs.xyz>";

  if (!resendApiKey) {
    console.error("Contact form email is not configured: RESEND_API_KEY is missing.");
    return Response.json({ error: "Messaging is temporarily unavailable. Please email admin@zeroclubs.xyz." }, { status: 503 });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeDescription = escapeHtml(description).replaceAll("\n", "<br />");
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: contactFromEmail,
      to: [CONTACT_RECIPIENT],
      reply_to: email,
      subject: `[Zero Club contact] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${description}`,
      html: `<h2>New Zero Club contact message</h2><p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Subject:</strong> ${safeSubject}</p><hr /><p>${safeDescription}</p>`,
    }),
  });

  if (!emailResponse.ok) {
    const providerError = await emailResponse.text();
    console.error("Contact form email failed:", emailResponse.status, providerError);
    return Response.json({ error: "Your message could not be sent. Please try again." }, { status: 502 });
  }

  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: ({ request }) => sendContactMessage(request),
    },
  },
});
