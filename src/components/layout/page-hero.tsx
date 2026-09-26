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
 * Reference hero: copy sits on a white wash over a full-bleed photo; the
 * panel fades to the right and towards the bottom so the photo bleeds back in
 * under the feature row.
 *
 * `variant="home"` fills the viewport below the header and hosts the floating
 * shortcut cards; `variant="page"` is the shorter inner-page hero.
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
  titleClassName,
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
  /** Long product titles sit a step smaller in the reference. */
  titleClassName?: string;
  children?: ReactNode;
}) {
  const home = variant === "home";
  return (
    <section className={cn("relative isolate overflow-hidden bg-paper", className)}>
      {/* Reference heroes are full-bleed photos; the copy sits on a white wash. */}
      <img
        src={image}
        alt=""
        className="absolute inset-0 -z-10 hidden h-full w-full object-cover lg:block"
      />
      <div
        aria-hidden
        className="hero-panel pointer-events-none absolute inset-y-0 left-0 -z-10 hidden w-[max(32%,31rem)] lg:block"
      />
      <div className="container-page relative">
        <div
          className={cn(
            "flex flex-col py-10 lg:max-w-[29rem] lg:py-0",
            home && "max-w-[26.5rem]",
            home
              ? "lg:min-h-[calc(100vh-4.6rem)] lg:pt-[5.2rem] lg:pb-[12rem]"
              : "lg:min-h-[22.4rem] lg:pt-[2.9rem] lg:pb-[2.5rem]",
          )}
        >
          <p className="eyebrow">{eyebrow}</p>
          <h1 className={cn("hero-title", home ? "mt-[1.1rem]" : "mt-[0.6rem]", titleClassName)}>
            {title}
          </h1>
          <p
            className={cn(
              "text-[1.03rem] leading-[1.5] text-muted",
              home ? "mt-[1.45rem] max-w-[24.5rem]" : "mt-[1rem] max-w-[28rem]",
            )}
          >
            {description}
          </p>
          {action && <div className="mt-[1.9rem]">{action}</div>}
          <ul className="mt-[1.95rem] flex gap-x-1">
            {features.map((f) => {
              const Icon = ICONS[f.icon];
              return (
                <li key={f.label} className="flex w-24 shrink-0 flex-col items-center gap-3">
                  <Icon className="size-7 text-ink" strokeWidth={1.6} />
                  <span className="text-center text-[0.8125rem] font-semibold leading-[1.25] text-ink">
                    {f.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {/* Mobile: the photo keeps its place between the copy and the cards. */}
      <img src={image} alt="" className="h-56 w-full object-cover lg:hidden" />
      {children}
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
          big ? "py-[1.3rem]" : "py-7",
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
                    big ? "text-[1.6rem]" : "text-[0.95rem]",
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
