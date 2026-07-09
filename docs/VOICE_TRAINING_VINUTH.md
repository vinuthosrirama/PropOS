# Voice training corpus — Vinuth

**What this is:** PropOS writes every SMS and email through a "voice compiler" (`src/lib/voiceContext.ts`) that mixes a scored profile (formality, Australian-ness, length, emoji use) with 6-8 real example messages, and feeds both straight into the generation prompt as `Training examples — write to match this style exactly`. Right now there is no seed corpus for you specifically — the Master/Vinuth login falls through to Cameron Knoll's seed corpus by default, so anything generated under your login currently sounds like Cameron, not you.

**What to do:** Write a real reply under each scenario below, exactly as you'd actually send it, typos and all if that's how you type. Don't polish it for the page. 15-20 minutes total. Skip any scenario that doesn't happen to you, but the more you fill in, the stronger the voice match. Send the file back and I'll compile it into a `VINUTH_SEED` corpus, wire it into `seedCorpusIfEmpty()`, and it'll drive every VendorOS and BuyerOS message generated under your login from then on.

A few things worth deciding before you start, since they set the defaults the compiler falls back on when there's no matching example:

- **Sign-off** — "Cheers," / "Kind regards," / your name only / something else?
- **Greeting** — "Hi [name]" every time, or does it vary ("Hey", no greeting at all, straight into it)?
- **Emoji** — never, occasional, or you actually use them?
- **Formality** — same tone to an investor as to a first-home buyer, or do you shift?

---

## SMS scenarios (keep these the length you'd actually text, don't force 160 characters)

**1. Investor, CGT timing nudge.**
Their investment property (bought 2016, now ~$1.23M, ~$685K equity) crosses the 12-month CGT discount threshold soon. You want them to know without pushing.

> Your reply:

**2. Family upsizer, comparable sale just settled.**
A similar 4-bed two streets over just sold for $1.08M. This family's place is worth roughly the same and they've mentioned before they're feeling cramped.

> Your reply:

**3. Downsizer, gentle check-in, no urgency.**
An older couple you sold to years ago. Market's strong. You don't want this to feel like pressure.

> Your reply:

**4. General market update, no specific trigger.**
Just a "thinking of you, here's what's happening" text to someone who hasn't heard from you in 3+ months.

> Your reply:

**5. Buyer follow-up after an open home.**
They came through a property Saturday, asked a couple of good questions, didn't say much else. You're following up Monday.

> Your reply:

**6. Bad news, honestly delivered.**
The market's actually softened a little in their specific area since you last spoke. You still want to keep the relationship warm, not oversell.

> Your reply:

**7. They replied "not interested right now."**
How do you close the loop without being pushy, in a way that keeps the door open?

> Your reply:

**8. Referral ask, after a good result.**
You just settled someone's sale, they were happy. You're asking if they know anyone else thinking of selling.

> Your reply:

---

## Email scenarios (write it exactly as you'd type it, paragraph breaks and all)

**9. Investor, full equity + CGT breakdown.**
Same investor as scenario 1, but this is the follow-up email with real numbers laid out, plus an offer for a free appraisal.

> Subject:
> Body:

**10. Family upsizer, full equity + lifestyle email.**
Same family as scenario 2. Longer version explaining the numbers and inviting a no-pressure coffee chat.

> Subject:
> Body:

**11. Downsizer, equity release, lifestyle-first framing.**
Longer version of scenario 3 — the numbers matter less here than the "here's what this could mean for you" framing.

> Subject:
> Body:

**12. First-home buyer, answering a real question.**
They asked about stamp duty concessions and settlement flexibility at an open home. Write the follow-up email actually answering it.

> Subject:
> Body:

---

## A couple of harder ones, if you have time

**13. Vendor who's anxious about a slow campaign.**
Days on market are creeping up, they're getting nervous, maybe hinting at a price drop. How do you reassure without spin?

> Your reply:

**14. A genuinely warm, no-agenda message.**
Something you'd send someone in your database with zero commercial purpose — a "saw this and thought of you" text. This one tells me the most about your actual voice, since there's no sales pressure shaping it.

> Your reply:

---

*Once this comes back filled in, next steps: I turn each answer into a `TrainingEntry` (persona-tagged, word-counted), add a `VINUTH_SEED` array to `src/lib/voiceContext.ts` alongside the existing Cameron/Manpreet/Pas corpora, and add the branch in `seedCorpusIfEmpty()` so the Master/Vinuth login seeds from it instead of falling through to Cameron's. No other code changes needed — the compiler and both prompt templates (BuyerOS `buildOutreachPrompt`, VendorOS `vendor-generate.ts`) already read from whatever corpus is loaded.*
