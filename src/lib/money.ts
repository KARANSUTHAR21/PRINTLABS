export const CURRENCY = "INR";
export const TAX_BPS = 0; // matches the PrintHub bill: Tax (0%)

export function paise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatINR(paiseAmount: number): string {
  const rupees = paiseAmount / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(rupees);
}

export function formatINRNumber(paiseAmount: number): string {
  return formatINR(paiseAmount).replace("₹", "₹");
}

export function calcTax(subtotalPaise: number, bps = TAX_BPS): number {
  return Math.round((subtotalPaise * bps) / 10000);
}

export function calcTotals(subtotalPaise: number, bps = TAX_BPS) {
  const tax = calcTax(subtotalPaise, bps);
  return { subtotalPaise, taxPaise: tax, totalPaise: subtotalPaise + tax };
}
