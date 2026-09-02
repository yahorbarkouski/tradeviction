# Scoring

Everything a player's numbers come from, with the constants. The pure formulas live in `lib/market.ts`; `lib/engine.ts` reads the database into a `World` and runs them; `lib/db/scores.ts` turns lots into a player's Alpha and Karma. Times are milliseconds since the epoch and days are UTC days.

## Who counts

Every rule below that says "holders" or "actors" means **accounted** users at that moment (`accounted()` in `lib/engine.ts`):

| Account                                                                                                                                                 | Counts toward Pulse, Depth, Hotness | Vote weight in comment ranking |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------ |
| Muted by the admin                                                                                                                                      | no                                  | 0                              |
| Trusted by the admin, or linked to a checkmarked X account                                                                                              | yes                                 | 1                              |
| Established: at least 7 days old, has touched 3 companies (a position or a comment), and a trusted or verified member has voted for one of its comments | yes                                 | 1                              |
| Everyone else (provisional)                                                                                                                             | no                                  | 0.1 (`PROVISIONAL_WEIGHT`)     |

Karma looks at the voter's standing at the moment they voted; comment ranking uses their standing now. Alpha itself is not weighted: a new account earns it in full.

## Pulse

The share of accounted holders who are long, with a prior so an empty board reads 50:

```
p = (w · p₀ + long) / (w + long + short)
```

- `long` and `short` count each user once, from their open lots (`tallyAt`).
- The even prior is `p₀ = 0.5, w = 4` (`PRIOR = 2` phantom votes a side).
- A catalog company can open at a line: `p₀ = opening / 100, w = 10` (`OPENING_WEIGHT`). The line fades as real votes arrive.
- The displayed Pulse is `round(100 · p)`. For logits, `p` is clamped to `[0.01, 0.99]`.

A position with 0 Conviction stays on the Book but has no lot, so it is off Pulse ("inactive").

**Genesis.** A market is _forming_ until `GENESIS_N = 20` accounted holders hold through a `GENESIS_WINDOW_MS = 48h` window. While forming there is no price Alpha; carry still accrues. When the window closes with 20 still in, the market is _open_ and every lot opened before that moment is priced from the Pulse at genesis, not from when it was opened.

**Freeze.** If a board thins out below `FREEZE_N = 10` holders after opening, `p_now` freezes at the last Pulse that had at least 10, so nobody can print Alpha by being the last one standing.

## Alpha

Alpha is computed per **lot**. A lot is a slice of Conviction opened at one moment with one entry price; increasing a position adds a lot, cutting it closes the newest lots first, closing or flipping closes them all. Closed lots keep their realized Alpha forever.

For a lot with Conviction `c`, side `s` (+1 long, −1 short), opened at `t₀`:

```
price     = c · s · (logit(p_now) − logit(p_entry))
discovery = DISCOVERY_LAMBDA · c · s · (2 · p* − 1) · ln(1 + min(quietDays, 365) / 7)
carry     = CARRY_RHO · c · floor(daysOpen)
alpha     = price + discovery − carry
```

- `logit(p) = ln(p / (1 − p))`. Moving Pulse from 50 to 75 is worth `ln 3 ≈ 1.1` per point of Conviction; the same move from 90 to 96 is worth about the same, so late piling on pays less than it looks.
- `p_entry` is the Pulse at `t₀` **excluding the lot's own holder**, and `p_now` likewise excludes them. You cannot move your own price.
- `DISCOVERY_LAMBDA = 1`, `CARRY_RHO = 0.002`: holding 50 Conviction costs 0.1 Alpha a day.
- `daysOpen` runs to the close, or to now for an open lot.

A player's Alpha is the sum over their open lots plus the realized Alpha of their closed ones. The leaderboard on `/top` ranks by it; a profile shows it per position ("live Alpha").

### Discovery

Discovery pays for holding through a quiet stretch that later got attention (`discover()` in `lib/market.ts`):

1. A board is **quiet** on a day when fewer than `QUIET_H = 5` accounted actors touched it in the trailing `ATTENTION_MS = 7 days`. A touch is any Book event or comment.
2. A quiet period is at least `QUIET_MIN_DAYS = 14` consecutive quiet days.
3. It ends the moment Hotness reaches `HOTNESS_BREAKOUT = 60`. That moment is the **confirmation**; `p*` is the Pulse then.
4. `quietDays` is how many days of the quiet period the lot was open for, so a lot opened a month in still earns for the month it held.

The sign `(2p* − 1)` means a long is paid only if the board confirmed bullish, a short only if bearish. A quiet board that never heats up pays nothing.

## Hotness

For a board at time `t` (`heatAt()`):

```
actors       = accounted users who touched the board in (t − 72h, t] and still hold a position or a comment there
baseline     = median of that same 72-hour count taken on each of the previous 28 days
acceleration = max(0, ln((actors + 5) / (baseline + 5)))
breadth      = ln(1 + actors / 5)
novelty      = 0.5 + 0.5 · (first-time actors / actors)
heat         = acceleration · breadth · novelty
hotness      = 100 · (1 − e^(−heat / 2.5))
```

Ten new actors on a board that usually sees none gives a hotness of about 38; forty gives about 85. A board is **hot** at 60. Someone who opened and closed, or posted and deleted, leaves no heat behind.

The **phase** shown on the feed: `hot` at 60+, else `active` once genesis passed, else `quiet` after 14 quiet days, else `forming`.

## Conviction and moves

- The Book holds `CONVICTION_CAP = 100` Conviction across all open positions.
- `MOVES_PER_DAY = 30` per UTC day. Opening, flipping, and increasing spend a move. Cutting, closing, and rewriting a take are free.
- The Book editor commits several changes as one transaction: closes and cuts land before opens and increases, so moving 60 from one company to another is one step (`lib/book.ts`).

## Karma

A vote on your comment is worth 1 Karma when (`scoreKarma()` in `lib/db/scores.ts`):

- the voter is accounted at the time of the vote,
- you did not vote for one of theirs in the previous `KARMA_PAIR_WINDOW_MS = 30 days` (no back-scratching),
- it is at most the `KARMA_PAIR_CAP = 3`rd vote from that voter in 30 days,
- and at most the `KARMA_DAY_CAP = 20`th you received that day.

Karma unlocks moderation: `FLAG_KARMA = 5` to flag a comment, `VOUCH_KARMA = 10` to vouch for a flagged one.

## Comments

- **Points** are unmuted votes. **Score** is votes weighted by the voter's standing (1 or 0.1).
- The front page ranks root takes by `score · 0.5^(age / 48h)` (`RANK_HALF_LIFE_MS`).
- A comment is **dead** when its author is muted, or when it has at least `max(FLAG_KILL = 3, ceil(score / 2))` flags and fewer vouches than flags. Dead comments stay visible to their author and to anyone with `showdead` on.
- New accounts show green for `FRESH_MS = 14 days`.

## Receipts

A profile lists closed positions whose realized Alpha is at least `RECEIPT_ALPHA = 8` either way, with the Pulse at entry and exit.

## Worked example

Alice goes long a fresh catalog company at 30 Conviction while it reads 52 with 25 holders. Her entry, leaving herself out, is `p = 0.52`. Three weeks later 60 people hold it and Pulse is 71:

```
price = 30 · (logit(0.71) − logit(0.52)) = 30 · (0.895 − 0.080) = 24.5
carry = 0.002 · 30 · 21 = 1.3
alpha ≈ 23.2
```

Had the board been quiet for the first 14 of those days before heating up at 71, she would also get `30 · (2·0.71 − 1) · ln(1 + 14/7) ≈ 13.8` of discovery.
