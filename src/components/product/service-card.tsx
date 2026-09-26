import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  Image as ImageIcon,
  Printer,
  ScanLine,
} from "lucide-react";
import type { ServiceRow } from "@/lib/server/catalog";

const ICONS = {
  printer: Printer,
  scan: ScanLine,
  book: CalendarDays,
  image: ImageIcon,
  briefcase: Briefcase,
} as const;

export function ServiceCard({ service }: { service: ServiceRow }) {
  const Icon = ICONS[service.icon as keyof typeof ICONS] ?? Printer;
  return (
    <article className="card-surface flex h-full flex-col overflow-hidden">
      <img src={service.image} alt="" className="card-media" />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center gap-4 text-ink">
          <Icon className="size-6 shrink-0" strokeWidth={1.6} />
          <h3 className="text-[1.0625rem] font-bold leading-tight">{service.title}</h3>
        </div>
        <p className="mt-4 flex-1 text-[0.95rem] leading-[1.6] text-muted">{service.description}</p>
        <Link
          to="/services/$slug"
          params={{ slug: service.slug }}
          className="btn-outline mt-6 min-h-9 w-full text-[0.875rem]"
        >
          Learn More
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  );
}

/** Home hero shortcut tile: outlined icon, title and subtitle — 98px tall in the reference. */
export function ServiceShortcut({
  service,
}: {
  service: Pick<ServiceRow, "slug" | "title" | "subtitle" | "icon">;
}) {
  const Icon = ICONS[service.icon as keyof typeof ICONS] ?? Printer;
  return (
    <Link
      to="/services/$slug"
      params={{ slug: service.slug }}
      className="card-surface flex min-h-[6.125rem] items-center gap-[1.95rem] px-7 py-7 transition-colors hover:border-muted-2"
    >
      <Icon className="size-10 shrink-0 text-ink" strokeWidth={1.5} />
      <span className="min-w-0">
        <span className="block truncate text-[0.95rem] font-bold leading-tight text-ink">
          {service.title}
        </span>
        <span className="mt-1 block truncate text-[0.85rem] leading-snug text-muted">
          {service.subtitle}
        </span>
      </span>
    </Link>
  );
}
