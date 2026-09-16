export interface RawPaint {
  type: 'SOLID' | 'IMAGE' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND';
  visible?: boolean;
  opacity?: number;
  color?: { r: number; g: number; b: number };
  imageHash?: string | null;
  scaleMode?: string;
  gradientStops?: Array<{ position: number; color: { r: number; g: number; b: number; a?: number } }>;
  gradientTransform?: number[][];
}

/** Node Figma đã đọc ra. Mọi trường optional; symbol nghĩa là figma.mixed. */
export interface RawNode {
  id: string;
  name: string;
  type: string;
  x?: number; y?: number; width?: number; height?: number;
  visible?: boolean; opacity?: number; rotation?: number; blendMode?: string;
  locked?: boolean; clipsContent?: boolean;
  fills?: readonly RawPaint[] | symbol;
  strokes?: readonly RawPaint[];
  strokeWeight?: number | symbol;
  cornerRadius?: number | symbol;
  topLeftRadius?: number; topRightRadius?: number;
  bottomRightRadius?: number; bottomLeftRadius?: number;
  characters?: string;
  fontName?: { family: string; style: string } | symbol;
  fontSize?: number | symbol;
  lineHeight?: { value: number; unit: string } | symbol;
  letterSpacing?: { value: number; unit: string } | symbol;
  textAlignHorizontal?: string; textAlignVertical?: string; textAutoResize?: string;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  primaryAxisAlignItems?: string;
  effects?: readonly unknown[];
  mainComponentName?: string;
  children?: readonly RawNode[];
}

export interface SnapNode {
  id: string; name: string; type: string;
  x?: number; y?: number; w?: number; h?: number;
  c?: SnapNode[];
  [key: string]: unknown;
}

export interface Warning {
  node: string;
  name: string;
  issue: 'overflow' | 'offscreen' | 'overlap' | 'contrast' | 'contrast_unknown'
       | 'tiny_font' | 'hidden' | 'unnamed' | 'missing_font';
  detail: string;
}

export interface Snapshot {
  schema: 'figma-snapshot/1';
  root: SnapNode;
  warnings: Warning[];
  truncated?: { omitted: number; hint: string };
}
