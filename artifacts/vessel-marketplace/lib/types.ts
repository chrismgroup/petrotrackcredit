export type VesselUserRole = 'client' | 'broker' | 'owner' | 'admin';

export interface VesselUser {
  id: number;
  name: string;
  email: string;
  role: VesselUserRole;
  company: string | null;
  phone: string | null;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: VesselUser;
}

export type VesselStatus = 'available' | 'on_hire' | 'laid_up' | 'decommissioned';
export type CharterStatus = 'enquiry' | 'negotiating' | 'confirmed' | 'active' | 'declined' | 'terminated';

export const VESSEL_TYPES = [
  'General Cargo Ship',
  'Bulk Carrier',
  'Container Ship',
  'Tanker (Crude)',
  'Tanker (Product)',
  'Tanker (Chemical)',
  'LPG Carrier',
  'LNG Carrier',
  'Barge',
  'MODU',
  'FPSO',
  'FSO',
  'Offshore Support Vessel (OSV)',
  'Platform Supply Vessel (PSV)',
  'Anchor Handling Tug',
  'Tugboat',
  'Dredger',
  'Crane Vessel',
  'Ro-Ro',
  'Ferry',
  'Other',
] as const;

export type VesselType = (typeof VESSEL_TYPES)[number];

export const RATE_BASES = [
  'Per Day',
  'Per Month',
  'Lump Sum',
  'Per DWT',
  'Per MT Cargo',
] as const;

export interface Vessel {
  id: number;
  ownerId: number;
  name: string;
  imoNumber: string | null;
  vesselType: string;
  flag: string | null;
  dwt: string | null;
  grt: string | null;
  yearBuilt: number | null;
  loa: string | null;
  beam: string | null;
  draft: string | null;
  classificationSociety: string | null;
  tradingArea: string | null;
  description: string | null;
  status: VesselStatus;
  createdAt: string;
  updatedAt: string;
  ownerName?: string;
  firstPhotoPath?: string | null;
}

export interface VesselContact {
  id: number;
  vesselId: number;
  contactName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface VesselPhoto {
  id: number;
  vesselId: number;
  objectPath: string;
  sortOrder: number;
  uploadedAt: string;
}

export interface VesselWithContacts extends Vessel {
  contacts: VesselContact[];
  photos: VesselPhoto[];
}

export interface CharterParty {
  id: number;
  vesselId: number;
  chartererId: number;
  ownerId: number;
  rate: string | null;
  rateCurrency: string | null;
  rateBasis: string | null;
  laycanEarliest: string | null;
  laycanLatest: string | null;
  durationDays: number | null;
  cargoPurpose: string | null;
  terms: string | null;
  status: CharterStatus;
  ownerConfirmedAt: string | null;
  chartererConfirmedAt: string | null;
  hireStart: string | null;
  hireEnd: string | null;
  createdAt: string;
  updatedAt: string;
  vesselName?: string;
  chartererName?: string;
  ownerName?: string;
}

export interface VesselNotification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  relatedId: number | null;
  read: boolean;
  createdAt: string;
}
