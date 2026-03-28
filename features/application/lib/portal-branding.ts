export const DEFAULT_ORGANIZATION_NAME = 'IGANO Professional Development Association';
export const DEFAULT_ORGANIZATION_SHORT_NAME = 'IGPDA';

export function getOrganizationBrandMark(shortName?: string | null) {
  const compact = (shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME).replace(/[^A-Za-z0-9]/g, '');
  return compact.slice(0, 2).toUpperCase() || 'IG';
}
