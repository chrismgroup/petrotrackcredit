import { fmtDate } from '@/context/AppContext';

export function getBusinessDateConfirmationCopy(recordType: string, date: string) {
  return {
    title: 'Check the business date',
    body: `Please cross-check the date before submitting this ${recordType}.`,
    dateLabel: 'Selected business date',
    dateValue: fmtDate(date),
    hint: 'This date determines where the record appears in operational reports.',
  };
}