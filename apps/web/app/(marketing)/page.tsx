import { Audience } from '@/components/marketing/landing/audience';
import { AuthorNote } from '@/components/marketing/landing/author-note';
import { Facts } from '@/components/marketing/landing/facts';
import { Faq } from '@/components/marketing/landing/faq';
import { Features } from '@/components/marketing/landing/features';
import { FinalCta } from '@/components/marketing/landing/final-cta';
import { Hero } from '@/components/marketing/landing/hero';
import { HowItWorks } from '@/components/marketing/landing/how-it-works';
import { Pricing } from '@/components/marketing/landing/pricing';
import { OwnWidget } from '@/components/marketing/own-widget';
import { getPublicEnv } from '@/lib/public-env';

export default function LandingPage() {
  const { appUrl, bugpingProjectKey } = getPublicEnv();
  // Copy that points at the live widget in the corner renders only when that widget does.
  const hasOwnWidget = Boolean(bugpingProjectKey);
  return (
    <>
      <Hero appUrl={appUrl} />
      <Facts />
      <Features />
      <HowItWorks appUrl={appUrl} />
      <Audience />
      <AuthorNote hasOwnWidget={hasOwnWidget} />
      <Pricing />
      <Faq hasOwnWidget={hasOwnWidget} />
      <FinalCta />
      <OwnWidget />
    </>
  );
}
