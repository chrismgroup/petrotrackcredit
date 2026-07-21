export const Colors = {
  primary:       '#00205B',
  primaryLight:  '#003580',
  primaryMid:    '#0047AB',
  accent:        '#E8A020',
  accentLight:   '#F5C050',
  success:       '#1A7A3A',
  successLight:  '#DCFCE7',
  successText:   '#15803D',
  warning:       '#D97706',
  warningLight:  '#FEF3C7',
  danger:        '#DC2626',
  dangerLight:   '#FEE2E2',
  grey:          '#6B7280',
  greyLight:     '#E5E7EB',

  background:    '#F0F4F9',
  card:          '#FFFFFF',
  border:        '#D4DCE8',
  borderLight:   '#EBF0F8',

  text:          '#0F1C2E',
  textSecondary: '#4A5C73',
  textMuted:     '#8A9AB5',
  textInverse:   '#FFFFFF',

  tabBar:        '#00205B',
  tabBarBorder:  '#002878',
  tabBarActive:  '#FFFFFF',
  tabBarInactive:'#6A90C0',

  navy:          '#00205B',
  ocean:         '#003580',
  steel:         '#4A6A8A',

  radius:        12,
  radiusSm:      8,
  radiusLg:      16,
  radiusFull:    999,
} as const;

export type AppColors = typeof Colors;
