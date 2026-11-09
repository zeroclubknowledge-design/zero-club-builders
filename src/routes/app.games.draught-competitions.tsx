import { useGoBack } from "@/hooks/useGoBack";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { confirmCard } from "@/components/ConfirmCard";
import { Trophy, ArrowLeft, Plus } from "@/components/icons/glyphs";
export const Route = createFileRoute("/app/games/draught-competitions")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" && /^[a-f0-9-]{36}$/i.test(search.id) ? search.id : undefined,
  }),
  component: Competitions,
});
type Competition = {
  id: string;
  title: string;
  capacity: number;
  entry_fee: number;
  prize_splits: number[];
  fee_percent: number;
  fee_amount: number;
  host_fee_share: number;
  net_prize_pool: number | null;
  host_pool: number;
  prize_pool: number;
  status: string;
  creator_id: string;
  registration_ends_at: string;
  players?: number;
  joined?: boolean;
};
type Person = { id: string; name: string; photo?: string };
type Fixture = {
  id: string;
  round: number;
  slot: number;
  kind: string;
  red_id: string;
  black_id: string | null;
  winner: string | null;
  room_id: string | null;
  attempt: number;
};
type Detail = {
  competition: Competition;
  players: Person[];
  fixtures: Fixture[];
  awards: Array<{ place: number; profile_id: string; amount: number }>;
  you: string;
};
async function action<T>(p_action: string, p_id?: string, p_payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc("zero_draught_competition", {
    p_action,
    p_id: p_id || null,
    p_payload,
  });
  if (error)
    throw new Error(
      /PGRST202|schema cache|does not exist/i.test(error.message)
        ? "Draught competitions need the latest database update."
        : error.message,
    );
  return data as T;
}
const field =
  "min-h-12 w-full rounded-2xl bg-white/[0.06] px-4 py-3 text-white outline-none focus:ring-1 focus:ring-[#c3217e]";
function Competitions() {
  const goBack = useGoBack("/app/games/draught");
  const { id } = Route.useSearch(),
    navigate = useNavigate(),
    client = useQueryClient();
  const { format, toBaseAmount, currency } = useWalletCurrency();
  const [hosting, setHosting] = useState(false),
    [busy, setBusy] = useState(false),
    [title, setTitle] = useState(""),
    [capacity, setCapacity] = useState("8"),
    [fee, setFee] = useState("0"),
    [pool, setPool] = useState("0");
  const [splits, setSplits] = useState(["50", "30", "20"]);
  const percentages = splits.map(Number);
  const previewRate = Number(capacity) < 100 ? 30 : 20;
  const previewEntries = Math.round(toBaseAmount(Number(fee) || 0)) * Number(capacity || 0);
  const previewDeduction = Math.floor((previewEntries * previewRate) / 100);
  const previewPool =
    Math.round(toBaseAmount(Number(pool) || 0)) + previewEntries - previewDeduction;
  const request = useRef(crypto.randomUUID());
  const list = useQuery({
    queryKey: ["draught-competitions"],
    queryFn: () => action<Competition[]>("list"),
    enabled: !id,
    refetchInterval: 10000,
  });
  const detail = useQuery({
    queryKey: ["draught-competition", id],
    queryFn: () => action<Detail>("detail", id),
    enabled: !!id,
    refetchInterval: (query) =>
      ["finished", "cancelled"].includes(query.state.data?.competition.status || "") ? false : 3000,
  });
  const data = detail.data,
    c = data?.competition;
  useEffect(() => {
    if (c?.status !== "finished") return;
    void client.invalidateQueries({ queryKey: ["withdrawable"] });
    void client.invalidateQueries({ queryKey: ["profile", "current"] });
  }, [c?.status, client]);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["draught-competition"] });
    void client.invalidateQueries({ queryKey: ["draught-competitions"] });
    void client.invalidateQueries({ queryKey: ["profile", "current"] });
  };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    run(async () => {
      const n = Number(capacity),
        entry = Math.round(toBaseAmount(Number(fee))),
        contribution = Math.round(toBaseAmount(Number(pool)));
      if (!Number.isInteger(n) || n < 4 || n > 128 || n % 2)
        throw Error("Choose an even participant limit from 4 to 128.");
      if ((Number(fee) > 0 && entry < 1) || (Number(pool) > 0 && contribution < 1))
        throw Error("The minimum fee or contribution is the equivalent of 1 NGN.");
      if (
        percentages.length !== 3 ||
        percentages.some((p) => !Number.isInteger(p) || p < 1) ||
        percentages.reduce((a, b) => a + b, 0) !== 100
      )
        throw Error("Three positive prize percentages must add up to 100.");
      if (previewPool > 0 && percentages.some((p) => Math.floor((previewPool * p) / 100) < 1))
        throw Error("Increase the prize pool so each winner receives at least 1 NGN after fees.");
      if (
        title.trim().length < 3 ||
        ![entry, contribution].every((value) => Number.isSafeInteger(value) && value >= 0)
      )
        throw Error("Enter a name and valid funding amounts.");
      if (
        contribution > 0 &&
        !(await confirmCard(
          `Reserve ${format(contribution)} from your wallet for this competition's prizes?`,
        ))
      )
        return;
      const result = await action<{ id: string }>("create", undefined, {
        title: title.trim(),
        capacity: n,
        entry_fee: entry,
        host_pool: contribution,
        prize_splits: percentages,
        request_id: request.current,
      });
      request.current = crypto.randomUUID();
      setHosting(false);
      void navigate({ to: "/app/games/draught-competitions", search: { id: result.id } });
    });
  const join = () =>
    run(async () => {
      if (!c) return;
      if (
        !(await confirmCard(
          `${c.entry_fee ? `Pay ${format(c.entry_fee)} to register? A ${c.fee_percent}% fee is deducted; half of that fee goes to the host. The remaining funds go to the three winners.` : "Join this free competition?"} Play starts automatically when all ${c.capacity} places fill. Stay ready.`,
        ))
      )
        return;
      await action("join", c.id);
    });
  const name = (pid: string | null) =>
    data?.players.find((player) => player.id === pid)?.name || "Bye";
  return (
    <main className="fixed inset-0 z-[60] overflow-y-auto bg-[#140a21] text-white">
      <div className="mx-auto max-w-4xl px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => id
              ? void navigate({ to: "/app/games/draught-competitions", search: { id: undefined }, replace: true })
              : goBack()}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#ffca75]">Zero Draught</p>
            <h1 className="truncate font-display text-xl font-bold">
              {c?.title || "Competitions"}
            </h1>
          </div>
          {!id && (
            <button
              onClick={() => setHosting(!hosting)}
              className="flex items-center gap-1 rounded-full bg-[#c3217e] px-4 py-3 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              Host
            </button>
          )}
        </header>
        <details className="mb-5 rounded-2xl bg-white/[0.04] p-4 text-sm leading-relaxed text-white/70">
          <summary className="cursor-pointer font-semibold text-white">
            Competition rules & prizes
          </summary>
          <p className="mt-3">
            Even participant limits of 4–128. Registration starts the bracket automatically when
            full. Byes in the first round make even numbers such as 6 or 10 work. Winners advance;
            semifinal losers play for third.
          </p>
          <p className="mt-2">
            Hosts choose free or paid registration and the three prize percentages. Fees are 30%
            below 100 players and 20% from 100 players upward. The creator receives half of that
            fee; Zero Club retains the other half. Extra host prize contributions are not charged a
            fee. The remaining pool is split between the top three, with rounding going to first.
            Cash prizes and host earnings are withdrawable through Zero Club wallets. Hosts cannot
            enter their own competition.
          </p>
          <p className="mt-2">
            Matches allow a two-minute arrival period and ten minutes per player. A draw is replayed
            with colours swapped. The third attempt is a 5-minute red / 4-minute black tiebreak;
            black advances if it is drawn. Missing your turn deadline forfeits the match.
          </p>
          <p className="mt-2">
            Registration expires after seven days if not full, refunding fees and the host
            contribution. Hosts can cancel before play starts for the same refund. Individual
            withdrawals are unavailable after registering.
          </p>
        </details>
        {hosting && !id && (
          <section className="mb-6 space-y-4 rounded-[26px] bg-white/[0.05] p-5">
            <h2 className="text-lg font-bold">Host a competition</h2>
            <label className="block text-sm">
              Name
              <input
                className={`${field} mt-2`}
                maxLength={100}
                value={title}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Participants · even number
              <input
                className={`${field} mt-2`}
                type="number"
                min={4}
                max={128}
                step={2}
                value={capacity}
                disabled={busy}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Entry fee ({currency}) · 0 is free
                <input
                  className={`${field} mt-2`}
                  type="number"
                  min={0}
                  step="any"
                  value={fee}
                  disabled={busy}
                  onChange={(event) => setFee(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Host prize contribution ({currency})
                <input
                  className={`${field} mt-2`}
                  type="number"
                  min={0}
                  step="any"
                  value={pool}
                  disabled={busy}
                  onChange={(event) => setPool(event.target.value)}
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {splits.map((value, index) => (
                <label key={index} className="text-center text-sm">
                  {["1st", "2nd", "3rd"][index]} prize %
                  <input
                    className={`${field} mt-2 text-center`}
                    type="number"
                    min={1}
                    max={98}
                    step={1}
                    value={value}
                    disabled={busy}
                    onChange={(event) =>
                      setSplits((values) =>
                        values.map((old, i) => (i === index ? event.target.value : old)),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div className="space-y-1 rounded-2xl bg-white/[0.04] p-4 text-sm text-white/70">
              <p>Full registration revenue: {format(previewEntries)}</p>
              <p>
                Competition fee ({previewRate}%): {format(previewDeduction)}
              </p>
              <p>Your share of the fee: {format(previewDeduction / 2, { maximumFractionDigits: 2 })}</p>
              <p>Zero Club retains: {format(previewDeduction / 2, { maximumFractionDigits: 2 })}</p>
              <p className="font-semibold text-[#ffca75]">
                Prizes after fees: {format(previewPool)}
              </p>
              <p className="text-xs">
                Percentages must total 100%. Host contributions go fully to prizes.
              </p>
            </div>
            <button
              disabled={busy}
              onClick={create}
              className="min-h-12 w-full rounded-full bg-[#c3217e] font-bold disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create competition"}
            </button>
          </section>
        )}
        {((list.isPending && !id) || (detail.isPending && id)) && (
          <p role="status">Loading competitions…</p>
        )}
        {(id ? detail.error : list.error) && (
          <p role="alert" className="rounded-xl bg-white/5 p-4 text-sm">
            {((id ? detail.error : list.error) as Error).message}
          </p>
        )}
        {!id && (
          <div className="space-y-3">
            {list.data?.map((item) => (
              <Link
                key={item.id}
                to="/app/games/draught-competitions"
                search={{ id: item.id }}
                className="block rounded-[24px] bg-white/[0.05] p-5"
              >
                <div className="flex justify-between gap-3">
                  <h2 className="font-semibold">{item.title}</h2>
                  <Trophy className="h-5 w-5 shrink-0 text-[#ffca75]" />
                </div>
                <p className="mt-2 text-sm text-white/65">
                  {item.status} · {item.players}/{item.capacity} players ·{" "}
                  {item.entry_fee ? format(item.entry_fee) : "Free entry"}
                </p>
                <p className="mt-1 text-sm text-[#ffca75]">
                  {format(item.prize_pool)} funded before fees{item.joined ? " · Registered" : ""}
                </p>
              </Link>
            ))}
            {list.data?.length === 0 && (
              <p className="py-8 text-center text-white/60">
                No competitions yet. Host the first one.
              </p>
            )}
          </div>
        )}
        {c && data && (
          <>
            <section className="mb-6 rounded-[26px] bg-white/[0.05] p-5">
              <p className="text-2xl font-bold text-[#ffca75]">
                {format(
                  c.net_prize_pool ??
                    c.prize_pool - Math.floor(((c.prize_pool - c.host_pool) * c.fee_percent) / 100),
                )}
              </p>
              <p className="mt-1 text-sm text-white/60">
                Prizes after fees · {data.players.length}/{c.capacity} registered · {c.status}
              </p>
              <p className="mt-3 text-sm text-white/65">
                Prize split: {c.prize_splits.join("% / ")}% · Fee: {c.fee_percent}% of registration
                revenue, shared equally by the host and Zero Club.
              </p>
              {c.status === "finished" && (
                <p className="mt-2 text-sm text-white/65">
                  Host earned {format(c.host_fee_share, { maximumFractionDigits: 2 })} from the fee. Cash winnings are
                  withdrawable.
                </p>
              )}
              {c.status === "registration" && (
                <>
                  <p className="mt-3 text-sm text-white/65">
                    Starts when all places fill. Registration closes{" "}
                    {new Date(c.registration_ends_at).toLocaleString()}.
                  </p>
                  {!data.players.some((player) => player.id === data.you) &&
                    c.creator_id !== data.you && (
                      <button
                        disabled={busy}
                        onClick={join}
                        className="mt-4 min-h-12 w-full rounded-full bg-[#c3217e] font-bold disabled:opacity-40"
                      >
                        {busy
                          ? "Registering…"
                          : c.entry_fee
                            ? `Register · ${format(c.entry_fee)}`
                            : "Register free"}
                      </button>
                    )}
                  {c.creator_id === data.you && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          if (await confirmCard("Cancel this competition and refund everyone?"))
                            await action("cancel", c.id);
                        })
                      }
                      className="mt-4 rounded-full bg-white/10 px-4 py-3 text-sm"
                    >
                      Cancel & refund
                    </button>
                  )}
                </>
              )}
              {c.status === "running" && (
                <p className="mt-3 text-sm text-white/65">
                  Open your match below. Winners advance automatically.
                </p>
              )}
              <button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(window.location.href)
                    .then(() => toast.success("Competition link copied"))
                    .catch(() => toast.error("Could not copy link."));
                }}
                className="mt-3 text-sm font-semibold text-[#ff8ccc]"
              >
                Copy invite link
              </button>
            </section>
            {data.awards.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-3 text-lg font-bold">Final leaderboard</h2>
                <ol className="space-y-2">
                  {data.awards.map((award) => (
                    <li
                      key={award.place}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-4"
                    >
                      <span className="font-semibold">
                        #{award.place} · {name(award.profile_id)}
                      </span>
                      <span className="text-[#ffca75]">{format(award.amount)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {(data.awards.some((award) => award.profile_id === data.you && award.amount > 0) ||
              (c.creator_id === data.you && Number(c.host_fee_share) > 0)) && (
              <Link
                to="/app/wallet/withdraw"
                className="mb-6 inline-flex min-h-11 items-center rounded-full bg-[#c3217e] px-5 text-sm font-semibold"
              >
                Withdraw earnings
              </Link>
            )}
            <section>
              <h2 className="mb-3 text-lg font-bold">
                {data.fixtures.length ? "Bracket" : "Registered players"}
              </h2>
              <div className="space-y-3">
                {data.fixtures.map((fixture) => (
                  <div key={fixture.id} className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs font-semibold text-[#ffca75]">
                      {fixture.kind === "bronze"
                        ? "Third-place playoff"
                        : `Round ${fixture.round} · Match ${fixture.slot}`}
                      {fixture.attempt > 1 ? ` · Replay ${fixture.attempt - 1}` : ""}
                    </p>
                    <p className="mt-2 font-semibold">
                      {name(fixture.red_id)}
                      {fixture.black_id ? ` vs ${name(fixture.black_id)}` : " · First-round bye"}
                    </p>
                    {fixture.winner ? (
                      <p className="mt-1 text-sm text-white/60">Advanced: {name(fixture.winner)}</p>
                    ) : (
                      fixture.room_id && (
                        <Link
                          to="/app/games/draught"
                          search={{
                            room: fixture.room_id,
                            competition: c.id,
                            mode: undefined,
                            code: undefined,
                          }}
                          className="mt-3 inline-flex rounded-full bg-[#c3217e] px-4 py-2 text-sm font-semibold"
                        >
                          {[fixture.red_id, fixture.black_id].includes(data.you)
                            ? "Play your match"
                            : "Watch match"}
                        </Link>
                      )
                    )}
                  </div>
                ))}
                {!data.fixtures.length &&
                  data.players.map((player) => (
                    <p key={player.id} className="rounded-xl bg-white/5 p-3 text-sm">
                      {player.name}
                    </p>
                  ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
