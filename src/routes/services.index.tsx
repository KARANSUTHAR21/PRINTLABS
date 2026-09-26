import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { fetchServices } from "@/lib/api/public";
import { PageHero, TrustBar } from "@/components/layout/page-hero";
import { ServiceCard } from "@/components/product/service-card";
import type { ServiceRow } from "@/lib/server/catalog";

export const Route = createFileRoute("/services/")({ component: ServicesPage });

function ServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchServices().then((res) => {
      if (res.success) setServices(res.services);
      else setError(res.message);
    });
  }, []);

  return (
    <main>
      <PageHero
        eyebrow="Same day. Everyday."
        title="Our Services"
        description="Everything you need to print, copy, scan and more — all in one place."
        image="/images/hero-services.jpg"
        features={[
          { icon: "zap", label: "Fast Service" },
          { icon: "shield", label: "Reliable Quality" },
          { icon: "store", label: "Wide Range of Solutions" },
        ]}
      />
      <section className="container-page pt-4 pb-[0.75rem]">
        <div className="mb-[0.6rem] flex items-end justify-between gap-4">
          <h2 className="text-[1.6rem] font-extrabold tracking-tight">Our Services</h2>
          <p className="text-[0.95rem] text-muted">Professional. Affordable. Convenient.</p>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {services.length === 0 && !error && (
          <p className="text-sm text-muted">Loading services…</p>
        )}
        <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-5">
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      </section>
      <div className="pb-8">
        <TrustBar
          items={[
            { icon: "truck", title: "Quick Turnaround", hint: "Same day service" },
            { icon: "shield", title: "Trusted Quality", hint: "Professional results" },
            { icon: "users", title: "For Everyone", hint: "Students, Professionals & Businesses" },
            { icon: "leaf", title: "Sustainable Choices", hint: "Print smarter, greener" },
          ]}
        />
      </div>
    </main>
  );
}
