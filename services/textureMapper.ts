import { MinecraftModel, ModelCube } from '../types';

// Constants for packing
const PADDING = 2; // Increase padding to prevent bleed
const MIN_TEXTURE_SIZE = 64;

interface BoxPackerItem {
    id: string; // boneIndex_cubeIndex
    w: number;
    h: number;
    cubeRef: ModelCube;
}

// Pixel Density: 
// 1 = 16px/unit (Standard)
// 2 = 32px/unit (Prop)
// 4 = 64px/unit (Avatar)
const getBoxUVSize = (cube: ModelCube, densityScale: number): { w: number, h: number } => {
    const [w, h, d] = cube.size;
    const rw = Math.ceil(w * densityScale);
    const rh = Math.ceil(h * densityScale);
    const rd = Math.ceil(d * densityScale);
    
    // Standard Box UV footprint
    return {
        w: 2 * (rw + rd),
        h: rd + rh
    };
};

export const packUVs = (model: MinecraftModel, density: '16x' | '32x' | '64x' = '16x'): MinecraftModel => {
    if (model.type !== 'ENTITY' || !model.bedrockData?.bones) return model;

    let densityScale = 1;
    if (density === '32x') densityScale = 2;
    if (density === '64x') densityScale = 4;

    const items: BoxPackerItem[] = [];

    // 1. Collect all cubes
    model.bedrockData.bones.forEach((bone, bIdx) => {
        bone.cubes.forEach((cube, cIdx) => {
            const size = getBoxUVSize(cube, densityScale);
            items.push({
                id: `${bIdx}_${cIdx}`,
                w: size.w,
                h: size.h,
                cubeRef: cube
            });
        });
    });

    // 2. Sort by height (descending) for simple shelf packing
    items.sort((a, b) => b.h - a.h);

    // 3. Simple Shelf Packing
    const totalArea = items.reduce((acc, item) => acc + (item.w * item.h), 0);
    
    // Estimate side length, then find next power of 2
    let dim = MIN_TEXTURE_SIZE;
    while ((dim * dim) < totalArea * 1.5) { 
        dim *= 2;
    }

    let textureW = dim;
    let textureH = dim;
    
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;

    items.forEach(item => {
        if (currentX + item.w > textureW) {
            // New Row
            currentX = 0;
            currentY += rowHeight + PADDING;
            rowHeight = 0;
        }

        // Check vertical overflow
        if (currentY + item.h > textureH) {
             textureH *= 2;
        }

        // Assign UV
        item.cubeRef.uv = [currentX, currentY];
        
        // Update cursors
        currentX += item.w + PADDING;
        rowHeight = Math.max(rowHeight, item.h);
    });

    // Enforce Square if possible, or power of two
    if (textureH > textureW) textureW = textureH;
    if (textureW > textureH) textureH = textureW;

    // Update Model Metadata
    const newModel = JSON.parse(JSON.stringify(model));
    newModel.bedrockData.texture_size = [textureW, textureH];
    
    // Re-apply UVs to the new model structure
    items.forEach(item => {
        const [bIdx, cIdx] = item.id.split('_').map(Number);
        newModel.bedrockData.bones[bIdx].cubes[cIdx].uv = item.cubeRef.uv;
    });

    return newModel;
};

// Scales the UVs of a model to match a new texture resolution
export const scaleModelUVs = (model: MinecraftModel, newWidth: number, newHeight: number): MinecraftModel => {
    if (!model.bedrockData) return model;
    
    const [oldW, oldH] = model.bedrockData.texture_size || [MIN_TEXTURE_SIZE, MIN_TEXTURE_SIZE];
    
    // If dimensions match, do nothing
    if (oldW === newWidth && oldH === newHeight) return model;

    const scaleX = newWidth / oldW;
    const scaleY = newHeight / oldH;

    const newModel = JSON.parse(JSON.stringify(model));
    newModel.bedrockData.texture_size = [newWidth, newHeight];

    newModel.bedrockData.bones.forEach((bone: any) => {
        bone.cubes.forEach((cube: any) => {
            if (cube.uv) {
                cube.uv = [
                    Math.round(cube.uv[0] * scaleX),
                    Math.round(cube.uv[1] * scaleY)
                ];
            }
        });
    });

    return newModel;
};


export const drawTextureLayout = (model: MinecraftModel, density: '16x' | '32x' | '64x' = '16x'): string => {
    if (model.type !== 'ENTITY' || !model.bedrockData) return "";

    const [texW, texH] = model.bedrockData.texture_size || [MIN_TEXTURE_SIZE, MIN_TEXTURE_SIZE];
    
    const canvas = document.createElement('canvas');
    canvas.width = texW;
    canvas.height = texH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return "";

    // 1. Solid White Background (Critical for AI to see contrast)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, texW, texH);

    let scale = 1;
    if (density === '32x') scale = 2;
    if (density === '64x') scale = 4;

    model.bedrockData.bones.forEach((bone, bIdx) => {
        bone.cubes.forEach((cube) => {
            if (!cube.uv) return;
            const [u, v] = cube.uv;
            
            const [cw, ch, cd] = cube.size;
            
            // Calculate pixel dimensions based on density scale
            const w_px = Math.ceil(cw * scale);
            const h_px = Math.ceil(ch * scale);
            const d_px = Math.ceil(cd * scale);

            ctx.lineWidth = 1;
            ctx.strokeStyle = '#000000'; // Sharp black lines
            
            const drawRect = (x: number, y: number, w: number, h: number, color: string, label: string) => {
                // Fill with distinct colors to help AI distinguish faces
                ctx.fillStyle = color;
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
            };

            // Distinct pastel colors for faces to help AI understand volume
            // Top/Bottom (Y) = Red/Pink
            // Sides (X) = Blue/Cyan
            // Front/Back (Z) = Green/Lime
            
            // Faces - Standard Box UV Layout
            
            // Top: [u+d, v] w x d
            drawRect(u + d_px, v, w_px, d_px, '#ffcccc', 'T'); 
            
            // Bottom: [u+d+w, v] w x d
            drawRect(u + d_px + w_px, v, w_px, d_px, '#cc0000', 'B'); 
            
            // Right: [u, v+d] d x h
            drawRect(u, v + d_px, d_px, h_px, '#ccccff', 'R'); 
            
            // Front: [u+d, v+d] w x h
            drawRect(u + d_px, v + d_px, w_px, h_px, '#ccffcc', 'F'); 
            
            // Left: [u+d+w, v+d] d x h
            drawRect(u + d_px + w_px, v + d_px, d_px, h_px, '#0000cc', 'L'); 
            
            // Back: [u+d+w+d, v+d] w x h
            drawRect(u + d_px + w_px + d_px, v + d_px, w_px, h_px, '#00cc00', 'Bk'); 
        });
    });

    return canvas.toDataURL('image/png');
};