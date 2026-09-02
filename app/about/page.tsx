import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MetricLabel, type MetricId } from "@/components/Metric";
import { stanceTone } from "@/lib/format";
import { heading, page } from "@/lib/ui";

export const metadata: Metadata = {
  title: "how it works",
};

export default function AboutPage() {
  return (
    <article className={`${page} leading-[1.42]`}>
      <h1 className={heading}>How it works</h1>
      <div className="mt-5 space-y-5">
        <p>Every company has a conviction market. Bet your beliefs before they become common knowledge.</p>
        <p>
          Earn <Term id="alpha" /> points by being early to what others get wrong: go <Side side="long" /> on companies
          people underestimate, and <Side side="short" /> on companies people overhype.
        </p>
        <p>
          <Term id="pulse" /> is how bullish or bearish people with open positions are right now. One person, one vote.{" "}
          <Term id="depth" /> tells you how many people placed their bets.
        </p>
        <p>
          You have 100 <Term id="conviction">Conviction</Term> points to distribute behind your strongest bets. More{" "}
          <Term id="conviction" /> means more <Term id="alpha" /> at stake, so you gain or lose more.
        </p>
        <p>
          Positions stay open until you close them. If you backed a quiet startup months before everybody noticed it,
          the <Term id="alpha" /> scoring rewards it.
        </p>
        <p>
          <Term id="hotness" /> compares how many people acted in the last few days with how many usually do.
        </p>
        <p>
          Explain your position with arguments to earn <Term id="karma" />.
        </p>
        <p>
          Make{" "}
          <Link href="/parties" className="text-mute">
            parties
          </Link>{" "}
          to share your vision with friends.
        </p>
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
