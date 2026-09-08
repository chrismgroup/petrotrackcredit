import type { DipRecord, LPGTank, StockProduct, Tank } from '@/context/AppContext';

/**
 * Finds the newest approved dip that has a reading for one product in the
 * requested branch. Pending readings are intentionally excluded because only
 * an approved dip is an authoritative physical-stock snapshot.
 */
export function findLatestDipForProduct(
  dips: DipRecord[],
  dateKey: string,
  branchId: string | null,
  product: StockProduct,
  petrolTanks: Pick<Tank, 'id' | 'prod'>[],
  branchLpgTanks: Pick<LPGTank, 'id'>[],
  options: { beforeDate?: boolean; onOrBeforeDate?: boolean } = {},
): DipRecord | undefined {
  const { beforeDate = false, onOrBeforeDate = false } = options;
  const hasProductReading = (dip: DipRecord) => product === 'LPG'
    ? branchLpgTanks.some(tank => dip.lpg?.[tank.id] !== undefined)
    : petrolTanks.some(tank =>
      tank.prod === product && dip.rd?.[tank.id] !== undefined,
    );

  return dips
    .filter(dip => {
      const dipDate = dip.dt?.slice(0, 10) ?? '';
      return dipDate !== '' &&
        (beforeDate ? dipDate < dateKey : onOrBeforeDate ? dipDate <= dateKey : dipDate === dateKey) &&
        dip.status === 'approved' &&
        (branchId === null || dip.branchId === branchId) &&
        hasProductReading(dip);
    })
    .sort((a, b) =>
      (b.dt?.slice(0, 10) ?? '').localeCompare(a.dt?.slice(0, 10) ?? '') ||
      new Date(b.approvedDt ?? b.submittedAt ?? b.dt).getTime() -
        new Date(a.approvedDt ?? a.submittedAt ?? a.dt).getTime() ||
      b.id - a.id,
    )[0];
}