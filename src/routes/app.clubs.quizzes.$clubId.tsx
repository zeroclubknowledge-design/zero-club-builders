import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ClipboardCheck,
  Loader2,
  Plus,
  Trash2,
  X,
} from "@/components/icons/solar";
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

  const { data, isLoading } = useQuery({
    queryKey: ["club-quizzes", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_club_quizzes", { p_club_id: clubId });
      if (error) throw error;
      return data as { is_admin: boolean; quizzes: any[] };
    },
  });

  const isAdmin = Boolean(data?.is_admin);
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[760px] items-center gap-3">
          <button
            onClick={() => navigate({ to: "/app/clubs/chat", search: { clubId } })}
            aria-label="Back to the club"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Club</p>
            <h1 className="truncate text-[18px] font-semibold tracking-tight">Quizzes</h1>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setDraft(EMPTY_DRAFT); setBuilderOpen(true); }}
              className="ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[12.5px] font-semibold text-background"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-4 py-5 md:px-7">
        {isLoading ? (
          <div className="grid min-h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : quizzes.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center">
            <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <h2 className="mt-4 text-[15px] font-semibold tracking-tight">No quizzes yet</h2>
            <p className="mx-auto mt-1.5 max-w-[38ch] text-[12.5px] leading-relaxed text-muted-foreground">
              {isAdmin
                ? "Set an assessment and every member of this club can sit it."
                : "When your tutor sets an assessment it will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {quizzes.map((quiz: any) => {
              const taken = quiz.my_total > 0;
              const percent = taken ? Math.round((quiz.my_score / quiz.my_total) * 100) : 0;
              const passed = taken && percent >= quiz.pass_mark;
              return (
                <article key={quiz.id} className="rounded-2xl bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[15.5px] font-semibold tracking-tight">{quiz.title}</h3>
                      {quiz.description && (
                        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{quiz.description}</p>
                      )}
                      <p className="mt-2 text-[11.5px] text-muted-foreground tabular-nums">
                        {quiz.question_count} {quiz.question_count === 1 ? "question" : "questions"} · pass mark {quiz.pass_mark}%
                        {isAdmin && <> · {quiz.attempt_count} sat</>}
                      </p>
                    </div>

                    {taken && (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${passed ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-foreground/[0.06] text-muted-foreground"}`}>
                        {percent}%
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setTakingId(quiz.id)}
                    className="mt-4 h-10 w-full rounded-lg bg-foreground text-[13px] font-semibold text-background transition active:scale-[0.99]"
                  >
                    {taken ? "Review your answers" : isAdmin ? "Preview" : "Take the quiz"}
                  </button>
                </article>
              );
            })}
          </div>
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
          <DrawerTitle className="text-[17px] font-semibold tracking-tight">New quiz</DrawerTitle>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Members see the questions, never the answers.
          </p>

          <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto no-scrollbar">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Quiz title"
              className="w-full rounded-lg bg-card px-4 py-3 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What it covers (optional)"
              className="w-full rounded-lg bg-card px-4 py-3 text-[13.5px] outline-none focus:ring-2 focus:ring-primary/30"
            />

            <label className="flex items-center justify-between gap-3 rounded-lg bg-card px-4 py-3">
              <span className="text-[13px] font-medium">Pass mark</span>
              <span className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={draft.pass_mark}
                  onChange={(e) => setDraft({ ...draft, pass_mark: Math.min(100, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)) })}
                  className="w-16 rounded-md bg-background px-2 py-1.5 text-right text-[13px] font-semibold tabular-nums outline-none"
                />
                <span className="text-[13px] text-muted-foreground">%</span>
              </span>
            </label>

            {draft.questions.map((question, qi) => (
              <div key={qi} className="rounded-xl bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Question {qi + 1}
                  </span>
                  {draft.questions.length > 1 && (
                    <button
                      onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, i) => i !== qi) })}
                      aria-label={`Remove question ${qi + 1}`}
                      className="text-muted-foreground transition hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
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
                  className="mt-2 w-full rounded-lg bg-background px-3.5 py-2.5 text-[13.5px] outline-none focus:ring-2 focus:ring-primary/30"
                />

                <div className="mt-3 space-y-2">
                  {question.options.map((option, oi) => (
                    <div key={oi} className="flex items-center gap-2">
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
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition ${question.correct_index === oi ? "bg-emerald-500 text-white" : "border border-border"}`}
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
                        className="min-w-0 flex-1 rounded-lg bg-background px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/30"
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
                          className="shrink-0 text-muted-foreground transition hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
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
                  className="mt-2.5 text-[12px] font-semibold text-primary"
                >
                  + Add option
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
              className="h-11 w-full rounded-lg border border-dashed border-border text-[13px] font-semibold text-muted-foreground transition hover:text-foreground"
            >
              + Add question
            </button>
          </div>

          <button
            onClick={saveQuiz}
            disabled={saving}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[14px] font-semibold text-background disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish quiz"}
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
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : result ? (
          <div className="py-8 text-center">
            <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${result.passed ? "bg-emerald-500/12 text-emerald-600" : "bg-foreground/[0.06] text-muted-foreground"}`}>
              <BookOpenCheck className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-[20px] font-semibold tracking-tight">
              {result.percent}%
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {result.score} of {result.total} · {result.passed ? "Passed" : `Pass mark is ${quiz.pass_mark}%`}
            </p>
            <button
              onClick={onClose}
              className="mt-6 h-11 w-full rounded-full bg-foreground text-[14px] font-semibold text-background"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <DrawerTitle className="text-[17px] font-semibold tracking-tight">{quiz.title}</DrawerTitle>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {attempt
                ? `You scored ${attempt.score} of ${attempt.total}`
                : isAdmin
                  ? "Preview — the correct answer is marked"
                  : `${questions.length} questions · pass mark ${quiz.pass_mark}%`}
            </p>

            <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto no-scrollbar">
              {questions.map((question, index) => (
                <div key={question.id} className="rounded-xl bg-card p-4">
                  <p className="text-[14px] font-semibold leading-snug">
                    {index + 1}. {question.prompt}
                  </p>
                  <div className="mt-3 space-y-2">
                    {(question.options as string[]).map((option, oi) => {
                      const chosen = readOnly
                        ? attempt?.answers?.[question.id] === oi
                        : answers[question.id] === oi;
                      const correct = question.correct_index === oi;
                      return (
                        <button
                          key={oi}
                          disabled={readOnly}
                          onClick={() => setAnswers({ ...answers, [question.id]: oi })}
                          className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-[13.5px] transition ${
                            correct && readOnly
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : chosen
                                ? "bg-primary/10 text-foreground"
                                : "bg-background"
                          }`}
                        >
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${chosen ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                            {chosen && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">{option}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {!readOnly && (
              <button
                onClick={submit}
                disabled={submitting}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[14px] font-semibold text-background disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit answers"}
              </button>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
