import { getBusinessDateConfirmationCopy } from './business-date-confirmation';

describe('business date confirmation copy', () => {
  it('identifies the record type and selected business date', () => {
    expect(getBusinessDateConfirmationCopy('shift report', '2026-08-27')).toEqual({
      title: 'Check the business date',
      body: 'Please cross-check the date before submitting this shift report.',
      dateLabel: 'Selected business date',
      dateValue: '27 Aug 2026',
      hint: 'This date determines where the record appears in operational reports.',
    });
  });
});