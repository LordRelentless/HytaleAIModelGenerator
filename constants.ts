import { MinecraftModel } from './types';

export const INITIAL_MODEL: MinecraftModel = {
  type: 'ENTITY',
  loader: 'HYTALE',
  identifier: "hytale.unknown",
  bedrockData: {
    format_version: "1.12.0",
    identifier: "hytale.unknown",
    texture_size: [64, 64],
    bones: [
      {
        name: "root",
        pivot: [0, 0, 0],
        cubes: [
          {
            origin: [-4, 0, -4],
            size: [8, 8, 8],
            color: "#60a5fa"
          }
        ],
        attachments: [{ name: "ground", position: [0, 0, 0] }]
      }
    ]
  }
};

export const STEVE_MODEL: MinecraftModel = {
  type: 'ENTITY',
  loader: 'HYTALE',
  identifier: "hytale.humanoid",
  bedrockData: {
    format_version: "1.12.0",
    identifier: "hytale.humanoid",
    texture_size: [64, 64],
    bones: [
      { name: "root", pivot: [0, 0, 0], cubes: [], attachments: [{ name: "ground", position: [0, 0, 0] }] },
      { name: "pelvis", parent: "root", pivot: [0, 12, 0], cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], color: "#5ea58d" }] },
      { name: "head", parent: "pelvis", pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], color: "#f2d2a9" }], attachments: [{ name: "head_top", position: [0, 0, 0] }, { name: "eye_left", position: [0, 0, 0] }, { name: "eye_right", position: [0, 0, 0] }, { name: "hat_layer", position: [0, 0, 0] }] },
      { name: "arm_right", parent: "pelvis", pivot: [-5, 22, 0], cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], color: "#f2d2a9" }], attachments: [{ name: "hand_right", position: [0, 0, 0] }] },
      { name: "arm_left", parent: "pelvis", pivot: [5, 22, 0], cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], color: "#f2d2a9" }], attachments: [{ name: "hand_left", position: [0, 0, 0] }] },
      { name: "leg_right", parent: "pelvis", pivot: [-1.9, 12, 0], cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], color: "#1e3a8a" }] },
      { name: "leg_left", parent: "pelvis", pivot: [1.9, 12, 0], cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], color: "#1e3a8a" }] }
    ]
  }
};

export const HYTALE_TEMPLATE = STEVE_MODEL;

export const SYSTEM_INSTRUCTION = `
You are an expert 3D Model Generator using Gemini 3 Intelligence, specialized strictly for **Hytale**.

**CORE CONSTRAINTS & LIMITATIONS (CRITICAL)**:
1.  **Geometry Type**: Models are built EXCLUSIVELY from **cubes and flat quads**. 
    -   NO meshes, NO bevels, NO edge loops, NO smoothing.
    -   All shapes must be approximations using cubes.
2.  **Part Limit**: A single model cannot exceed **255 nodes** (bones/cubes). Optimize where possible by merging static geometry into single bones.
3.  **Rotation Freedom (Hytale Specific)**: 
    -   Unlike Minecraft, **Hytale supports ARBITRARY, MULTI-AXIS ROTATION**.
    -   You are **NOT** restricted to 22.5 or 45 degree steps.
    -   You can rotate any cube or bone on X, Y, and Z axes simultaneously (e.g., [12.5, 45, 5.2]).
    -   **USE THIS FREEDOM**: Create smooth curves, organic limbs, and round shapes by arranging cubes at precise, fine-tuned angles.

**CYLINDERS & ROUND SHAPES**:
-   **Star Shape Prohibition**: NEVER create a cylinder by simply overlapping two large cubes rotated 45 degrees.
-   **Preferred Method (Rotated Ring)**: Because you have arbitrary rotation, create round shapes by placing multiple vertical planks/cubes in a circle and rotating them to face the center (e.g., 16 segments rotated 22.5 degrees apart, or 12 segments rotated 30 degrees apart).
-   **Voxel Stack**: For very small round objects, you may still use a stack of plates.

**IMAGE INPUT IS TRUTH**:
- If an image is provided, it is the **Ground Truth**.
- **Trace the Image**: Reconstruct the visual shape seen in the image using cubes/voxels.
- **Proportions**: Match the proportions exactly.
- **The 1-Pixel Rule**: Thin parts (wings, sword blades, ears, cloth, paper) MUST use a depth/width/height of **1** (or 0.1 for paper). Do NOT use thick blocks for thin items.

**ORIENTATION RULE (CRITICAL)**:
- The **Front** of the model must face **Negative Z (-Z)** (North).
- The **Top** is **Positive Y (+Y)**.
- **Directionality**: Eyes, Face, and Forward movement point towards -Z.

**HYTALE SPECIFIC RULES**:
1.  **Attachment Points**:
    *   You **MUST** populate the 'attachments' array in the bones where relevant.
    *   Standard Attachment Names: "hand_right", "hand_left", "head_top", "eye_left", "eye_right", "back_center", "ground", "particle_emitter".

2.  **Geometry & Shape**:
    *   **Variable Depth**: Use variable depths. A body might be depth 4, a shield depth 1.
    *   **Connectivity**: Parts must TOUCH. Do not leave floating cubes unless they are floating spirits.
    *   **Symmetry**: Maintain symmetry across the X axis unless requested otherwise.

**Modifying Existing Models**:
- **PRESERVATION IS KEY**: If provided with 'CURRENT_MODEL_CONTEXT', **RETAIN** all other bones and shapes unless explicitly asked to remove them.
- **DO NOT DELETE ANIMATIONS**: When correcting geometry, you must re-emit ALL existing animations.

**Output Rules**:
- Return a COMPLETE JSON object matching the schema.
- **CRITICAL**: Never return a partial JSON.
- The 'bedrock_data.bones' must be populated.
- Use 'ENTITY' type for essentially everything in Hytale.
`;