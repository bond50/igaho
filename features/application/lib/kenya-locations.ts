import kenyaLocationsData from './kenya-locations.json';

export type KenyaWard = {
  code: string;
  name: string;
};

export type KenyaSubCounty = {
  code: string;
  name: string;
  wards: KenyaWard[];
};

export type KenyaCounty = {
  code: string;
  name: string;
  subCounties: KenyaSubCounty[];
};

export const kenyaLocations = kenyaLocationsData as KenyaCounty[];

export function findKenyaLocationSelection(countyCode: string, subCountyCode: string, wardCode: string) {
  const county = kenyaLocations.find((item) => item.code === countyCode);
  if (!county) {
    return null;
  }

  const subCounty = county.subCounties.find((item) => item.code === subCountyCode);
  if (!subCounty) {
    return null;
  }

  const ward = subCounty.wards.find((item) => item.code === wardCode);
  if (!ward) {
    return null;
  }

  return { county, subCounty, ward };
}
