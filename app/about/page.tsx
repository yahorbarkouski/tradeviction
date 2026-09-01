import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MetricLabel, type MetricId } from "@/components/Metric";
import { stanceTone } from "@/lib/format";
import { ELIGIBLE_AGE_MS, ELIGIBLE_STARTUPS } from "@/lib/market";
import { DAY_MS } from "@/lib/time";
import { heading, page } from "@/lib/ui";

export const metadata: Metadata = {
  title: "how it works",
};

export default function AboutPage() {
  const eligibleDays = Math.round(ELIGIBLE_AGE_MS / DAY_MS);
  return (
    <article className={`${page} leading-[1.42]`}>
      <h1 className={heading}>How it works</h1>
      <div className="mt-5 space-y-5">
        <p>Every company has a conviction market.</p>
        <p>
          Earn <Term id="alpha" /> points by being early to what others get wrong: go{" "}
          <Side side="long" /> on companies people underestimate, and <Side side="short" /> on
          companies people overhype.
        </p>
        <p>
          <Term id="pulse" /> is how bullish or bearish people with open positions are right now.
          One person, one vote. <Term id="depth" /> tells you how many people placed their bets.
        </p>
        <p>
          You have <span className="">100</span> <Term id="conviction">Conviction</Term> points to distribute behind your strongest bets.
          More <Term id="conviction" /> means more <Term id="alpha" /> points at stake, so you loose or gain more points.
        </p>
        <p>
          Your positions TTL is unlimited, they stay open until you close them. If you backed a
          quiet startup months before everybody noticed it, the alpha scoring rewards it.
        </p>
        <p>
          <Term id="hotness" /> compares how many people acted in the last few days with how many
          usually do.
        </p>
        <p>
          Explain your position with arguments to earn <Term id="karma" />.
        </p>
        <p>
          Anyone can vote the moment they sign up, and the number on a comment counts every vote.
          Ranking weighs votes from established accounts in full: {eligibleDays} days old and{" "}
          {ELIGIBLE_STARTUPS} companies touched. Votes from newer accounts weigh one tenth. Newer
          takes rank above older ones with the same support.
        </p>
        <p>Bet your beliefs before they become common knowledge.</p>
      </div>
    </article>
  );
}

function Term({ id, children }: { id: MetricId; children?: ReactNode }) {
  return (
    <MetricLabel id={id} className="text-mute">
      {children}
    </MetricLabel>
  );
}

function Side({ side }: { side: "long" | "short" }) {
  return <span className={stanceTone(side)}>{side}</span>;
}
