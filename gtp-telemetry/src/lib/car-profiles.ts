import type { CarProfile } from './types';

import bmw from '../data/car-quirks/bmw-m-hybrid-v8.json';
import ferrari from '../data/car-quirks/ferrari-499p.json';
import cadillac from '../data/car-quirks/cadillac-v-series-r.json';
import porsche from '../data/car-quirks/porsche-963.json';
import acura from '../data/car-quirks/acura-arx-06.json';

const ALL_CARS: CarProfile[] = [
  bmw as CarProfile,
  ferrari as CarProfile,
  cadillac as CarProfile,
  porsche as CarProfile,
  acura as CarProfile,
];

export function detectCar(carScreenName: string): CarProfile | null {
  if (!carScreenName) return null;
  const lower = carScreenName.toLowerCase();
  for (const car of ALL_CARS) {
    for (const match of car.screenNameMatch) {
      if (lower.includes(match.toLowerCase())) return car;
    }
  }
  return null;
}

export function getCarProfile(carId: string): CarProfile | undefined {
  return ALL_CARS.find((c) => c.id === carId);
}

export function getAllCars(): CarProfile[] {
  return ALL_CARS;
}
