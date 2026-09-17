import { createJev } from "./jev.ts";
const ask = createJev();
const state = {
  goal: "log in as admin", subgoal: "enter the email address",
  page: { url: "https://app.example.com/login", text: "Sign in to your account. Email. Password. Forgot password? Sign in. Create account." },
  elements: [{ e0: "textbox: Email" }, { e1: "textbox: Password" }, { e2: "button: Sign in" }, { e3: "link: Forgot password?" }, { e4: "link: Create account" }],
};
const questions = {
  done: { type: "boolean", instructions: "Has the goal already been fully achieved on this page?" },
  blocked: { type: "boolean", instructions: "Is there a captcha, access denial or error that blocks progress?" },
  irreversible: { type: "boolean", instructions: "Would the next action have an effect outside the browser that is hard to undo?" },
  target: { type: "choice", instructions: "Which element best advances the subgoal?", criteria: { e0: "textbox: Email", e1: "textbox: Password", e2: "button: Sign in", e3: "link: Forgot password?", e4: "link: Create account", none: "No suitable element." } },
  action: { type: "choice", instructions: "Which action should be taken on that element?", criteria: { click: "Click it", fill: "Type text into it", press: "Press a key", none: "No action" } },
} as const;
for (let i = 0; i < 4; i++) {
  const r = await ask(state, questions as never);
  const t = r.answers.target as { choice: string }, a = r.answers.action as { choice: string };
  console.log(`run ${i + 1}: ${Math.round(r.ms)}ms  target=${t.choice} action=${a.choice} inTok=${r.inputTokens}`);
}
