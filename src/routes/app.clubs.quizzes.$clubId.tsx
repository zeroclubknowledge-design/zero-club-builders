import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, BookOpenCheck, Check, ClipboardCheck, Clock, HelpCircle, Loader2, Plus, Trash2, X } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";

/**
 * Quizzes and assessments for a club.
 *
 * Admins write the paper here and members sit it here. The answer key never
 * reaches this file: the questions arrive from get_club_quiz, which leaves the
 * correct answers behind for anyone who is not an admin, and the marking is
 * done by submit_club_quiz. A score this page worked out would be a score this
 * page could be persuaded to change.
 */

export const Route = createFileRoute("/app/clubs/quizzes/$clubId")({
  component: ClubQuizzesPage,
});

type Draft = {
  title: string;
  description: string;
  pass_mark: number;
  questions: { prompt: string; options: string[]; correct_index: number }[];
};

const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  pass_mark: 50,
  questions: [{ prompt: "", options: ["", ""], correct_index: 0 }],
};

function ClubQuizzesPage() {
  const { clubId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [takingId, setTakingId] = useState<string | null>(null);

  /*
   * Who is running this club, worked out here rather than taken from the quiz
   * list.
   *
   * Tying the New button to list_club_quizzes meant that if that function was
   * missing or refused — the migration not run yet, most likely — the owner
   * was quietly treated as an ordinary member and the button never appeared.
   * The club row and the membership row answer the question on their own, and
   * they are always there.
   */
  const { data: access } = useQuery({
    queryKey: ["club-admin", clubId],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const me = session.session?.user.id;
      if (!me) return { isAdmin: false, clubName: "" };

      const [{ data: club }, { data: membership }] = await Promise.all([
        supabase.from("clubs").select("creator_id, name").eq("id", clubId).maybeSingle(),
        supabase
          .from("club_members")
          .select("role")
          .eq("club_id", clubId)
          .eq("profile_id", me)
          .maybeSingle(),
      ]);

      return {
        isAdmin: club?.creator_id === me || membership?.role === "Administrator",
        clubName: String(club?.name || ""),
      };
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["club-quizzes", clubId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_club_quizzes", { p_club_id: clubId });
      if (error) throw error;
      return data as { is_admin: boolean; quizzes: any[] };
    },
  });

  const isAdmin = Boolean(access?.isAdmin || data?.is_admin);
  const quizzes = data?.quizzes || [];

  const saveQuiz = async () => {
    const title = draft.title.trim();
    if (!title) return toast.error("Give the quiz a title");

    const questions = draft.questions
      .map((q) => ({
        prompt: q.prompt.trim(),
        options: q.options.map((o) => o.trim()).filter(Boolean),
        correct_index: q.correct_index,
      }))
      .filter((q) => q.prompt && q.options.length >= 2);

    if (questions.length === 0) {
      return toast.error("Add at least one question with two or more options");
    }
    if (questions.some((q) => q.correct_index >= q.options.length)) {
      return toast.error("Every question needs its correct answer marked");
    }

    setSaving(true);
    try {
      const { data: quiz, error } = await supabase
        .from("club_quizzes")
        .insert({
          club_id: clubId,
          title,
          description: draft.description.trim() || null,
          pass_mark: draft.pass_mark,
          created_by: (await supabase.auth.getSession()).data.session?.user.id,
          is_published: true,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: questionError } = await supabase.from("club_quiz_questions").insert(
        questions.map((q, index) => ({
          quiz_id: quiz.id,
          position: index,
          prompt: q.prompt,
          options: q.options,
          correct_index: q.correct_index,
        })),
      );
      if (questionError) throw questionError;

      toast.success("Quiz published");
      setDraft(EMPTY_DRAFT);
      setBuilderOpen(false);
      queryClient.invalidateQueries({ queryKey: ["club-quizzes", clubId] });
    } catch (error: any) {
      toast.error(error?.message || "Could not save the quiz");
    } finally {
      setSaving(false);
    }
  };

  const [filter, setFilter] = useState<"all" | "todo" | "done">("all");
  const visibleQuizzes = quizzes.filter((quiz: any) => {
    const taken = quiz.my_total > 0;
    return filter === "all" || (filter === "done" ? taken : !taken);
  });

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: "/app/clubs/chat", search: { clubId } })}
            aria-label="Back to the club"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[18px] font-semibold leading-tight">Quizzes</h1>
            {access?.clubName && <p className="truncate text-[12px] text-muted-foreground">{access.clubName}</p>}
          </div>
          {isAdmin && (
            <button
              onClick={() => { setDraft(EMPTY_DRAFT); setBuilderOpen(true); }}
              className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-foreground px-3.5 text-[14px] font-semibold text-background tap"
            >
              <Plus className="h-4 w-4" /> New quiz
            </button>
          )}
        </div>
        <div className="zc-page-width mx-auto flex w-full max-w-[680px] gap-2 px-3 pb-3">
          {([["all", "All"], ["todo", isAdmin ? "Not sat" : "To take"], ["done", "Completed"]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`h-8 rounded-full px-3.5 text-[14px] font-semibold transition ${filter === value ? "bg-foreground text-background" : "border border-foreground/30 text-muted-foreground hover:border-foreground/50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="zc-page-width mx-auto mt-2 flex w-full max-w-[680px] flex-1 flex-col bg-card md:mb-6 md:rounded-xl md:border md:border-border">
        {isLoading ? (
          <div className="grid min-h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          /* Said out loud rather than shown as an empty list. An empty list
             means "no quizzes"; this means "we could not ask". */
          <div className="px-6 py-14 text-center">
            <h2 className="text-[16px] font-semibold text-destructive">Quizzes could not load</h2>
            <p className="mx-auto mt-2 max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
              {(error as any)?.message || "Something went wrong."}
            </p>
            <p className="mx-auto mt-3 max-w-[44ch] text-[13px] leading-relaxed text-muted-foreground">
              If this mentions a missing function, the club quizzes migration has not been run on the database yet.
            </p>
          </div>
        ) : visibleQuizzes.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h2 className="mt-4 text-[16px] font-semibold">{quizzes.length === 0 ? "No quizzes yet" : "Nothing here"}</h2>
            <p className="mx-auto mt-1.5 max-w-[38ch] text-[14px] leading-relaxed text-muted-foreground">
              {quizzes.length > 0
                ? "Try another filter."
                : isAdmin
                  ? "Set an assessment and every member of this club can sit it."
                  : "When your tutor sets an assessment it will appear here."}
            </p>
          </div>
        ) : (
          visibleQuizzes.map((quiz: any) => {
            const taken = quiz.my_total > 0;
            const percent = taken ? Math.round((quiz.my_score / quiz.my_total) * 100) : 0;
            const passed = taken && percent >= quiz.pass_mark;
            return (
              <article key={quiz.id} className="border-b border-border px-4 py-3.5 last:border-b-0">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                      !taken ? "bg-[#cc208f]/10 text-[#cc208f]" : passed ? "bg-[#1a7f4b]/10 text-[#1a7f4b]" : "bg-foreground/[0.06] text-muted-foreground"
                    }`}
                  >
                    {!taken ? <HelpCircle className="h-[22px] w-[22px]" /> : passed ? <Check className="h-[22px] w-[22px]" /> : <Clock className="h-[22px] w-[22px]" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-semibold leading-snug">{quiz.title}</h3>
                    {quiz.description && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{quiz.description}</p>
                    )}
                    <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
                      {quiz.question_count} {quiz.question_count === 1 ? "question" : "questions"} · Pass mark {quiz.pass_mark}%
                      {isAdmin && <> · {quiz.attempt_count} sat</>}
                    </p>
                    {taken && (
                      <p className={`mt-1.5 text-[13px] font-semibold tabular-nums ${passed ? "text-[#1a7f4b]" : "text-[#cc208f]"}`}>
                        {passed ? `Passed · ${percent}%` : `Not passed yet · ${percent}%`}
                      </p>
                    )}
                  </div>
                  {taken && (
                    <button
                      onClick={() => setTakingId(quiz.id)}
                      className="shrink-0 pt-0.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Review
                    </button>
                  )}
                </div>
                {!taken && (
                  <button
                    onClick={() => setTakingId(quiz.id)}
                    className="mt-3 h-10 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition active:scale-[0.99]"
                  >
                    {isAdmin ? "Preview" : "Start quiz"}
                  </button>
                )}
              </article>
            );
          })
        )}
      </main>

      {takingId && (
        <QuizRunner
          quizId={takingId}
          onClose={() => setTakingId(null)}
          onSubmitted={() => queryClient.invalidateQueries({ queryKey: ["club-quizzes", clubId] })}
        />
      )}

      {/* ── Builder ─────────────────────────────────────────────── */}
      <Drawer open={builderOpen} onOpenChange={setBuilderOpen}>
        <DrawerContent className="mx-auto flex max-h-[92dvh] max-w-lg flex-col px-4 pb-4 pt-1 sm:p-6">
          <div className="shrink-0 pb-3">
            <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">New quiz</DrawerTitle>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              Members see the questions, never the answers.
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto no-scrollbar pb-1">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Title</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Quiz title"
                className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40 font-semibold"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Description</label>
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What it covers (optional)"
                className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
              />
            </div>

            <label className="flex items-center justify-between gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3">
              <span>
                <span className="block text-[15px] font-semibold">Pass mark</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">Score needed to pass</span>
              </span>
              <span className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={draft.pass_mark}
                  onChange={(e) => setDraft({ ...draft, pass_mark: Math.min(100, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)) })}
                  className="h-10 w-16 rounded-[10px] border border-foreground/15 bg-card px-2 text-right text-[15px] font-semibold tabular-nums outline-none focus:border-foreground/40"
                />
                <span className="text-[15px] text-muted-foreground">%</span>
              </span>
            </label>

            {draft.questions.map((question, qi) => (
              <div key={qi} className="rounded-2xl border border-foreground/10 bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-muted-foreground">
                    Question {qi + 1}
                  </span>
                  {draft.questions.length > 1 && (
                    <button
                      onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, i) => i !== qi) })}
                      aria-label={`Remove question ${qi + 1}`}
                      className="-mr-1.5 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[#e0245e]/10 hover:text-[#e0245e]"
                    >
                      <Trash2 className="h-[18px] w-[18px]" />
                    </button>
                  )}
                </div>

                <input
                  value={question.prompt}
                  onChange={(e) => {
                    const questions = [...draft.questions];
                    questions[qi] = { ...question, prompt: e.target.value };
                    setDraft({ ...draft, questions });
                  }}
                  placeholder="Ask something"
                  className="mt-2 h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                />

                <p className="mt-4 text-[13px] font-semibold text-muted-foreground">Options · tap the circle to mark the answer</p>
                <div className="mt-2 space-y-2">
                  {question.options.map((option, oi) => (
                    <div key={oi} className="flex items-center gap-2.5">
                      {/* Tapping the circle is how the answer is marked —
                          there is no separate "correct answer" field to forget
                          to fill in. */}
                      <button
                        onClick={() => {
                          const questions = [...draft.questions];
                          questions[qi] = { ...question, correct_index: oi };
                          setDraft({ ...draft, questions });
                        }}
                        aria-label={`Mark option ${oi + 1} correct`}
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${question.correct_index === oi ? "bg-[#1a7f4b] text-white" : "border-[1.5px] border-foreground/25"}`}
                      >
                        {question.correct_index === oi && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <input
                        value={option}
                        onChange={(e) => {
                          const questions = [...draft.questions];
                          const options = [...question.options];
                          options[oi] = e.target.value;
                          questions[qi] = { ...question, options };
                          setDraft({ ...draft, questions });
                        }}
                        placeholder={`Option ${oi + 1}`}
                        className="h-11 min-w-0 flex-1 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                      />
                      {question.options.length > 2 && (
                        <button
                          onClick={() => {
                            const questions = [...draft.questions];
                            const options = question.options.filter((_, i) => i !== oi);
                            questions[qi] = {
                              ...question,
                              options,
                              correct_index: Math.min(question.correct_index, options.length - 1),
                            };
                            setDraft({ ...draft, questions });
                          }}
                          aria-label={`Remove option ${oi + 1}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[#e0245e]/10 hover:text-[#e0245e]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    const questions = [...draft.questions];
                    questions[qi] = { ...question, options: [...question.options, ""] };
                    setDraft({ ...draft, questions });
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#a3186f]"
                >
                  <Plus className="h-4 w-4" /> Add option
                </button>
              </div>
            ))}

            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  questions: [...draft.questions, { prompt: "", options: ["", ""], correct_index: 0 }],
                })
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-foreground/25 text-[15px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.04]"
            >
              <Plus className="h-5 w-5" /> Add question
            </button>
          </div>

          <button
            onClick={saveQuiz}
            disabled={saving}
            className="mt-4 flex h-12 w-full shrink-0 items-center justify-center rounded-full bg-[#cc208f] text-[16px] font-semibold text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Publish quiz"}
          </button>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** Sitting the paper, or reading back what you scored. */
function QuizRunner({
  quizId,
  onClose,
  onSubmitted,
}: {
  quizId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["club-quiz", quizId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_club_quiz", { p_quiz_id: quizId });
      if (error) throw error;
      return data as any;
    },
  });

  const quiz = data?.quiz;
  const questions: any[] = data?.questions || [];
  const attempt = data?.attempt;
  const isAdmin = Boolean(data?.is_admin);
  const readOnly = Boolean(attempt) || isAdmin;

  const submit = async () => {
    if (Object.keys(answers).length < questions.length) {
      return toast.error("Answer every question first");
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_club_quiz", {
        p_quiz_id: quizId,
        p_answers: answers,
      });
      if (error) throw error;
      setResult(data);
      onSubmitted();
    } catch (error: any) {
      toast.error(error?.message || "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto flex max-h-[92dvh] max-w-lg flex-col px-4 pb-4 pt-1 sm:p-6">
        {isLoading || !quiz ? (
          <div className="grid min-h-40 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : result ? (
          <div className="py-6 text-center">
            <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${result.passed ? "bg-[#1a7f4b]/10 text-[#1a7f4b]" : "bg-foreground/[0.06] text-muted-foreground"}`}>
              <BookOpenCheck className="h-6 w-6" />
            </span>
            <DrawerTitle className="mt-4 font-display text-[40px] font-semibold leading-none tabular-nums">
              {result.percent}%
            </DrawerTitle>
            <p className="mt-2 text-[14px] text-muted-foreground tabular-nums">
              {result.score} of {result.total} ·{" "}
              <span className={result.passed ? "font-semibold text-[#1a7f4b]" : ""}>
                {result.passed ? "Passed" : `Pass mark is ${quiz.pass_mark}%`}
              </span>
            </p>
            <button
              onClick={onClose}
              className="mt-7 h-12 w-full rounded-full bg-foreground text-[16px] font-semibold text-background"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="shrink-0 pb-3">
              <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">{quiz.title}</DrawerTitle>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground tabular-nums">
                {attempt
                  ? `You scored ${attempt.score} of ${attempt.total}`
                  : isAdmin
                    ? "Preview — the correct answer is marked"
                    : `${questions.length} questions · pass mark ${quiz.pass_mark}%`}
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto no-scrollbar pb-1">
              {questions.map((question, index) => (
                <section key={question.id}>
                  <p className="text-[13px] font-semibold text-muted-foreground">Question {index + 1}</p>
                  <p className="mt-1 text-[15px] font-semibold leading-snug">
                    {question.prompt}
                  </p>
                  <div className="mt-3 space-y-2">
                    {(question.options as string[]).map((option, oi) => {
                      const chosen = readOnly
                        ? attempt?.answers?.[question.id] === oi
                        : answers[question.id] === oi;
                      const correct = question.correct_index === oi;
                      const showCorrect = correct && readOnly;
                      return (
                        <button
                          key={oi}
                          disabled={readOnly}
                          onClick={() => setAnswers({ ...answers, [question.id]: oi })}
                          className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left text-[15px] transition-colors ${
                            showCorrect
                              ? "border-[#1a7f4b] bg-[#1a7f4b]/[0.06] text-foreground"
                              : chosen
                                ? "border-[#cc208f] bg-[#cc208f]/[0.06] text-foreground"
                                : "border-foreground/12 text-foreground"
                          } ${readOnly ? "" : "hover:bg-foreground/[0.03]"}`}
                        >
                          <span className="min-w-0 flex-1">{option}</span>
                          {showCorrect && (
                            <span className="shrink-0 rounded-full bg-[#1a7f4b]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#1a7f4b]">
                              Correct
                            </span>
                          )}
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${chosen ? "bg-[#cc208f] text-white" : "border-[1.5px] border-foreground/25"}`}>
                            {chosen && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {!readOnly && (
              <button
                onClick={submit}
                disabled={submitting}
                className="mt-4 flex h-12 w-full shrink-0 items-center justify-center rounded-full bg-foreground text-[16px] font-semibold text-background disabled:opacity-40"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit answers"}
              </button>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
