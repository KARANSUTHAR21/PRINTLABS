import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as Popover from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, Search, ShoppingCart, User, X } from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Logo } from "@/components/brand";
import { CartPanel } from "@/components/cart/cart-panel";
import { useCart } from "@/components/cart/cart-provider";
import { SearchDialog } from "@/components/search/search-dialog";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/products", label: "Products" },
  { to: "/about", label: "About" },
] as const;

/** The reference auth screens carry the logo alone — no tagline. */
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { cart } = useCart();
  const { isPending } = useCurrentUserState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const showTagline = !AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line-soft bg-paper/95 backdrop-blur">
      <div className="container-page flex h-[4.6rem] items-center gap-4">
        <div className="flex min-w-0 items-center gap-8">
          <Logo className="text-[1.9rem]" />
          {showTagline && (
            <p className="hidden truncate text-[0.9rem] text-muted lg:block">
              Print · Copy · Scan · Stationery · All in One
            </p>
          )}
        </div>
        <nav className="ml-auto hidden items-center gap-8 md:flex">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative pb-1.5 text-[0.95rem] font-semibold text-ink/80 transition-colors hover:text-ink",
                  active && "text-ink",
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-ink" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-10">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-ink hover:bg-canvas"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-5" />
          </button>
          <Popover.Root open={cartOpen} onOpenChange={setCartOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="relative grid size-10 place-items-center rounded-full text-ink hover:bg-canvas"
                aria-label="Cart"
              >
                <ShoppingCart className="size-5" />
                {cart.count > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-[1.15rem] place-items-center rounded-full bg-primary px-1 text-[10.5px] font-bold leading-[1.15rem] text-primary-fg">
                    {cart.count}
                  </span>
                )}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={114}
                collisionPadding={16}
                className="z-50"
              >
                <CartPanel onNavigate={() => setCartOpen(false)} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {isPending ? (
            <div className="size-10 animate-pulse rounded-full bg-mist" />
          ) : (
            <>
              <SignedOut>
                <Link
                  to="/login"
                  search={{ next: pathname }}
                  className="grid size-10 place-items-center rounded-full text-ink hover:bg-canvas"
                  aria-label="Account"
                >
                  <User className="size-5" />
                </Link>
              </SignedOut>
              <SignedIn>
                <AccountMenu />
              </SignedIn>
            </>
          )}
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-ink hover:bg-canvas md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 md:hidden" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[min(20rem,100%)] bg-paper p-6 shadow-pop md:hidden">
            <div className="mb-6 flex items-center justify-between">
              <Dialog.Title className="font-bold">Menu</Dialog.Title>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-3">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-2 py-2 text-base font-medium hover:bg-canvas"
                >
                  {item.label}
                </Link>
              ))}
              <Link to="/cart" onClick={() => setMenuOpen(false)} className="rounded-xl px-2 py-2 hover:bg-canvas">
                Cart
              </Link>
            </nav>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}

function AccountMenu() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-full text-ink hover:bg-canvas"
          aria-label="Account menu"
        >
          <User className="size-5" />
        </button>
      </Popover.Trigger>
      <Popover.Content align="end" sideOffset={8} className="z-50 w-56 rounded-2xl border border-line bg-paper p-3 shadow-pop">
        <div className="space-y-1 text-sm">
          <Link to="/profile" className="block rounded-xl px-3 py-2 hover:bg-canvas">
            Profile
          </Link>
          <Link to="/orders" className="block rounded-xl px-3 py-2 hover:bg-canvas">
            Orders
          </Link>
        </div>
        <div className="mt-2 border-t border-line pt-2">
          <UserButton />
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
