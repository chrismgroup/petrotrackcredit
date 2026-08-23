import type { DipRecord, LPGTank, StockProduct, Tank } from '@/context/AppContext';

/**
 * Finds the newest dip that has a reading for one product in the requested
 * branch. Dips can be submitted separately by product, so the newest
 * branch-wide record must not hide an earlier approved reading for PMS, AGO,
 * DPK, Lube Oil, or LPG on the same business date.
 */
export function findLatestDipForProduct(
  dips: DipRecord[],
  dateKey: string,
  branchId: string | null,
  product: StockProduct,
  petrolTanks: Pick<Tank, 'id' | 'prod'>[],
  branchLpgTanks: Pick<LPGTank, 'id'>[],
  options: { beforeDate?: boolean; approvedOnly?: boolean } = {},
): DipRecord | undefined {
  const { beforeDate = false, approvedOnly = true } = options;
  const hasProductReading = (dip: DipRecord) => product === 'LPG'
    ? branchLpgTanks.some(tank => dip.lpg?.[tank.id] !== undefined)
    : petrolTanks.some(tank =>
      tank.prod === product && dip.rd?.[tank.id] !== undefined,
    );

  return dips
    .filter(dip => {
      const dipDate = dip.dt?.slice(0, 10) ?? '';
      return dipDate !== '' &&
        (beforeDate ? dipDate < dateKey : dipDate === dateKey) &&
        (!approvedOnly || dip.status === 'approved') &&
        (approvedOnly || dip.status !== 'rejected') &&
        (dip.branchId === branchId || hasProductReading(dip)) &&
        hasProductReading(dip);
    })
    .sort((a, b) =>
      (b.dt?.slice(0, 10) ?? '').localeCompare(a.dt?.slice(0, 10) ?? '') ||
      new Date(b.approvedDt ?? b.submittedAt ?? b.dt).getTime() -
        new Date(a.approvedDt ?? a.submittedAt ?? a.dt).getTime() ||
      b.id - a.id,
    )[0];
}