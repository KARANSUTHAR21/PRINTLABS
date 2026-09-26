import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight } from "lucide-react";
import { fetchServices } from "@/lib/api/public";
import { PageHero } from "@/components/layout/page-hero";
import { ServiceShortcut } from "@/components/product/service-card";
import type { ServiceRow } from "@/lib/server/catalog";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  useEffect(() => {
    void fetchServices().then((res) => {
      if (res.success) setServices(res.services);
    });
  }, []);
  const shortcuts = services.slice(0, 4);

  return (
    <main>
      <PageHero
        variant="home"
        eyebrow="Your neighbourhood xerox shop"
        title={
          <>
            More than just
            <br />
            Prints
          </>
        }
        description="Print, Copy, Scan and all your stationery needs — quick, easy and reliable."
        action={
          <Link to="/services" className="btn-primary">
            Get Started
            <ArrowRight className="size-4" />
          </Link>
        }
        image="/images/hero-home.jpg"
        features={[
          { icon: "zap", label: "Fast Service" },
          { icon: "shield", label: "Reliable Quality" },
          { icon: "store", label: "Wide Range of Stationery" },
        ]}
      >
        {/* Reference: the shortcut cards float over the photo's bottom edge. */}
        <div className="lg:absolute lg:inset-x-0 lg:bottom-[2.875rem] lg:z-10">
          <div className="pointer-events-none hidden flex-col items-center gap-2 pb-[1.15rem] lg:flex">
            <ArrowDown className="size-4 text-ink/70" />
            <p className="text-[0.95rem] text-ink/70">Explore Our Services</p>
          </div>
          <div className="container-rail grid gap-5 pb-12 sm:grid-cols-2 lg:grid-cols-4 lg:pb-0">
            {shortcuts.map((s) => (
              <ServiceShortcut key={s.id} service={s} />
            ))}
          </div>
        </div>
      </PageHero>
    </main>
  );
}
