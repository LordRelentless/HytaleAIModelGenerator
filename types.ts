
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export type ModelType = 'ENTITY' | 'BLOCK' | 'GENERIC';
export type ModLoader = 'VANILLA' | 'NEOFORGE' | 'FORGE' | 'FABRIC' | 'CREATE' | 'HYTALE' | 'BLENDER' | 'UE5' | 'UNITY' | 'GODOT' | 'CREATION_ENGINE';

// --- Shared / Generic Internal Structure for Viewer ---
export interface ModelCube {
  origin: [number, number, number]; // Min corner (Bedrock style) or calculated from 'from'
  size: [number, number, number]; // width, height, depth
  rotation?: [number, number, number]; // x, y, z in degrees
  pivot?: [number, number, number]; // absolute pivot point
  uv?: [number, number]; // generic uv start
  color?: string; // Hex color for fallback/preview
  textureOffset?: [number, number]; // For standard MC mapping
}

export interface ModelAttachment {
    name: string;
    position: [number, number, number]; // Relative to bone
}

export interface ModelBone {
  name: string;
  parent?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  cubes: ModelCube[];
  // Hytale specific: Attachment points (Hotspots) relative to bone
  attachments?: ModelAttachment[]; 
}

// --- Bedrock / Entity Format ---
export interface BedrockModel {
  format_version: string;
  identifier: string;
  texture_size: [number, number];
  bones: ModelBone[];
}

// --- Animation Format ---
export type KeyframeValue = [number, number, number] | { post: [number, number, number], lerp_mode?: string };

export interface AnimationChannel {
    [timestamp: string]: KeyframeValue; 
}

export interface AnimationBoneData {
    rotation?: AnimationChannel;
    position?: AnimationChannel;
    scale?: AnimationChannel;
}

export interface AnimationDefinition {
    loop?: boolean;
    animation_length?: number; // in seconds
    bones?: Record<string, AnimationBoneData>;
}

// --- Java Block Format ---
export interface JavaBlockFace {
  uv?: [number, number, number, number]; // x1, y1, x2, y2
  texture: string; // "#name"
  cullface?: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
  rotation?: 0 | 90 | 180 | 270;
  tintindex?: number;
}

export interface JavaBlockElement {
  from: [number, number, number]; // 0-16 range usually
  to: [number, number, number];
  rotation?: {
    origin: [number, number, number];
    axis: 'x' | 'y' | 'z';
    angle: 45 | 22.5 | 0 | -22.5 | -45;
    rescale?: boolean;
  };
  faces?: {
    north?: JavaBlockFace;
    south?: JavaBlockFace;
    east?: JavaBlockFace;
    west?: JavaBlockFace;
    up?: JavaBlockFace;
    down?: JavaBlockFace;
  };
  color?: string; // Helper for viewer
}

export interface JavaBlockModel {
  parent?: string; // e.g., "block/cube_all"
  textures?: Record<string, string>;
  elements?: JavaBlockElement[];
  display?: Record<string, any>; // item display settings
}

export interface BlockStateVariant {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
}

export interface BlockStateMultipart {
  when?: Record<string, string | boolean>;
  apply: BlockStateVariant | BlockStateVariant[];
}

export interface JavaBlockState {
  variants?: Record<string, BlockStateVariant | BlockStateVariant[]>;
  multipart?: BlockStateMultipart[];
}

// --- Unified App Model State ---
export interface MinecraftModel {
  type: ModelType;
  loader: ModLoader;
  
  // Entity Data
  bedrockData?: BedrockModel;
  
  // Animation Data (New)
  animations?: Record<string, AnimationDefinition>;
  
  // Block Data
  javaBlockData?: JavaBlockModel;
  javaBlockState?: JavaBlockState;
  
  // Common Metadata
  identifier: string; // e.g. "modid:example_block"

  // Imported Source Data (Preserves original mesh for viewing)
  sourceBlobUrl?: string;
  sourceFormat?: 'gltf' | 'glb' | 'obj' | 'stl';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // Base64
  modelData?: MinecraftModel; // If the message generated a model
  isError?: boolean;
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  TEXTURE = 'TEXTURE',
  ANIMATE = 'ANIMATE',
  JSON = 'JSON'
}
