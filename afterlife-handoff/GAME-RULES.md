# Game lineup and scoring defaults

These are proposed exact implementation defaults chosen to complete the handoff. Make tuning values configurable. Content focuses primarily on Día de los Muertos: celebration, remembrance, art, food, family and traditions. Glamorous artwork does not mean adult game prompts. All gameplay is suitable for mixed-age family teams. No live host judging, trivia about submitted loved ones, drinking challenges, music-recognition games, or culturally invented claims.

## Common format

- A set consists of three questions from one game family. One set is about three minutes including introduction/reveals/results, followed by two minutes of social/remembrance time.
- Each question is worth 100 points maximum. Correct objective answer = 100; incorrect or unanswered = 0. No speed bonus, deductions, streak multiplier, item purchases, power-ups or random point awards.
- Set score ranges 0–300. Results reveal only after the deadline or authorized phase transition. Families can discuss before captain locks one answer.
- Eligible teams are snapshotted at set introduction. A ranked set requires being active at that boundary and connected for the first question's instruction phase. Nonresponses after eligibility count as zero for that set; this prevents abandoning a weak set to erase it. Host-skipped or technically invalidated sets are excluded for everyone.
- Teams joining later can play the remaining questions for feedback and round celebration; that partial set does not enter their championship total. Clearly label Practice set — your ranked play starts next set. They wait only until the next question for actual participation.
- Party ranking = sum of each team's best five eligible set scores. Before five sets, show a separate provisional section with progress such as 3/5 sets; do not visually rank an incomplete sum against qualified teams. Five sets is roughly 25 minutes of availability, including breaks. Full best-five history and why a score counts are visible on the controller.
- Staying longer offers more opportunities to improve; disclose this honestly. No cash prize is involved. Treat the party ranking as friendly competition, not a claim of equal opportunity for every length of stay.
- Equal totals share rank. Set ties share the win. Do not break ties with hidden timestamps or arrival order. Rank labels use competition ranking (1, 1, 3). Persistent stable visual ordering inside ties can use alphabetical name, explicitly without declaring a winner.
- Highlight set winners, perfect sets, and biggest improvement. Keep awards friendly; no shaming lowest scores. Record milestones once rather than repeatedly spamming celebration.
- A paused team becomes ineligible for the NEXT set; pausing midway does not erase the current set. Disconnection does not create a new identity or reset score history.

## 1. Memory — La Memoria

TV shows an original themed scene or an array of illustrated objects for 10 seconds, hides it, then asks a specific multiple-choice question for 25 seconds. Reveal for 10 seconds. Use the same timing for each of three independent questions.

Phones display Look at the TV during exposure. Do not send a hidden answer or keep the original scene available on controller after hiding. Questions concern count, position, color or a clearly visible detail. Example template: Which object was beside the bread? with four illustrated choices. Do not invent a detailed image with imagegen and assume counts/positions are correct. Prefer deterministic SVG/canvas/DOM scenes with scene JSON as answer source, or manually verified authored images. Never include a real tribute photo.

Score 100 for correct. Works with one team. Kids can lead observation. Avoid color-only clues. Include mixed difficulty and accessible non-color alternatives.

## 2. True or Invented — Verdad o Invento

Show one checked factual statement; teams choose True or Invented. Up to 35 seconds to discuss, then 10-second reveal with a short English explanation. Include original wording and source metadata in content records. False statements must be clearly corrected after reveal, without mocking actual traditions.

Score 100 for correct. Works with one team. Check region-specific traditions and avoid presenting one local practice as universal. Do not assert historical facts from model memory without verification.

## 3. Hidden Detail — Flores y Sombras

Two original matched scenes appear side by side, with differences created programmatically from deterministic scene data. Each question asks which labeled region changed; use four regions A–D on TV and matching large controller buttons. One unambiguous changed region per question. Up to 35 seconds plus 10-second reveal highlighting the difference.

Score 100 for correct. Works with one team. No precision tapping on tiny TV objects. Use big enough differences to see across the room; test at normal seating distance. Difficulty should come from observation, not illegible artwork.

## 4. Guess the Reveal — ¿Qué Es?

Gradually reveal a checked themed object/image in three stages over 35 seconds. Families may lock one of four answers at any stage, but points stay 100 regardless of speed to keep the shared-device format fair. Reveal after close for 10 seconds. Examples of subject categories: foods, flowers, art objects or familiar themed fictional imagery clearly labeled as such. Each answer must match the actual art.

Works with one team. Do not reveal meaningful answer metadata through filenames, alt text, frontend payloads or URLs before submission where avoidable; provide useful non-spoiler accessibility descriptions.

## 5. Ofrenda Clues — El Altar

Use a visually clear authored ofrenda-inspired arrangement and a short clue asking which of four objects fits. Use a simple tap choice first; drag-and-drop is optional later, never necessary on a shared phone. For factual cultural questions, cite researched explanation internally and avoid implying every family must arrange an ofrenda the same way. Prefer contextual clues over a universal correct order.

35-second answer phase, 10-second explanatory reveal. Score 100 for correct. Works with one team. No automatic AI judging of free text or photos.

## 6. Read the Family — La Familia Dice

Optional social set, only with at least three eligible teams. Every question has four child-friendly themed preference options. During first 15 seconds, each captain submits the team's personal choice. These are opinions and have no right/wrong answer. Close the poll, keep results hidden, then give 20 seconds to predict the most popular response. Never let teams revise their personal choice after seeing predictions or tallies.

Use only submitted preferences from the snapshotted eligible cohort. If multiple options tie for most popular, predicting any tied option earns 100. No preference submissions at all → void question, no score. Fewer than three preference responses → show friendly unscored poll results and mark question void. No submitting a prediction without a personal preference. Missing eligible preference/prediction otherwise earns zero. One vote per family regardless of device count. Keep aggregate results hidden until prediction closes.

Normalize this set to avoid punishing technical/participation voids: eligible completed nonvoid question points / nonvoid question count × 3, rounded to nearest integer, yielding 0–300. If fewer than two nonvoid questions remain, invalidate whole set for party ranking and queue an objective set next. Explain normalized score in history. Objective sets should have all three valid questions; if any is broken, host can invalidate the entire set rather than applying ad hoc scoring.

Themes can include favorite food to bring to a family celebration, favorite flower color, or preferred celebratory character accessory. Never ask guests to rank loved ones, grief or cultural authenticity. Do not require a joining survey.

## Rotation and content volume

Objective games form the backbone. Default schedule: four objective sets followed by one social set when eligible. Do not play the same game family twice consecutively. Use a seedable shuffled content pool with exposure tracking; do not repeat exact question instances until the pool is exhausted. Memory/reveal/difference variants can be generated from verified scene templates, with stable answers and controlled difficulty. Log seeds for debugging.

Deliver at least 150 unique, validated question instances (enough for about four hours at the default pace), using deterministic visual templates for volume plus researched original trivia. Keep factual and visual questions balanced and avoid an evening of reading quizzes. If the party runs past the pool, generate fresh deterministic visual instances where supported; otherwise explicitly announce an encore rather than secretly recycling answers.

Build the five objective game families and social prediction flow completely; no decorative menu entries that lead to placeholder trivia. If a game cannot be completed, report that gap explicitly rather than labeling it delivered. Reject malformed content automatically at build/seed time: duplicate options, missing answer, unavailable artwork, ambiguity or invalid scene references.

Content record fields should include id/version, game type, English prompt/options, server-only answer, reveal explanation, difficulty, scene/media reference and seed, source URL plus verification note for factual claims, enabled status, estimated reading time and last exposure. Generated sample facts are not verified content. Source research must use authoritative cultural/institutional sources and original paraphrases.
