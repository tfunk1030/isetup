// All iRacing telemetry channels use SI units. Convert for display.

export const speedToKph = (mps: number): number => mps * 3.6;
export const accelToG = (mps2: number): number => mps2 / 9.81;
export const pressureToPSI = (kpa: number): number => kpa / 6.895;
export const heightToMM = (m: number): number => m * 1000;
export const angleToDegs = (rad: number): number => rad * (180 / Math.PI);
export const fuelToKg = (liters: number): number => liters * 0.75;
