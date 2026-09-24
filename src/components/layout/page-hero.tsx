import type { ReactNode } from "react";
import {
  BadgePercent,
  Clock,
  FileText,
  Gift,
  Handshake,
  Heart,
  Leaf,
  Package,
  ShieldCheck,
  Star,
  Store,
  Tag,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const ICONS = {
  zap: Zap,
  shield: ShieldCheck,
  truck: Truck,
  users: Users,
  leaf: Leaf,
  package: Package,
  gift: Gift,
  star: Star,
  handshake: Handshake,
  heart: Heart,
  clock: Clock,
  file: FileText,
  value: BadgePercent,
  store: Store,
  tag: Tag,
};

export type HeroIcon = keyof typeof ICONS;

export type HeroFeature = { icon: HeroIcon; label: string };

/**
 * Reference hero: copy sits on a flat left panel, a hard-edged photo fills the
 * right ~two thirds, full-bleed to the top and bottom of the band. Never a
 * washed-out backdrop behind the text.
 *
 * `variant="home"` is the tall marketing hero (~758px at the reference width);
 * `variant="page"` is the shorter inner-page hero (~347px and up).
 */
export function PageHero({
  eyebrow,
  title,
  description,
  action,
  image,
  features,
  variant = "page",
  className,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  action?: ReactNode;
  image: string;
  features: HeroFeature[];
  variant?: "home" | "page";
  className?: string;
  children?: ReactNode;
}) {
  const home = variant === "home";
  return (
    <section className={cn("relative overflow-hidden bg-paper", className)}>
      <div className="absolute inset-y-0 right-0 hidden w-[68.6%] lg:block">
        <img src={image} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="container-page relative z-10">
        <div
          className={cn(
            "flex max-w-[26.5rem] flex-col py-10 lg:py-0",
            home
              ? "lg:min-h-[47.4rem] lg:pt-[5.4rem] lg:pb-[9rem]"
              : "lg:min-h-[21.7rem] lg:pt-[2.9rem] lg:pb-[3.4rem]",
          )}
        >
          <p className="eyebrow">{eyebrow}</p>
          <h1 className={cn("hero-title", home ? "mt-4" : "mt-3")}>{title}</h1>
          <p
            className={cn(
              "max-w-[24.5rem] text-[1.0625rem] leading-[1.55] text-muted",
              home ? "mt-8" : "mt-5",
            )}
          >
            {description}
          </p>
          {action && <div className={cn(home ? "mt-9" : "mt-8")}>{action}</div>}
          <ul
            className={cn(
              "flex gap-x-[5.1rem]",
              home ? "mt-10" : "mt-9",
            )}
          >
            {features.map((f) => {
              const Icon = ICONS[f.icon];
              return (
                <li key={f.label} className="flex w-12 shrink-0 flex-col items-center gap-[1.1rem]">
                  <Icon className="size-6 text-ink" strokeWidth={1.6} />
                  <span className="text-center text-[0.8125rem] font-semibold leading-[1.25] text-ink">
                    {f.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {children}
      {/* Mobile: the photo keeps its place below the copy. */}
      <img src={image} alt="" className="h-56 w-full object-cover lg:hidden" />
    </section>
  );
}

/**
 * Light gray feature band with hairline separators — the "why us" strip that
 * closes the services, products, about and cart surfaces in the reference.
 */
export function TrustBar({
  items,
  big = false,
}: {
  items: { icon: HeroIcon; title: string; hint: string }[];
  big?: boolean;
}) {
  return (
    <div className="container-page">
      <ul
        className={cn(
          "band grid gap-y-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0",
          big ? "py-8" : "py-7",
        )}
      >
        {items.map((item, index) => {
          const Icon = ICONS[item.icon];
          return (
            <li
              key={item.title}
              className={cn(
                "flex items-center gap-5 pl-8 pr-5 sm:pl-11",
                index > 0 && "lg:border-l lg:border-line",
              )}
            >
              <Icon
                className={cn("shrink-0 text-ink", big ? "size-[1.9rem]" : "size-6")}
                strokeWidth={1.6}
              />
              <span>
                <span
                  className={cn(
                    "block font-bold leading-tight text-ink",
                    big ? "text-[1.4rem]" : "text-[0.95rem]",
                  )}
                >
                  {item.title}
                </span>
                <span
                  className={cn(
                    "block leading-snug text-muted",
                    big ? "mt-1 text-[0.9rem]" : "text-[0.84rem]",
                  )}
                >
                  {item.hint}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
