import { createFileRoute } from "@tanstack/react-router";
import { InventoryTable } from "@/components/vendor/inventory-table";
import { VendorShell } from "@/components/vendor/vendor-shell";
export const Route = createFileRoute("/vendor/inventory/")({ component: () => <VendorShell><InventoryTable /></VendorShell> });
