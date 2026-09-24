import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { fetchService } from "@/lib/api/public";
import type { ServiceRow } from "@/lib/server/catalog";

export const Route = createFileRoute("/services/$slug")({ component: ServiceDetail });

function ServiceDetail() {
  const { slug } = Route.useParams();
  const [service, setService] = useState<ServiceRow | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchService({ data: slug }).then((res) => {
      if (res.success) setService(res.service);
      else setError(res.message);
    });
  }, [slug]);

  if (error) {
    return <main className="container-page py-20 text-sm text-danger">{error}</main>;
  }
  if (!service) {
    return <main className="container-page py-20 text-sm text-muted">Loading…</main>;
  }

  return (
    <main className="container-page grid gap-10 py-12 lg:grid-cols-2">
      <img src={service.image} alt="" className="w-full rounded-3xl object-cover bg-mist" />
      <div>
        <p className="eyebrow">{service.subtitle}</p>
        <h1 className="mt-3 text-4xl font-extrabold">{service.title}</h1>
        <p className="mt-4 text-muted leading-relaxed">{service.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/products" className="btn-primary">
            Browse related products
            <ArrowRight className="size-4" />
          </Link>
          <Link to="/checkout" className="btn-outline">
            Go to checkout
          </Link>
        </div>
      </div>
    </main>
  );
}
