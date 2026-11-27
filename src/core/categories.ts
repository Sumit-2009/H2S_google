import type { EntityCategory } from './types';

export interface CategoryMeta {
  id: EntityCategory;
  label: string;
  shortTag: string;
  colorVar: string;
  bgVar: string;
}

export const CATEGORY_ORDER: readonly EntityCategory[] = [
  'EMAIL',
  'IN_PHONE',
  'INTL_PHONE',
  'IPV4',
  'IPV6',
  'PAN',
  'AADHAAR',
  'PAYMENT_CARD',
];

export const CATEGORY_META: Record<EntityCategory, CategoryMeta> = {
  EMAIL: {
    id: 'EMAIL',
    label: 'Email Address',
    shortTag: 'EMAIL',
    colorVar: 'var(--cat-email)',
    bgVar: 'var(--cat-email-bg)',
  },
  IN_PHONE: {
    id: 'IN_PHONE',
    label: 'Indian Phone',
    shortTag: 'PHONE',
    colorVar: 'var(--cat-phone)',
    bgVar: 'var(--cat-phone-bg)',
  },
  INTL_PHONE: {
    id: 'INTL_PHONE',
    label: 'International Phone',
    shortTag: 'INTL',
    colorVar: 'var(--cat-intl)',
    bgVar: 'var(--cat-intl-bg)',
  },
  IPV4: {
    id: 'IPV4',
    label: 'IPv4 Address',
    shortTag: 'IPV4',
    colorVar: 'var(--cat-ipv4)',
    bgVar: 'var(--cat-ipv4-bg)',
  },
  IPV6: {
    id: 'IPV6',
    label: 'IPv6 Address',
    shortTag: 'IPV6',
    colorVar: 'var(--cat-ipv6)',
    bgVar: 'var(--cat-ipv6-bg)',
  },
  PAN: {
    id: 'PAN',
    label: 'Indian PAN',
    shortTag: 'PAN',
    colorVar: 'var(--cat-pan)',
    bgVar: 'var(--cat-pan-bg)',
  },
  AADHAAR: {
    id: 'AADHAAR',
    label: 'Aadhaar Format',
    shortTag: 'AADHAAR',
    colorVar: 'var(--cat-aadhaar)',
    bgVar: 'var(--cat-aadhaar-bg)',
  },
  PAYMENT_CARD: {
    id: 'PAYMENT_CARD',
    label: 'Payment Card',
    shortTag: 'CARD',
    colorVar: 'var(--cat-card)',
    bgVar: 'var(--cat-card-bg)',
  },
};
