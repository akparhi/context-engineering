import { gateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate } from "ai";

export const JEV_MODEL = "typesafe-ai/jev";

export type BooleanAnswer = { type: "boolean"; probability: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
};

export type Question =
  | { type: "boolean"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };

export type Answers = Record<string, BooleanAnswer | ChoiceAnswer>;

export type JevResult = {
  answers: Answers;
  ms: number;
  inputTokens: number;
};

export type JevClient = (
  state: unknown,
  questions: Record<string, Question>,
) => Promise<JevResult>;

/**
 * One call answers every question in `questions`. Jev scores them in a single
 * parallel pass, so asking eight costs what asking one costs — the runner leans
 * on that and should never split a step across calls.
 */
export function createJev({
  model = JEV_MODEL,
  maxRetries = 2,
  timeoutMs = 30_000,
}: { model?: string; maxRetries?: number; timeoutMs?: number } = {}): JevClient {
  return async function ask(state, questions) {
    const started = performance.now();
    const result = await evaluate({
      model: gateway.evaluationModel(model),
      state: state as never,
      questions: questions as never,
      maxRetries,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    const answers = result.answers as Answers;
    for (const [id, question] of Object.entries(questions)) {
      const answer = answers[id];
      if (!answer) throw new Error(`Jev omitted an answer for "${id}".`);
      if (question.type === "choice") {
        const choice = (answer as ChoiceAnswer).choice;
        if (!Object.hasOwn(question.criteria, choice)) {
          throw new Error(`Jev returned an unoffered choice "${choice}" for "${id}".`);
        }
      }
    }
    return {
      answers,
      ms: performance.now() - started,
      inputTokens: result.usage?.inputTokens ?? 0,
    };
  };
}

export const p = (answer: BooleanAnswer | ChoiceAnswer | undefined): number =>
  answer && answer.type === "boolean" ? answer.probability : 0;
