<!-- Adapted from Jakub Krehel skills (MIT). See NOTICE.md -->
Interface writing rules covering voice, tone, labels, errors, empty states, and localization.

## Recon the existing voice

Read 20–30 labels and messages in the product before writing a single word.
Note the capitalization style, whether it uses contractions, and how it handles errors.
A local edit does not get to invent a new voice.

## One voice, flexible tone

Keep terms consistent: if it's "Archive" in the menu, it isn't "Move to storage" in the toast.
Tone flexes with the stakes:

| Context | Tone |
| --- | --- |
| Success, onboarding, empty states | Warm, can be light |
| Routine actions, settings | Neutral, minimal |
| Errors, destructive confirmations | Calm, plain, zero playfulness |
| Data loss, security | Serious, explicit |

## Address the reader directly

Use "you" and "your". "Your files" is warmer and faster to read than "the files" or "user files".
Avoid passive voice: "Delete this project?" not "This project will be deleted."

## Plain words over clever ones

Choose words a tired reader gets on the first pass, and delete every word that does no work.
No idioms, no colloquialisms, no humor that won't translate.
Skip unnecessary gender: "Subscribers can post recipes", not "each subscriber can post his or her recipes".
Match the input device: "tap" on touch, "click" with a pointer, "select" when both are possible.
Never assemble a sentence from fragments around a variable (`"You have " + n + " new messages"`); use a full templated string with proper pluralization.

## Verb-first buttons

Button labels start with a verb that names what happens: "Save changes", "Delete account", "Send invite".
Never use "OK", "Yes", or "Submit" on a button that has a specific outcome.
Pair destructive buttons with the object: "Delete project", not "Delete".

## Consistent flow vocabulary

Pick one word per concept and use it everywhere.
If the flow says "workspace", never say "project" or "team" to mean the same thing.

## Links describe their destination

Link text must make sense out of context — screen-reader users navigate by a list of the page's links.
"Read the billing docs" works. "Click here" fails this and the device-verb rule at once.
A bare "Learn more" breaks down as soon as two appear on one page; suffix each one: "Learn more about exports".

## One capitalization policy

Pick sentence case or title case for each element type and apply it everywhere.
Sentence case for body copy, labels, and tooltips is the safer default.
Never mix styles in the same component.

## Settings describe the ON state

A toggle label names what happens when the setting is on, not the feature itself.
"Send weekly digest" is correct; "Weekly digest" is ambiguous.

## Errors say how to fix, next to where it broke

An error is an instruction, and it belongs beside the field that failed.

| Bad | Good |
| --- | --- |
| That password is too short | Choose a password with at least 8 characters |
| Invalid name | Use only letters for your name |
| Oops! Something went wrong. | Unable to save. Check your connection and try again. |

No blame, no "oops", no exclamation marks.
Phrase hints positively ("Use only letters", not "Don't use numbers or symbols") and show them before the mistake, not after.
When the same error keeps firing, redesign the interaction instead of rewording it.

## Empty states point forward

An empty state says what this place is, how to fill it, and offers one clear next action.

```html
<!-- Bad: a shrug -->
<p>No results.</p>

<!-- Good: orientation plus a next step -->
<p class="font-medium">No projects yet</p>
<p class="text-sm text-muted-foreground">Projects keep your tasks and files together.</p>
<button class="mt-4">Create a project</button>
```

A search or filter empty state names the query and offers an exit: "No results for 'quarterly'. Clear filters".
Never park persistent information in an empty state — it disappears the moment content exists.

## Placeholders are examples, not labels

A placeholder disappears when the user starts typing; it cannot serve as a field label.
Use it for an input example ("e.g. hello@company.com") only, and always provide a visible label above the field.
