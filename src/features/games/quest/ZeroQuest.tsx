import { GameAvatar } from "@/features/games/GameAvatar";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Crown,
  Loader2,
  LogOut,
  Send,
  Trophy,
  Users,
} from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { draftKey, usePersistentDraft } from "@/lib/draftStorage";
import {
  DISTRICTS,
  questError,
  type QuestAction,
  type QuestActionResult,
  type QuestMember,
  type QuestMission,
  type QuestSnapshot,
} from "./api";
import { useQuest } from "./useQuest";
import { QuestCity } from "./QuestCity";

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#ff4fc3] px-5 text-sm font-bold text-[#190c20] transition hover:bg-[#ff85d5] disabled:opacity-40";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-40";
const input =
  "w-full min-w-0 rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#ff4fc3]/70";
type Act = (
  action: QuestAction,
  payload?: Record<string, unknown>,
) => Promise<QuestActionResult | undefined>;

export function ZeroQuest({
  roomId,
  inviteCode,
  onRoom,
  onBack,
}: {
  roomId?: string;
  inviteCode?: string;
  onRoom: (room?: string) => void;
  onBack: () => void;
}) {
  const { data: profile, isPending: profilePending } = useUser();
  const quest = useQuest(profile?.id, roomId);
  const [title, setTitle] = usePersistentDraft(draftKey(profile?.id, "quest", "city-name"), "");
  const [code, setCode] = useState(inviteCode || "");
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (inviteCode) setCode(inviteCode);
  }, [inviteCode]);
  useEffect(() => {
    setLeaveConfirm(false);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [roomId]);
  const data = quest.room.data;
  const offset = useMemo(
    () => (data ? Date.parse(data.server_now) - Date.now() : 0),
    [data?.server_now],
  );
  const serverNow = now + offset;
  const me = data?.members.find((member) => member.id === profile?.id);
  const open = async (action: "create" | "join") => {
    const result = await quest.act(
      action,
      action === "create" ? { title: title.trim() } : { code: code.trim().toUpperCase() },
    );
    if (result) onRoom(result.room_id);
  };
  const invite = async () => {
    if (!data) return;
    const url = `${window.location.origin}/app/games/quest?code=${data.room.invite_code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied. Send it to your teammates.");
    } catch {
      toast.error(`Copy the squad code below: ${data.room.invite_code}`);
    }
  };
  const leave = async () => {
    if (await quest.act("leave")) onRoom(undefined);
  };
  const roomError = roomId && quest.room.isError;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-[#0c0715] text-white"
      style={{ backgroundImage: "radial-gradient(ellipse at 80% 0%,#44204770,transparent 55%)" }}
    >
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+12px)] sm:px-7">
        <header className="flex min-w-0 items-center gap-3">
          <button
            onClick={roomId ? () => onRoom(undefined) : onBack}
            aria-label={roomId ? "Back to my cities" : "Back to Zero Games"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#ff8bd7]">
              Zero Games · Co-op
            </p>
            <h1 className="font-display text-xl font-bold">Zero Quest</h1>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-2 text-xs font-semibold">
            <Users className="h-4 w-4" />
            2–6 players
          </span>
        </header>

        {(profilePending ||
          (roomId && quest.room.isPending) ||
          (!roomId && quest.home.isPending && profile)) && (
          <div role="status" className="flex items-center justify-center gap-3 py-24 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" />
            Preparing your city…
          </div>
        )}
        {!profilePending && !profile && (
          <p className="py-20 text-center text-white/65">
            Sign in to build a city with your squad.
          </p>
        )}
        {(roomError || (!roomId && quest.home.isError)) && (
          <div className="my-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6" role="alert">
            <p>{questError(roomError ? quest.room.error : quest.home.error)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={secondary}
                onClick={() => void (roomId ? quest.room.refetch() : quest.home.refetch())}
              >
                Try again
              </button>
              {roomId && (
                <button className={secondary} onClick={() => onRoom(undefined)}>
                  My cities
                </button>
              )}
            </div>
          </div>
        )}

        {!roomId && profile && quest.home.data && (
          <>
            <div className="grid gap-6 py-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12 lg:py-12">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#ff4fc3]/25 bg-[#ff4fc3]/10 px-3 py-1.5 text-xs font-semibold text-[#ff9bdd]">
                  <Building2 className="h-4 w-4" />A city built by your skills
                </span>
                <h2 className="mt-5 max-w-lg font-display text-4xl font-bold leading-tight sm:text-5xl">
                  Big ideas.
                  <br />
                  Your squad.
                  <br />
                  <span className="text-[#ff8bd7]">One shared city.</span>
                </h2>
                <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/60">
                  Solve challenges, create useful work and review your teammates’ ideas. Bring four
                  districts to life together before the 25-minute clock runs out.
                </p>
                <div className="hidden lg:block">
                  <QuestCity missions={[]} />
                </div>
              </div>
              <div className="space-y-4 self-center">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void open("create");
                  }}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6"
                >
                  <h3 className="text-lg font-bold">Start a city</h3>
                  <p className="mb-4 mt-1 text-sm text-white/55">
                    Create a private squad and invite your people.
                  </p>
                  <label
                    className="mb-2 block text-xs font-semibold text-white/65"
                    htmlFor="quest-city-name"
                  >
                    City name
                  </label>
                  <input
                    id="quest-city-name"
                    className={input}
                    maxLength={60}
                    placeholder="e.g. The Next Builders"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <button
                    disabled={quest.busy || title.trim().length < 3}
                    className={`${primary} mt-4 w-full`}
                  >
                    {quest.busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    Create squad
                  </button>
                </form>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void open("join");
                  }}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6"
                >
                  <h3 className="text-lg font-bold">Join your teammates</h3>
                  <label
                    className="mb-2 mt-3 block text-xs font-semibold text-white/65"
                    htmlFor="quest-invite"
                  >
                    Squad code
                  </label>
                  <input
                    id="quest-invite"
                    className={`${input} font-mono uppercase tracking-widest`}
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={12}
                    placeholder="12-character code"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/[^a-f0-9]/gi, "").toUpperCase())
                    }
                  />
                  <button
                    disabled={quest.busy || code.length !== 12}
                    className={`${secondary} mt-4 w-full`}
                  >
                    Join squad
                  </button>
                </form>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Info
                title="Play together"
                text="2–6 players. Everyone readies up before the host starts."
              />
              <Info
                title="Earn 100 XP"
                text={`Contribute to a win to earn XP. ${quest.home.data.rewarded_today}/3 rewarded wins today; resets at 00:00 UTC.`}
              />
              <Info
                title={quest.home.data.wins ? "City Builder unlocked" : "City Builder achievement"}
                text={`${quest.home.data.wins} cities completed. Wins count even after your daily XP limit.`}
              />
            </div>
            <section className="mt-8">
              <h2 className="text-lg font-bold">Your cities</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {quest.home.data.rooms.length === 0 ? (
                  <p className="text-sm text-white/50">
                    Your first city starts with an invitation.
                  </p>
                ) : (
                  quest.home.data.rooms.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => onRoom(city.id)}
                      className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left"
                    >
                      <Building2 className="h-7 w-7 shrink-0 text-[#ff8bd7]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{city.title}</span>
                        <span className="mt-1 block text-xs text-white/50">
                          {city.status === "won"
                            ? `City complete · ${city.xp_awarded} XP`
                            : city.status === "active" && Date.parse(city.expires_at) > now
                              ? "In progress · resume your squad"
                              : city.status === "lobby" && Date.parse(city.expires_at) > now
                                ? "Lobby · invite your teammates"
                                : "View result"}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {roomId && data && me && !roomError && (
          <>
            <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words font-display text-2xl font-bold sm:text-3xl">
                  {data.room.title}
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  {quest.connection === "live"
                    ? "● Squad connected"
                    : quest.connection === "reconnecting"
                      ? "Reconnecting · checking for updates every 10 seconds"
                      : "Connecting to your squad…"}
                </p>
              </div>
              <button onClick={() => setLeaveConfirm((value) => !value)} className={secondary}>
                <LogOut className="h-4 w-4" />
                Leave squad
              </button>
            </div>
            {leaveConfirm && (
              <div className="mt-4 rounded-2xl border border-[#ff8b9b]/25 bg-[#ff8b9b]/10 p-4">
                <p className="text-sm">
                  Leave this squad? The others can keep playing. Going back to your cities or
                  closing the app keeps your place.
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => void leave()} disabled={quest.busy} className={secondary}>
                    Leave squad now
                  </button>
                  <button className={secondary} onClick={() => setLeaveConfirm(false)}>
                    Stay
                  </button>
                </div>
              </div>
            )}
            {data.room.status === "lobby" ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
                <section className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
                  <h3 className="text-xl font-bold">Gather your squad</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    Share the invite, get everyone ready, then build together. Eight missions bring
                    four districts to life. Wrong challenge answers cost energy; briefs need a
                    teammate’s approval.
                  </p>
                  <div className="my-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white/[0.05] p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white/50">Squad code</p>
                      <p className="mt-1 break-all font-mono text-xl font-bold tracking-[.12em]">
                        {data.room.invite_code}
                      </p>
                    </div>
                    <button onClick={() => void invite()} className={secondary}>
                      <Copy className="h-4 w-4" />
                      Copy invite
                    </button>
                  </div>
                  <Roster members={data.members} host={data.room.host_id} now={serverNow} />
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      disabled={quest.busy}
                      onClick={() => void quest.act("ready", { ready: !me.ready })}
                      className={me.ready ? secondary : primary}
                    >
                      {me.ready && <Check className="h-4 w-4" />}
                      {me.ready ? "Ready · tap to unready" : "I’m ready"}
                    </button>
                    {(me.id === data.room.host_id ||
                      !data.members.some(
                        (member) =>
                          member.id === data.room.host_id &&
                          Date.parse(member.last_seen) > serverNow - 90_000,
                      )) && (
                      <button
                        disabled={
                          quest.busy ||
                          data.members.filter(
                            (member) =>
                              !member.left_at && Date.parse(member.last_seen) > serverNow - 90_000,
                          ).length < 2 ||
                          data.members.some(
                            (member) =>
                              !member.left_at &&
                              Date.parse(member.last_seen) > serverNow - 90_000 &&
                              !member.ready,
                          )
                        }
                        onClick={() => void quest.act("start")}
                        className={primary}
                      >
                        Start building
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-white/45">
                    All connected teammates must be ready, with at least two online. Offline squad
                    members keep their place and can return.
                  </p>
                  <QuestCity missions={data.missions} />
                </section>
                <TeamChat
                  key={`${roomId}:chat`}
                  data={data}
                  userId={me.id}
                  busy={quest.busy}
                  act={quest.act}
                />
              </div>
            ) : data.room.status === "active" ? (
              <ActiveCity
                key={roomId}
                data={data}
                userId={me.id}
                now={serverNow}
                busy={quest.busy}
                act={quest.act}
              />
            ) : (
              <CityResult data={data} me={me} onHome={() => onRoom(undefined)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-white/55">{text}</p>
    </div>
  );
}

function Roster({
  members,
  host,
  now,
  showReady = true,
}: {
  members: QuestMember[];
  host: string;
  now: number;
  showReady?: boolean;
}) {
  return (
    <ul className="space-y-3" aria-label="Squad members">
      {members
        .filter((member) => !member.left_at)
        .map((member) => (
          <li key={member.id} className="flex min-w-0 items-center gap-3">
            <GameAvatar id={member.id} name={member.name} photo={member.avatar} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{member.name}</span>
                {member.id === host && (
                  <Crown aria-label="Host" className="h-3.5 w-3.5 shrink-0 text-[#ffca75]" />
                )}
              </span>
              <span className="text-xs text-white/45">
                {Date.parse(member.last_seen) < now - 90_000
                  ? "Reconnecting"
                  : member.contributions
                    ? `${member.contributions} contributions`
                    : "Connected"}
              </span>
            </span>
            {showReady && member.ready && (
              <span className="flex items-center gap-1 text-xs text-[#73e6b1]">
                <Check className="h-4 w-4" />
                Ready
              </span>
            )}
          </li>
        ))}
    </ul>
  );
}

function TeamChat({
  data,
  userId,
  busy,
  act,
}: {
  data: QuestSnapshot;
  userId: string;
  busy: boolean;
  act: Act;
}) {
  const [text, setText, clear] = usePersistentDraft(
    draftKey(userId, "quest", data.room.id, "chat"),
    "",
  );
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [data.messages.at(-1)?.id]);
  const send = async () => {
    if (await act("message", { body: text.trim() })) clear();
  };
  return (
    <section
      className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"
      aria-label="Team chat"
    >
      <h3 className="border-b border-white/10 px-5 py-4 text-sm font-bold">Squad chat</h3>
      <div
        ref={scroll}
        className="h-[240px] space-y-3 overflow-y-auto px-4 py-4 lg:h-[320px]"
        role="log"
        aria-label="Squad messages"
        aria-live="polite"
      >
        {data.messages.length === 0 && (
          <p className="text-xs leading-relaxed text-white/40">
            Plan your next move here. Messages belong to this squad only.
          </p>
        )}
        {data.messages.map((message) => (
          <div
            key={message.id}
            className={
              message.profile_id === userId
                ? "ml-4 rounded-2xl bg-[#ff4fc3]/10 p-3"
                : "mr-4 rounded-2xl bg-white/[0.05] p-3"
            }
          >
            <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-[#ff9bdd]">
              <GameAvatar id={message.profile_id} name={data.members.find(member => member.id === message.profile_id)?.name || "Teammate"} photo={data.members.find(member => member.id === message.profile_id)?.avatar} className="h-6 w-6" />
              {data.members.find((member) => member.id === message.profile_id)?.name || "Teammate"}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/80">
              {message.body}
            </p>
          </div>
        ))}
      </div>
      <form
        className="flex items-end gap-2 border-t border-white/10 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="Message your squad"
          rows={2}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${input} resize-none`}
          placeholder="Plan with your squad…"
        />
        <button
          aria-label="Send squad message"
          disabled={busy || !text.trim()}
          className={`${primary} !h-11 !w-11 shrink-0 !p-0`}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

function ActiveCity({
  data,
  userId,
  now,
  busy,
  act,
}: {
  data: QuestSnapshot;
  userId: string;
  now: number;
  busy: boolean;
  act: Act;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [side, setSide] = useState<"mission" | "chat">("mission");
  const boardRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const openMission = (id: string) => {
    setSelected(id);
    setSide("mission");
    if (window.matchMedia("(max-width: 1023px)").matches)
      requestAnimationFrame(() => {
        workspaceRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "start",
        });
      });
  };
  const mission =
    data.missions.find((item) => item.id === selected) ||
    data.missions.find((item) => item.status !== "complete") ||
    data.missions[0];
  const complete = data.missions.filter((item) => item.status === "complete").length;
  const seconds = Math.max(0, Math.ceil((Date.parse(data.room.expires_at) - now) / 1000));
  return (
    <>
      <div className="my-5 grid grid-cols-3 gap-2">
        <Stat
          label="Time left"
          value={`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
        />
        <Stat label="City energy" value={`${data.room.health}/12`} />
        <Stat label="Missions built" value={`${complete}/8`} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section
          ref={boardRef}
          className="min-w-0 scroll-mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Your shared city</h3>
            <span className="text-xs text-white/50">{Math.round((complete / 8) * 100)}% built</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#ff4fc3] transition-all duration-700"
              style={{ width: `${(complete / 8) * 100}%` }}
            />
          </div>
          <QuestCity missions={data.missions} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DISTRICTS.map((district) => (
              <div
                key={district.key}
                role="group"
                aria-label={`${district.name} missions`}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
              >
                <p className="text-sm font-bold" style={{ color: district.color }}>
                  {district.name}
                </p>
                <p className="mb-3 mt-1 text-[11px] text-white/40">{district.building}</p>
                <div className="flex flex-wrap gap-2">
                  {data.missions
                    .filter((item) => item.district === district.key)
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => openMission(item.id)}
                        aria-pressed={mission?.id === item.id && side === "mission"}
                        className={`flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold ${item.status === "complete" ? "bg-[#73e6b1]/10 text-[#73e6b1]" : item.id === mission?.id && side === "mission" ? "bg-white/15 text-white" : "bg-white/[0.05] text-white/60"}`}
                      >
                        {item.status === "complete" ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : item.status === "review" ? (
                          <Clock3 className="h-3.5 w-3.5" />
                        ) : null}
                        {item.kind === "challenge"
                          ? "Challenge"
                          : item.status === "review"
                            ? "Review brief"
                            : "Creative brief"}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <Roster members={data.members} host={data.room.host_id} now={now} showReady={false} />
          </div>
        </section>
        <div ref={workspaceRef} className="min-w-0 scroll-mt-4">
          <button
            className={`${secondary} mb-3 lg:hidden`}
            onClick={() => boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to city
          </button>
          <div
            className="mb-3 flex gap-1 rounded-full bg-white/[0.05] p-1"
            role="group"
            aria-label="Squad workspace"
          >
            <button
              className={`min-h-10 flex-1 rounded-full text-sm font-semibold ${side === "mission" ? "bg-white text-[#190c20]" : "text-white/60"}`}
              onClick={() => setSide("mission")}
            >
              Mission
            </button>
            <button
              className={`min-h-10 flex-1 rounded-full text-sm font-semibold ${side === "chat" ? "bg-white text-[#190c20]" : "text-white/60"}`}
              onClick={() => setSide("chat")}
            >
              Squad chat
            </button>
          </div>
          {side === "chat" ? (
            <TeamChat data={data} userId={userId} busy={busy} act={act} />
          ) : (
            mission && (
              <MissionPanel
                key={mission.id}
                mission={mission}
                members={data.members}
                userId={userId}
                busy={busy}
                act={act}
              />
            )
          )}
        </div>
      </div>
      {seconds === 0 && (
        <p role="status" className="mt-4 text-sm text-white/60">
          Time’s up. Checking your city’s final result…
        </p>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4">
      <p className="text-[10px] text-white/50 sm:text-xs">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

function MissionPanel({
  mission,
  members,
  userId,
  busy,
  act,
}: {
  mission: QuestMission;
  members: QuestMember[];
  userId: string;
  busy: boolean;
  act: Act;
}) {
  const district = DISTRICTS.find((item) => item.key === mission.district)!;
  const [choice, setChoice] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const [work, setWork, clearWork] = usePersistentDraft(
    draftKey(userId, "quest", mission.id, "work"),
    "",
  );
  const [url, setUrl, clearUrl] = usePersistentDraft(
    draftKey(userId, "quest", mission.id, "url"),
    "",
  );
  const [feedback, setFeedback] = usePersistentDraft(
    draftKey(userId, "quest", mission.id, "feedback"),
    "",
  );
  const restored = useRef(false);
  useEffect(() => {
    if (mission.status !== "open") {
      restored.current = false;
      return;
    }
    if (restored.current) return;
    restored.current = true;
    if (!work && mission.author_id === userId && mission.work) {
      setWork(mission.work);
      setUrl(mission.work_url || "");
    }
  }, [
    mission.status,
    mission.author_id,
    mission.work,
    mission.work_url,
    userId,
    work,
    setWork,
    setUrl,
  ]);
  const submit = async () => {
    if (await act("submit", { mission: mission.id, work, url: url.trim() })) {
      clearWork();
      clearUrl();
    }
  };
  const revise = async () => {
    if (await act("revise", { mission: mission.id })) {
      setWork(mission.work || "");
      setUrl(mission.work_url || "");
    }
  };
  const approve = async (value: boolean) => {
    if (await act("review", { mission: mission.id, approve: value, feedback })) setFeedback("");
  };
  return (
    <section
      aria-label="Mission details"
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6"
    >
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: district.color }}>
        {district.name}
      </p>
      <h3 className="mt-2 text-xl font-bold">
        {mission.kind === "challenge" ? "Unlock the foundation" : "Make something useful"}
      </h3>
      {mission.status === "complete" ? (
        <>
          <div className="my-5 flex items-center gap-2 text-[#73e6b1]">
            <CheckCircle2 className="h-6 w-6" />
            <p className="font-semibold">Mission complete</p>
          </div>
          <p className="text-sm text-white/60">
            Built by{" "}
            {members.find((member) => member.id === mission.author_id)?.name || "your teammate"}
            {mission.reviewer_id
              ? ` · reviewed by ${members.find((member) => member.id === mission.reviewer_id)?.name || "a teammate"}`
              : ""}
            .
          </p>
          {mission.work && (
            <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-white/[0.04] p-4 text-sm leading-relaxed text-white/75">
              {mission.work}
            </p>
          )}
        </>
      ) : mission.kind === "challenge" ? (
        <>
          <p className="my-5 text-sm leading-relaxed text-white/85">{mission.prompt}</p>
          <div className="space-y-2" role="group" aria-label="Challenge answers">
            {mission.choices?.map((text, index) => (
              <button
                key={index}
                onClick={() => setChoice(index)}
                aria-pressed={choice === index}
                disabled={busy}
                className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border p-3 text-left text-sm ${choice === index ? "border-[#ff4fc3]/70 bg-[#ff4fc3]/10" : "border-white/10 bg-white/[0.03]"}`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs">
                  {String.fromCharCode(65 + index)}
                </span>
                {text}
              </button>
            ))}
          </div>
          <button
            disabled={busy || choice === null}
            onClick={() => void act("answer", { mission: mission.id, choice })}
            className={`${primary} mt-5 w-full`}
          >
            {busy ? "Checking…" : "Submit answer"}
          </button>
          <button
            className="mt-4 min-h-10 text-xs font-semibold text-white/55 underline underline-offset-4"
            onClick={() => setHint((value) => !value)}
          >
            {hint ? "Hide hint" : "Need a hint?"}
          </button>
          {hint && <p className="mt-1 text-sm leading-relaxed text-white/60">{mission.hint}</p>}
          <p className="mt-3 text-xs text-white/40">
            A wrong answer costs 1 energy. Talk it through with your squad.
          </p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm leading-relaxed text-white/75">{district.brief}</p>
          <ul className="my-4 space-y-2">
            {district.checklist.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-white/55">
                <Check className="h-3.5 w-3.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          {mission.feedback && (
            <div className="mb-4 rounded-2xl bg-[#ffb547]/10 p-3 text-sm text-[#ffd59c]">
              Review note: {mission.feedback}
            </div>
          )}
          {mission.status === "review" ? (
            <>
              <p className="mb-2 text-xs text-white/45">
                Submitted by{" "}
                {members.find((member) => member.id === mission.author_id)?.name || "your teammate"}
              </p>
              <p className="max-h-[360px] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-white/[0.05] p-4 text-sm leading-relaxed">
                {mission.work}
              </p>
              {mission.work_url && (
                <a
                  href={mission.work_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-10 items-center break-all text-sm text-[#ff9bdd] underline"
                >
                  Open submitted work
                </a>
              )}
              {mission.author_id === userId ? (
                <>
                  <p className="mt-4 text-sm text-white/55">
                    Waiting for a teammate to check the brief against the three criteria above.
                  </p>
                  <button
                    className={`${secondary} mt-4`}
                    disabled={busy}
                    onClick={() => void revise()}
                  >
                    Withdraw and edit
                  </button>
                </>
              ) : (
                <div className="mt-4">
                  <label
                    className="mb-2 block text-xs font-semibold text-white/60"
                    htmlFor="quest-review"
                  >
                    Review note
                  </label>
                  <textarea
                    id="quest-review"
                    className={`${input} min-h-24 resize-y`}
                    maxLength={500}
                    placeholder="What works? What could improve?"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                  <p className="mt-2 text-xs leading-relaxed text-white/40">
                    Approve only if the work addresses all three criteria. This is a teammate
                    review, not a professional certification.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => void approve(true)} className={primary}>
                      Approve brief
                    </button>
                    <button
                      disabled={busy || feedback.trim().length < 10}
                      onClick={() => void approve(false)}
                      className={secondary}
                    >
                      Request changes
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label
                htmlFor="quest-work"
                className="mb-2 block text-xs font-semibold text-white/65"
              >
                Your work
              </label>
              <textarea
                id="quest-work"
                rows={8}
                className={`${input} resize-y leading-relaxed`}
                maxLength={4000}
                placeholder="Write your response, plan or code here…"
                value={work}
                onChange={(e) => setWork(e.target.value)}
              />
              <p className="mt-1 text-right text-[11px] text-white/40">
                {work.trim().length}/4,000 · minimum 120
              </p>
              <label
                htmlFor="quest-work-url"
                className="mb-2 mt-4 block text-xs font-semibold text-white/65"
              >
                Project or prototype link (optional)
              </label>
              <input
                id="quest-work-url"
                className={input}
                type="url"
                maxLength={500}
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                className={`${primary} mt-5 w-full`}
                disabled={busy || work.trim().length < 120}
              >
                Submit for teammate review
              </button>
              <p className="mt-3 text-xs text-white/40">
                Your unfinished work is saved on this device.
              </p>
            </form>
          )}
        </>
      )}
    </section>
  );
}

function CityResult({
  data,
  me,
  onHome,
}: {
  data: QuestSnapshot;
  me: QuestMember;
  onHome: () => void;
}) {
  const won = data.room.status === "won";
  const copyWork = async () => {
    const work = data.missions
      .filter((mission) => mission.author_id === me.id && mission.work)
      .map(
        (mission) =>
          `${DISTRICTS.find((district) => district.key === mission.district)!.name}\n${mission.work}${mission.work_url ? `\n${mission.work_url}` : ""}`,
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(
        `Zero Quest · ${data.room.title}\nCommunity-reviewed game work\n\n${work}`,
      );
      toast.success("Your work is copied. You can develop it into a portfolio project.");
    } catch {
      toast.error("Could not copy. Your work remains saved in this city.");
    }
  };
  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-8">
      <div className="mx-auto max-w-lg text-center">
        <span
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${won ? "bg-[#ffb547]/10 text-[#ffca75]" : "bg-white/10 text-white/50"}`}
        >
          <Trophy className="h-8 w-8" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-widest text-[#ff9bdd]">
          {won ? "Built together" : "Every attempt teaches you something"}
        </p>
        <h3 className="mt-2 font-display text-3xl font-bold">
          {won
            ? "Your city is alive."
            : data.room.status === "cancelled"
              ? "This squad has closed."
              : "Your city needs another try."}
        </h3>
        <p className="mt-4 text-sm leading-relaxed text-white/60">
          {won
            ? "All four districts are complete. Your squad turned ideas into something useful."
            : data.room.health === 0
              ? "Your squad ran out of energy. Use the hints, compare ideas and come back with a new plan."
              : "The game ended before every district was complete. Your submitted work is still saved here."}
        </p>
        <div className="my-6 rounded-2xl bg-white/[0.05] p-5">
          <p className="text-3xl font-bold text-[#73e6b1]">+{me.xp_awarded} XP</p>
          <p className="mt-2 text-xs text-white/50">
            {me.reward_note || "Complete a city and contribute to earn win XP."}
          </p>
          {won && me.contributions > 0 && (
            <p className="mt-3 text-sm font-semibold text-[#ffca75]">
              City Builder · completed city added
            </p>
          )}
        </div>
      </div>
      <QuestCity missions={data.missions} />
      <div className="mx-auto max-w-lg">
        {data.missions.some((mission) => mission.work) && (
          <details className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-sm font-bold">Your squad’s saved work</summary>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
              Game submissions and teammate reviews, saved with this city.
            </p>
            {data.missions
              .filter((mission) => mission.work)
              .map((mission) => (
                <article key={mission.id} className="mt-4 border-t border-white/10 pt-4">
                  <h4 className="text-sm font-semibold">
                    {DISTRICTS.find((district) => district.key === mission.district)!.name}
                  </h4>
                  <p className="mt-1 text-xs text-white/45">
                    {data.members.find((member) => member.id === mission.author_id)?.name ||
                      "Teammate"}
                    {mission.status === "complete" ? " · teammate approved" : " · unfinished"}
                  </p>
                  <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-white/75">
                    {mission.work}
                  </p>
                  {mission.work_url && (
                    <a
                      className="mt-3 inline-flex min-h-10 items-center break-all text-sm text-[#ff9bdd] underline"
                      href={mission.work_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open submitted work
                    </a>
                  )}
                </article>
              ))}
          </details>
        )}
        <h4 className="mb-4 text-sm font-bold">Squad contributions</h4>
        {data.members
          .filter((member) => !member.left_at)
          .map((member) => (
            <div
              key={member.id}
              className="flex min-w-0 items-center justify-between gap-3 border-t border-white/10 py-3 text-sm"
            >
              <span className="truncate">
                {member.name} · {member.contributions}
              </span>
              <span className="shrink-0 font-semibold text-[#73e6b1]">+{member.xp_awarded} XP</span>
            </div>
          ))}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {data.missions.some((mission) => mission.author_id === me.id && mission.work) && (
            <button className={secondary} onClick={() => void copyWork()}>
              <Copy className="h-4 w-4" />
              Copy my work
            </button>
          )}
          <button className={primary} onClick={onHome}>
            Back to my cities
          </button>
        </div>
      </div>
    </section>
  );
}
