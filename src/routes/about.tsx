import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHero, TrustBar } from "@/components/layout/page-hero";

export const Route = createFileRoute("/about")({ component: AboutPage });

function AboutPage() {
  return (
    <main>
      <PageHero
        eyebrow="People. Print. Progress."
        title="About PrintHub"
        description="We're more than just a print shop — we're your neighbourhood partner for all things print, copy, scan and stationery. Our goal is simple: to make everyday printing easy, reliable and accessible for everyone."
        action={
          <Link to="/services" className="btn-primary">
            Our Services
            <ArrowRight className="size-4" />
          </Link>
        }
        image="/images/hero-about.jpg"
        features={[
          { icon: "users", label: "Customer First" },
          { icon: "shield", label: "Reliable Quality" },
          { icon: "leaf", label: "Sustainable Choices" },
        ]}
      />
      <div className="container-page mt-7">
        <TrustBar
          big
          items={[
            { icon: "users", title: "10K+", hint: "Happy Customers" },
            { icon: "file", title: "500K+", hint: "Prints Delivered" },
            { icon: "shield", title: "99%", hint: "Customer Satisfaction" },
            { icon: "leaf", title: "A Greener", hint: "More Sustainable Tomorrow" },
          ]}
        />
        <p className="mt-2 text-[0.7rem] text-muted-2">
          Figures shown are demo content for this shopfront, not independently verified claims.
        </p>
      </div>
      <section className="container-page grid gap-x-9 gap-y-10 py-10 lg:grid-cols-[1fr_1.05fr_1.42fr]">
        <div>
          <h2 className="text-[1.5rem] font-extrabold tracking-tight">Our Story</h2>
          <p className="mt-3 text-[0.95rem] leading-[1.7] text-muted">
            PrintHub started with a simple idea — to bring high-quality printing and stationery
            solutions closer to students, professionals and businesses. What began as a small
            neighbourhood shop has grown into a trusted name known for reliability, friendly
            service and a passion for helping ideas come to life.
          </p>
        </div>
        <div>
          <h2 className="text-[1.5rem] font-extrabold tracking-tight">Our Mission</h2>
          <p className="mt-3 text-[0.95rem] leading-[1.7] text-muted">
            To make printing, copying, scanning and stationery simple, affordable and accessible
            for everyone — empowering ideas, big and small.
          </p>
          <h2 className="mt-6 text-[1.5rem] font-extrabold tracking-tight">Our Vision</h2>
          <p className="mt-3 text-[0.95rem] leading-[1.7] text-muted">
            To be the most trusted and loved print and stationery brand, known for quality,
            innovation and a stronger, greener community.
          </p>
        </div>
        <img
          src="/images/about-story.jpg"
          alt="PrintHub shop interior"
          className="h-full min-h-[13.5rem] w-full rounded-xl object-cover"
        />
      </section>
      <div className="mt-9 pb-6">
        <TrustBar
          items={[
            { icon: "handshake", title: "Local & Trusted", hint: "Part of your community" },
            { icon: "star", title: "Quality You Can Count On", hint: "Every time, always" },
            { icon: "leaf", title: "People & Planet", hint: "Smarter, greener printing" },
            { icon: "heart", title: "Ideas for Everyone", hint: "Students, professionals & businesses" },
          ]}
        />
      </div>
    </main>
  );
}
