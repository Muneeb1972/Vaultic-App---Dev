import { Suspense } from "react";
import { LandingHero } from "@/components/landing/LandingHero";

export default function Home() {
  return (
    <Suspense>
      <LandingHero />
    </Suspense>
  );
}
