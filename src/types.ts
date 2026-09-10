export type SplitMode = 'grid' | 'custom';

export interface Character {
  id: string;
  name: string;
  sourceImageUrl: string;
  faceSourceUrl?: string;
  bodySourceUrl?: string;
  threeViewImageUrl: string;
  heightSetting: 'child' | 'normal' | 'aesthetic' | 'tall';
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  sourceImage?: string; // Base64 or URL
  splitMode: SplitMode;
  rows: number;
  cols: number;
  horizontalLines: number[]; // Positions in percentage (0-100)
  verticalLines: number[];   // Positions in percentage (0-100)
  tiles: Tile[];
  characters?: Character[];
  maskedImages?: MaskedImage[];
  compositeImages?: CompositeImage[];
}

export interface CompositeImage {
  id: string;
  dataUrl: string;
  tileIds: string[];
  columns: number;
  createdAt: number;
}

export interface MaskedImage {
  id: string;
  dataUrl: string;
  sourceUrl: string;
  createdAt: number;
}

export interface Tile {
  id: string;
  dataUrl: string;
  row: number;
  col: number;
  isSelected: boolean;
  selectionOrder?: number;
}

export type GridMode = 2 | 3 | 4 | 5;
