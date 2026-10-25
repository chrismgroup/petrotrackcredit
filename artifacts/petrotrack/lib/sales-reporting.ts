import { matchesExpenseReportPeriod, type ExpenseReportPeriod } from './expense-reporting';

export type SalesReportPeriod = ExpenseReportPeriod;

export interface SalesAuditEntry {
  id: number;
  date: string;
  branchId: string;
  branchName: string;
  product: string;
  quantity: number;
  amount: number;
}

export function salesUnit(product: string): 'kg' | 'L' {
  return product === 'LPG' ? 'kg' : 'L';
}

export function filterSalesAuditEntries(entries: SalesAuditEntry[], filters: {
  branchId: string;
  product: string;
  period: SalesReportPeriod;
  anchor: string;
}): SalesAuditEntry[] {
  return entries.filter(entry =>
    (filters.branchId === 'all' || entry.branchId === filters.branchId)
    && (filters.product === 'all' || entry.product === filters.product)
    && matchesExpenseReportPeriod(entry.date, filters.anchor, filters.period),
  );
}

export function groupSalesAuditEntries(entries: SalesAuditEntry[]) {
  const branches = new Map<string, { id: string; name: string; products: Map<string, SalesAuditEntry[]> }>();
  entries.forEach(entry => {
    const branch = branches.get(entry.branchId) ?? { id: entry.branchId, name: entry.branchName, products: new Map() };
    const productEntries = branch.products.get(entry.product) ?? [];
    productEntries.push(entry);
    branch.products.set(entry.product, productEntries);
    branches.set(entry.branchId, branch);
  });

  return [...branches.values()].sort((a, b) => a.name.localeCompare(b.name)).map(branch => {
    const products = [...branch.products.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([product, productEntries]) => {
      const daily = new Map<string, { date: string; quantity: number; amount: number; records: number }>();
      productEntries.forEach(entry => {
        const date = entry.date.slice(0, 10);
        const row = daily.get(date) ?? { date, quantity: 0, amount: 0, records: 0 };
        row.quantity += entry.quantity;
        row.amount += entry.amount;
        row.records += 1;
        daily.set(date, row);
      });
      return {
        product,
        unit: salesUnit(product),
        quantity: productEntries.reduce((sum, entry) => sum + entry.quantity, 0),
        amount: productEntries.reduce((sum, entry) => sum + entry.amount, 0),
        records: productEntries.length,
        daily: [...daily.values()].sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
    return {
      id: branch.id,
      name: branch.name,
      products,
      amount: products.reduce((sum, product) => sum + product.amount, 0),
      records: products.reduce((sum, product) => sum + product.records, 0),
    };
  });
}
