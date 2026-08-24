import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

/**
 * What a stranger sees where the buttons would be.
 *
 * Someone arriving from a shared link can read the whole thing — that is the
 * point of sharing it. What they cannot do is like, reply, or save, because
 * those need an account to belong to.
 *
 * The failure mode this replaces is worse than a locked button: the actions
 * used to be there, be pressed, and quietly do nothing. Saying so up front,
 * once, under the post is more honest than three separate errors.
 */

export function JoinToInteract({ what = "join the conversation" }: { what?: string }) {
  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pb-6 sm:px-6">
      <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tracking-tight text-foreground">
            Zero Club is where this was built
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            Create a free account to {what}, follow the people doing the work, and ship your own.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to="/signin"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-[13px] font-semibold text-foreground transition hover:bg-accent sm:flex-none"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-primary px-5 text-[13px] font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98] sm:flex-none"
          >
            Join Zero Club
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * For actions that are still rendered while signed out — the like and save
 * buttons stay visible so the page does not look broken or half-built, but
 * pressing one explains itself and offers the way in.
 */
export function promptSignIn(action = "do that") {
  toast("Join Zero Club to " + action, {
    description: "It takes a minute, and it is free.",
    action: {
      label: "Sign up",
      onClick: () => {
        window.location.href = "/signup";
      },
    },
  });
}
