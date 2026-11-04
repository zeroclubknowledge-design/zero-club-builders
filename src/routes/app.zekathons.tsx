import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/useUser";
import { navigationAudience } from "@/lib/accountNavigation";
import { supabase } from "@/lib/supabase";

const uuid = (value: unknown) => typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value) ? value : undefined;
export const Route = createFileRoute("/app/zekathons")({
  validateSearch: (search: Record<string, unknown>) => ({ event: uuid(search.event), product: uuid(search.product) }),
  component: Zekathons,
});

type Event = { id: string; title: string; description: string; deadline: string };
type Product = { id: string; owner_id: string; event_id: string; title: string; description: string };
type Release = { id: string; version: string; notes: string; demo_url: string; created_at: string };
type Member = { profile_id: string; role: string; accepted: boolean; profiles: { username: string } | null };
type Feedback = { profile_id: string; release_id: string; worked: string; friction: string };
type Submission = { release_id: string; score: number | null; review: string | null };

function useAction() {
  const query = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, data }: { action: string; data: Record<string, string> }) => {
      const { data: id, error } = await supabase.rpc("zekathon_action", { p_action: action, p_data: data });
      if (error) throw error;
      return id as string;
    },
    onSuccess: () => { void query.invalidateQueries({ queryKey: ["zekathons"] }); },
    onError: error => toast.error(error.message || "Couldn't save. Try again."),
  });
}

function ActionForm({ label, busy, onSave, children }: { label: string; busy: boolean; onSave: (fields: Record<string, string>) => void; children: ReactNode }) {
  return <form className="space-y-3" onSubmit={(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)])));
  }}>
    {children}<Button type="submit" disabled={busy}>{busy ? "Saving…" : label}</Button>
  </form>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function Zekathons() {
  const { event, product } = Route.useSearch();
  const { data: profile } = useUser();
  const navigate = useNavigate();
  const action = useAction();
  const events = useQuery({ queryKey: ["zekathons", "events"], queryFn: async () => {
    const { data, error } = await supabase.from("zekathons").select("*").order("deadline", { ascending: false });
    if (error) throw error;
    return data as Event[];
  }});
  const entries = useQuery({ queryKey: ["zekathons", "entries", event], enabled: Boolean(event && !product), queryFn: async () => {
    const { data, error } = await supabase.from("zekathon_products").select("*, zekathon_releases(id,version,created_at), zekathon_submissions(score)").eq("event_id", event!).order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as (Product & { zekathon_releases: Release[]; zekathon_submissions: { score: number | null } | null })[];
  }});
  const invites = useQuery({ queryKey: ["zekathons", "invites", profile?.id], enabled: Boolean(profile?.id && !product), queryFn: async () => {
    const { data, error } = await supabase.from("zekathon_members").select("product_id,zekathon_products(title)").eq("profile_id", profile!.id).eq("accepted", false);
    if (error) throw error;
    return data as unknown as { product_id: string; zekathon_products: { title: string } }[];
  }});
  const selected = events.data?.find(item => item.id === event);

  return <main className="zc-page-width mx-auto w-full max-w-[680px] space-y-4 px-4 py-5 pb-28">
    <header className="space-y-1">
      {(event || product) && <Link to="/app/zekathons" search={{ event: product ? event : undefined, product: undefined }} className="text-sm text-muted-foreground">← {product && event ? "Event" : "All Zekathons"}</Link>}
      <h1 className="font-display text-2xl font-semibold">Zekathons</h1>
      {!product && <p className="text-sm text-muted-foreground">Build a product, ship releases, and keep improving it after demo day.</p>}
    </header>
    {product ? <ProductPage key={product} id={product} profile={profile} /> : <>
      {invites.data?.map(invite => <Card key={invite.product_id}><CardContent className="flex items-center justify-between gap-3 pt-6">
        <p>Team invitation · {invite.zekathon_products.title}</p>
        <Button disabled={action.isPending} onClick={() => action.mutate({ action: "accept", data: { product_id: invite.product_id } }, { onSuccess: id => void navigate({ to: "/app/zekathons", search: { event: undefined, product: id } }) })}>Accept</Button>
      </CardContent></Card>)}
      {events.isError || entries.isError ? <p role="alert">Couldn't load Zekathons. <button className="underline" onClick={() => { void events.refetch(); if (event) void entries.refetch(); }}>Try again</button></p> : events.isPending ? <p>Loading events…</p> : selected ? <>
        <Card><CardHeader><CardTitle>{selected.title}</CardTitle></CardHeader><CardContent className="space-y-3">
          <p className="whitespace-pre-wrap text-sm">{selected.description}</p>
          <p className="text-sm text-muted-foreground">Submission deadline · {new Date(selected.deadline).toLocaleString()}</p>
          {profile && Date.parse(selected.deadline) > Date.now() && <details className="space-y-3"><summary className="cursor-pointer font-medium">Enter a product</summary>
            <ActionForm label="Create product" busy={action.isPending} onSave={data => action.mutate({ action: "product", data: { ...data, event_id: selected.id } }, { onSuccess: id => void navigate({ to: "/app/zekathons", search: { event: selected.id, product: id } }) })}>
              <Field label="Product name"><Input name="title" required maxLength={120} /></Field>
              <Field label="What problem are you solving, and for whom?"><Textarea name="description" required maxLength={4000} /></Field>
            </ActionForm>
          </details>}
        </CardContent></Card>
        <h2 className="font-display text-lg font-semibold">Products</h2>
        {entries.isPending ? <p>Loading products…</p> : entries.data?.length ? entries.data.map(entry => {
          const latest = [...entry.zekathon_releases].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          return <Link key={entry.id} to="/app/zekathons" search={{ event: selected.id, product: entry.id }} className="block"><Card><CardContent className="space-y-1 pt-6">
            <p className="font-semibold">{entry.title}</p>
            <p className="text-sm text-muted-foreground">{latest ? `Latest release · ${latest.version}` : "Build in progress"}{entry.zekathon_submissions?.score != null ? ` · Judge score ${entry.zekathon_submissions.score}/100` : ""}</p>
          </CardContent></Card></Link>;
        }) : <p className="text-sm text-muted-foreground">No products entered yet.</p>}
        <h2 className="font-display text-lg font-semibold">Build feed</h2>
        {(entries.data ?? []).flatMap(entry => entry.zekathon_releases.map(release => ({ entry, release }))).sort((a, b) => b.release.created_at.localeCompare(a.release.created_at)).slice(0, 20).map(({ entry, release }) => (
          <Link key={release.id} to="/app/zekathons" search={{ event: selected.id, product: entry.id }} className="block text-sm underline underline-offset-4">{entry.title} shipped {release.version} · {new Date(release.created_at).toLocaleDateString()}</Link>
        ))}
      </> : <>
        {event && <p role="status">This event is unavailable.</p>}
        {!events.data?.length && <p className="text-sm text-muted-foreground">No Zekathons have been announced yet.</p>}
        {events.data?.map(item => <Link key={item.id} to="/app/zekathons" search={{ event: item.id, product: undefined }} className="block"><Card><CardHeader><CardTitle>{item.title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{Date.parse(item.deadline) > Date.now() ? `Entries close ${new Date(item.deadline).toLocaleDateString()}` : "Submissions closed"}</CardContent></Card></Link>)}
        {(["administrator", "tutor"] as const).some(audience => audience === navigationAudience(profile)) && <Card><CardHeader><CardTitle>Create a Zekathon</CardTitle></CardHeader><CardContent>
          <ActionForm label="Publish event" busy={action.isPending} onSave={data => action.mutate({ action: "event", data: { ...data, deadline: new Date(data.deadline).toISOString() } }, { onSuccess: id => void navigate({ to: "/app/zekathons", search: { event: id, product: undefined } }) })}>
            <Field label="Event name"><Input name="title" required maxLength={120} /></Field>
            <Field label="Theme and brief"><Textarea name="description" required maxLength={4000} /></Field>
            <Field label="Submission deadline"><Input name="deadline" required type="datetime-local" /></Field>
          </ActionForm>
        </CardContent></Card>}
      </>}
    </>}
  </main>;
}

function ProductPage({ id, profile }: { id: string; profile?: { id: string; is_admin?: boolean } | null }) {
  const action = useAction();
  const [feedbackFor, setFeedbackFor] = useState<string>();
  const [releaseFormKey, setReleaseFormKey] = useState(0);
  const query = useQuery({ queryKey: ["zekathons", "product", id, profile?.id], queryFn: async () => {
    const results = await Promise.all([
      supabase.from("zekathon_products").select("*,zekathons(id,title,deadline)").eq("id", id).single(),
      supabase.from("zekathon_members").select("profile_id,role,accepted,profiles(username)").eq("product_id", id),
      supabase.from("zekathon_releases").select("*").eq("product_id", id).order("created_at", { ascending: false }),
      supabase.from("zekathon_submissions").select("release_id,score,review").eq("product_id", id).maybeSingle(),
    ]);
    for (const result of results) if (result.error) throw result.error;
    const [product, members, releases, submission] = results;
    const releaseRows = releases.data as Release[];
    const feedback = releaseRows.length ? await supabase.from("zekathon_feedback").select("release_id,profile_id,worked,friction").in("release_id", releaseRows.map(release => release.id)) : { data: [], error: null };
    if (feedback.error) throw feedback.error;
    return { product: product.data as unknown as Product & { zekathons: Event }, members: members.data as unknown as Member[], releases: releaseRows, submission: submission.data as Submission | null, feedback: feedback.data as Feedback[] };
  }});
  if (query.isError) return <p role="alert">Couldn't open this product. <button className="underline" onClick={() => void query.refetch()}>Try again</button></p>;
  if (!query.data) return <p>Loading product…</p>;
  const { product, members, releases, submission, feedback } = query.data;
  const owner = profile?.id === product.owner_id;
  const member = members.find(person => person.profile_id === profile?.id);
  const open = Date.parse(product.zekathons.deadline) > Date.now();
  const save = (kind: string, data: Record<string, string>, after?: () => void) => action.mutate({ action: kind, data: { ...data, product_id: id } }, { onSuccess: () => { toast.success("Saved"); after?.(); } });

  return <>
    <Card><CardHeader><CardTitle>{product.title}</CardTitle></CardHeader><CardContent className="space-y-3">
      <Link to="/app/zekathons" search={{ event: product.event_id, product: undefined }} className="text-sm underline">{product.zekathons.title}</Link>
      <p className="whitespace-pre-wrap text-sm">{product.description}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">{members.filter(person => person.accepted).map(person => <li key={person.profile_id}>{person.profiles?.username ? `@${person.profiles.username}` : "Builder"} · {person.role}</li>)}</ul>
      {member && !member.accepted && <Button disabled={action.isPending} onClick={() => save("accept", {})}>Accept team invitation</Button>}
      {owner && <details className="space-y-3"><summary className="cursor-pointer font-medium">Invite a teammate</summary><ActionForm label="Send invitation" busy={action.isPending} onSave={fields => save("invite", fields)}>
        <Field label="Zero Club username"><Input name="username" required /></Field>
        <Field label="Contribution or role"><Input name="role" placeholder="Builder" maxLength={80} /></Field>
      </ActionForm></details>}
    </CardContent></Card>
    {member?.accepted && <Card><CardHeader><CardTitle>Publish a release</CardTitle></CardHeader><CardContent>
      <ActionForm key={releaseFormKey} label="Publish release" busy={action.isPending} onSave={fields => save("release", fields, () => setReleaseFormKey(key => key + 1))}>
        <Field label="Version"><Input name="version" placeholder="v0.2 Beta" required maxLength={48} /></Field>
        <Field label="What changed and what can people try?"><Textarea name="notes" required maxLength={6000} /></Field>
        <Field label="Demo, video or repository link"><Input name="demo_url" type="url" placeholder="https://" required maxLength={2048} /></Field>
      </ActionForm>
    </CardContent></Card>}
    <h2 className="font-display text-lg font-semibold">Release history</h2>
    {!releases.length && <p className="text-sm text-muted-foreground">The team hasn’t shipped a release yet.</p>}
    {releases.map((release, index) => <Card key={release.id}><CardHeader><CardTitle>{release.version}{index === 0 ? " · Latest" : ""}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">{new Date(release.created_at).toLocaleDateString()}{submission?.release_id === release.id ? " · Shipped at Zekathon" : ""}</p>
      <p className="whitespace-pre-wrap text-sm">{release.notes}</p>
      {/^https:\/\//i.test(release.demo_url) && <a href={release.demo_url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold underline">Open release</a>}
      {owner && open && submission?.release_id !== release.id && <div><Button variant="outline" disabled={action.isPending} onClick={() => save("submit", { release_id: release.id })}>Submit for judging</Button></div>}
      {submission?.release_id === release.id && submission.score != null && <p className="whitespace-pre-wrap text-sm">Judge score · {submission.score}/100<br />{submission.review}</p>}
      {submission?.release_id === release.id && !open && profile?.is_admin && <ActionForm label="Save judging result" busy={action.isPending} onSave={fields => save("judge", fields)}>
        <Field label="Score out of 100"><Input name="score" type="number" min={0} max={100} required defaultValue={submission.score ?? undefined} /></Field>
        <Field label="Judging notes"><Textarea name="review" required maxLength={4000} defaultValue={submission.review ?? undefined} /></Field>
      </ActionForm>}
      {feedback.filter(item => item.release_id === release.id).map(item => <div key={item.profile_id} className="space-y-1 rounded-lg bg-muted p-3 text-sm">
        <p className="whitespace-pre-wrap"><strong>Worked</strong> · {item.worked}</p><p className="whitespace-pre-wrap"><strong>Got stuck</strong> · {item.friction}</p>
      </div>)}
      {profile && !member?.accepted && (feedbackFor === release.id ? <ActionForm label="Save feedback" busy={action.isPending} onSave={fields => save("feedback", { ...fields, release_id: release.id }, () => setFeedbackFor(undefined))}>
        <Field label="What worked?"><Textarea name="worked" required maxLength={2000} /></Field>
        <Field label="Where did you get stuck?"><Textarea name="friction" required maxLength={2000} /></Field>
      </ActionForm> : <div><Button variant="outline" onClick={() => setFeedbackFor(release.id)}>Leave playtest feedback</Button></div>)}
    </CardContent></Card>)}
  </>;
}
