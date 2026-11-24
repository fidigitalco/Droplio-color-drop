/**
 * Purely cosmetic skins. They change materials only — never hitboxes, speed or
 * rules — so no skin gives a gameplay advantage.
 */

export type MatcapStyle = 'glossy' | 'candy' | 'metal' | 'glass' | 'pearl';

export interface BallSkin {
  id: string;
  name: string;
  style: MatcapStyle;
  /** red, blue, yellow */
  palette: [string, string, string];
  cost: number;
  unlockLevel: number;
}

export interface TraySkin {
  id: string;
  name: string;
  body: string;
  bodyStyle: MatcapStyle;
  accent: string;
  cost: number;
  unlockLevel: number;
}

export const BALL_SKINS: BallSkin[] = [
  { id: 'classic', name: 'Classic Gloss', style: 'glossy', palette: ['#ff3b5c', '#2f7bff', '#ffc812'], cost: 0, unlockLevel: 1 },
  { id: 'candy', name: 'Candy', style: 'candy', palette: ['#ff5f8f', '#5aa8ff', '#ffd84a'], cost: 150, unlockLevel: 8 },
  { id: 'pearl', name: 'Pearl', style: 'pearl', palette: ['#ff7a8a', '#7aa2ff', '#ffe08a'], cost: 300, unlockLevel: 20 },
  { id: 'metal', name: 'Chrome', style: 'metal', palette: ['#e8203f', '#1f5fe0', '#f0b400'], cost: 500, unlockLevel: 35 },
  { id: 'glass', name: 'Crystal', style: 'glass', palette: ['#ff2d55', '#2b8cff', '#ffcc00'], cost: 800, unlockLevel: 60 },
];

export const TRAY_SKINS: TraySkin[] = [
  { id: 'classic', name: 'Snow', body: '#f4f6ff', bodyStyle: 'glossy', accent: '#ffffff', cost: 0, unlockLevel: 1 },
  { id: 'mint', name: 'Mint', body: '#9ff0d4', bodyStyle: 'candy', accent: '#e9fff7', cost: 150, unlockLevel: 12 },
  { id: 'lilac', name: 'Lilac', body: '#c9b5ff', bodyStyle: 'pearl', accent: '#f4efff', cost: 300, unlockLevel: 25 },
  { id: 'gold', name: 'Gold', body: '#ffcf4a', bodyStyle: 'metal', accent: '#fff2c2', cost: 600, unlockLevel: 45 },
  { id: 'night', name: 'Midnight', body: '#343a66', bodyStyle: 'glossy', accent: '#8b93ff', cost: 900, unlockLevel: 75 },
];

export function ballSkin(id: string): BallSkin {
  return BALL_SKINS.find((s) => s.id === id) ?? BALL_SKINS[0];
}

export function traySkin(id: string): TraySkin {
  return TRAY_SKINS.find((s) => s.id === id) ?? TRAY_SKINS[0];
}

export const UI = {
  red: '#ff3b5c',
  blue: '#2f7bff',
  yellow: '#ffc812',
  ink: '#2b2350',
  inkSoft: '#6b6390',
  card: '#ffffff',
  bgTop: '#8fd3ff',
  bgMid: '#b8a6ff',
  bgBottom: '#ffc4e1',
  gold: '#ffb800',
  green: '#25c48a',
};
