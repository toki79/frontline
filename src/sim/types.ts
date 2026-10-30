// Grundtypen. Bewusst offen gehalten ([k: string]: any), damit der Umbau schrittweise strenger werden kann.
export interface Entity {
  id: number; kind: string; type: string; owner: number;
  x: number; y: number; hp: number; maxHp: number; def: any; dead?: boolean;
  [k: string]: any;
}
export interface Player {
  id: number; name: string; short: string; col: string; dark: string;
  res: { money: number; food: number; wood: number; stone: number; metal: number; oil: number };
  pop: number; cap: number; tech: number; q: Record<string, any[]>;
  [k: string]: any;
}
export interface Game {
  t: number; units: Entity[]; buildings: Entity[]; players: Player[];
  [k: string]: any;
}
