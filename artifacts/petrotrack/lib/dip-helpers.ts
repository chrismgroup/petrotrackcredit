import type { DipRecord, LPGTank, StockProduct, Tank } from '@/context/AppContext';

/**
 * Finds the newest non-rejected dip that has a reading for one product in the
 * requested branch. Pending readings are included so the MD can see the
 * resulting variance on the stock snapshot before approving; a rejected dip
 * never counts as a physical-stock reading. When a pending and an approved
 * reading exist for the same date, the approved one wins.
 */
export function findLatestDipForProduct(
  dips: DipRecord[],
  dateKey: string,
  branchId: string | null,
  product: StockProduct,
  petrolTanks: Pick<Tank, 'id' | 'prod'>[],
  branchLpgTanks: Pick<LPGTank, 'id'>[],
  options: { beforeDate?: boolean } = {},
): DipRecord | undefined {
  const { beforeDate = false } = options;
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
        dip.status !== 'rejected' &&
        (branchId === null || dip.branchId === branchId) &&
        hasProductReading(dip);
    })
    .sort((a, b) => {
      const dateCompare = (b.dt?.slice(0, 10) ?? '').localeCompare(a.dt?.slice(0, 10) ?? '');
      if (dateCompare !== 0) return dateCompare;
      const statusRank = (status: DipRecord['status']) => status === 'approved' ? 0 : 1;
      const statusCompare = statusRank(a.status) - statusRank(b.status);
      if (statusCompare !== 0) return statusCompare;
      return new Date(b.approvedDt ?? b.submittedAt ?? b.dt).getTime() -
        new Date(a.approvedDt ?? a.submittedAt ?? a.dt).getTime() ||
        b.id - a.id;
    })[0];
}