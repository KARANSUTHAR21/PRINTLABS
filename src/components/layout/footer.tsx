import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-canvas">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo className="text-2xl" />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            Your neighbourhood partner for print, copy, scan and stationery. Same day.
            Everyday.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Visit</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            14 Market Lane
            <br />
            Open 8:00–21:00 · Mon–Sat
            <br />
            Sunday 10:00–18:00
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Explore</p>
          <div className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
            <Link to="/services">Services</Link>
            <Link to="/products">Products</Link>
            <Link to="/about">About</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
