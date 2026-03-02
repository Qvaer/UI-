
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComparisonResult {
  diffImageUrl: string;
  alignedDevImageUrl: string; // New: Scaled/Aligned dev image for display
  pixelScore: number; // 0-100 purely based on pixels
  width: number;
  height: number;
  scaleFactor: number; // The ratio used to scale Dev to Design (DesignWidth / DevWidth)
  diffSegments: {
    top: number;    // Mismatch count in top 20%
    middle: number; // Mismatch count in middle 60%
    bottom: number; // Mismatch count in bottom 20%
  };
  diffBoxes: BoundingBox[]; // Detected clusters of differences
  totalPixels: number;
}

export interface AnalysisResult {
  score: number;
  summary: string;
  issues: Issue[];
}

export type IssueType = 'layout' | 'color' | 'typography' | 'content' | 'other';
export type IssueSubType = 'font-weight' | 'font-size' | 'font-family' | 'position' | 'dimension' | 'missing' | 'text' | 'icon';

export interface Issue {
  id: string;
  type: IssueType;
  subType?: IssueSubType; // More specific classification
  location?: string; // New: Professional UI component location (e.g., "Navigation Bar", "Submit Button")
  description: string; // The specific problem (e.g., "Missing Icon")
  severity: 'high' | 'medium' | 'low';
  
  relatedBox?: BoundingBox; // Represents the Box on the DEV image (the "actual" state/position)
  designBox?: BoundingBox;  // Represents the Box on the DESIGN image (the "expected" state/position)
  
  specificSuggestions: string[]; // Suggestions specific to this issue
  
  // New: Allow multiple sub-issues in one container
  secondaryIssues?: Array<{
    subType: IssueSubType;
    description: string;
  }>;

  // New fields for client-side calculation
  deltaPx?: number; // Raw physical pixel difference found by AI (for Position)
  direction?: 'up' | 'down' | 'left' | 'right'; // Direction of the shift (Dev relative to Design)
  
  // New fields for comparison values (e.g. Font Size, Dimensions)
  designVal?: number | string; // Updated to allow string for Text content
  devVal?: number | string;    // Updated to allow string for Text content
  
  // UI Flag
  isAiEnhanced?: boolean; // True if Gemini has refined this issue
}

export enum ViewMode {
  SIDE_BY_SIDE = 'SIDE_BY_SIDE',
  OVERLAY = 'OVERLAY',
  SLIDER = 'SLIDER',
  DIFF_ONLY = 'DIFF_ONLY'
}

export interface ImageSize {
  width: number;
  height: number;
}

// --- SKETCH TYPES ---
export interface SketchLayer {
  class: string;
  name: string;
  frame: { x: number; y: number; width: number; height: number };
  text?: string;
  style?: any;
  attributedString?: any; // Raw text style data
}

export interface SketchData {
  previewImage: string; // Base64 of the preview
  artboardWidth: number; // Logical width from artboard frame
  meta: any;
  textLayers: SketchLayer[]; // Flat list of text layers for easy checking
}

// --- MASTERGO TYPES ---
export interface MasterGoConfig {
  fileKey: string;
  nodeId?: string;
  token: string;
}

export interface MasterGoNodeData {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox: { x: number; y: number; width: number; height: number };
  fills: any[];
  style?: any; // Text styles
  characters?: string; // Text content
}
