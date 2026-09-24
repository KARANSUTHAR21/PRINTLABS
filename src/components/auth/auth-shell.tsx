import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { ICONS, type HeroIcon } from "@/components/layout/page-hero";
import { cn } from "@/lib/utils";

/**
 * Reference auth layout: a full-height shop photo on the left with the
 * headline set over it and a dark feature band along the bottom, and a
 * light panel on the right carrying the white form card and a closing quote.
 */
export function AuthShell({
  photo,
  photoTitle,
  photoBody,
  features,
  quote,
  children,
}: {
  photo: string;
  photoTitle: ReactNode;
  photoBody: string;
  features: { icon: HeroIcon; title: string; hint: string }[];
  quote?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-[calc(100vh-4.6rem)] lg:grid-cols-[54%_46%]">
      <div className="relative hidden overflow-hidden lg:block">
        <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-[21%] border-t border-white/10 bg-navy/94" />
        <div className="relative z-10 flex h-full flex-col pl-[19%] pr-10 pt-24">
          <h2 className="auth-title text-[2.875rem] text-primary-fg">{photoTitle}</h2>
          <span className="mt-12 block h-[4px] w-[3.4rem] bg-primary" />
          <p className="mt-10 max-w-[15.5rem] text-[1.45rem] font-medium leading-snug text-primary-fg/95">
            {photoBody}
          </p>
        </div>
        <ul className="absolute inset-x-0 bottom-0 z-10 grid h-[21%] grid-cols-3 items-center">
          {features.map((f, index) => {
            const Icon = ICONS[f.icon];
            return (
              <li
                key={f.title}
                className={cn(
                  "flex h-full flex-col items-center justify-center px-4 text-center",
                  index > 0 && "border-l border-white/12",
                )}
              >
                <Icon className="size-[1.6rem] text-primary-fg" strokeWidth={1.7} />
                <p className="mt-3 text-[0.95rem] font-bold leading-tight text-primary-fg">
                  {f.title}
                </p>
                <p className="mt-1.5 text-[0.82rem] leading-snug text-primary-fg/70">{f.hint}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-col justify-center bg-[#f7f8fa] px-6 py-12">
        <div className="mx-auto w-full max-w-[37rem]">
          <div className="mb-6 lg:hidden">
            <Logo className="text-2xl" />
          </div>
          <div className="rounded-2xl bg-paper px-6 py-8 shadow-panel sm:px-10 sm:py-12">
            {children}
          </div>
          {quote && (
            <p className="mt-12 text-center text-[1.4rem] font-bold text-ink">
              “{quote}”
              <span className="mx-auto mt-6 block h-[4px] w-[3.4rem] rounded-full bg-primary" />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
