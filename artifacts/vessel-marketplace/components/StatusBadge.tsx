import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { VesselStatus, CharterStatus } from '@/lib/types';

const VESSEL_STATUS: Record<VesselStatus, { bg: string; text: string; label: string }> = {
  available:      { bg: '#DCFCE7', text: '#15803D', label: 'Available' },
  on_hire:        { bg: '#FEF3C7', text: '#D97706', label: 'On Hire' },
  laid_up:        { bg: '#E5E7EB', text: '#6B7280', label: 'Laid Up' },
  decommissioned: { bg: '#FEE2E2', text: '#B91C1C', label: 'Decommissioned' },
};

const CHARTER_STATUS: Record<CharterStatus, { bg: string; text: string; label: string }> = {
  enquiry:     { bg: '#EDE9FE', text: '#7C3AED', label: 'Enquiry' },
  negotiating: { bg: '#DBEAFE', text: '#1D4ED8', label: 'Negotiating' },
  confirmed:   { bg: '#D1FAE5', text: '#047857', label: 'Confirmed' },
  active:      { bg: '#FEF3C7', text: '#D97706', label: 'Active (On Hire)' },
  declined:    { bg: '#FEE2E2', text: '#B91C1C', label: 'Declined' },
  terminated:  { bg: '#F3F4F6', text: '#6B7280', label: 'Terminated' },
};

interface Props {
  type: 'vessel' | 'charter';
  status: string;
  small?: boolean;
}

export function StatusBadge({ type, status, small }: Props) {
  const map: Record<string, { bg: string; text: string; label: string }> =
    type === 'vessel' ? VESSEL_STATUS : CHARTER_STATUS;
  const config = map[status] ?? { bg: '#F3F4F6', text: '#374151', label: status };
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, small && styles.small]}>
      <Text style={[styles.text, { color: config.text }, small && styles.smallText]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 13, fontWeight: '600' },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  smallText: { fontSize: 11 },
});
