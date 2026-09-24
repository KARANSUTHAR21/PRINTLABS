import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-baseline gap-0 font-extrabold tracking-tight", className)}>
      <span className="text-ink">Print</span>
      <span className="text-primary">Hub</span>
    </Link>
  );
}
