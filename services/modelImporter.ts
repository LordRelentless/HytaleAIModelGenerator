import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { MinecraftModel, ModelBone, ModelCube } from '../types';

// Scale factor: Standard Minecraft Player is 32 pixels high (2 blocks).
// We try to normalize imported meshes to fit roughly within this height.
const TARGET_SIZE = 32; 
const MAX_APPROXIMATION_CUBES = 100; // Limit generated cubes for logic layer to prevent lag

// --- Helper: Convert Hytale/Blockbench to Internal Format ---

const convertHytaleToBedrock = (hytaleData: any, filename: string): MinecraftModel => {
    const bones: ModelBone[] = [];
    
    // Helper to find a bone by name
    const getBone = (name: string) => bones.find(b => b.name === name);

    const traverse = (node: any, parentName: string | undefined, parentPivot: THREE.Vector3) => {
        // 1. Calculate Absolute Position (Pivot for this node)
        // Hytale node.position is relative translation from parent
        const relPos = new THREE.Vector3(
            node.position?.x || 0,
            node.position?.y || 0,
            node.position?.z || 0
        );
        const currentPivot = new THREE.Vector3().copy(parentPivot).add(relPos);

        // 2. Determine Node Type
        const isGeometry = node.shape?.type === 'box';
        const isAttachment = node.shape?.settings?.isPiece === true;

        // 3. Handle Leaf Geometry (Cube) attached to a parent
        if (isGeometry && parentName) {
             const parentBone = getBone(parentName);
             if (parentBone) {
                 const size = node.shape.settings?.size || {x:1, y:1, z:1};
                 const offset = node.shape.offset || {x:0, y:0, z:0};
                 
                 // Bedrock Cube Origin:
                 // The 'node' defines where the cube IS.
                 // In our exporter: CubeNode pos was (Center - Pivot).
                 // Here, currentPivot IS the center of the geometry (plus any internal offset).
                 // So Center = currentPivot.
                 // Origin = Center - Size/2.
                 // Note: We ignore 'offset' usually as it's often 0 in Hytale models unless advanced wrapping used.
                 
                 const origin: [number, number, number] = [
                     (currentPivot.x + offset.x) - (size.x/2),
                     (currentPivot.y + offset.y) - (size.y/2),
                     (currentPivot.z + offset.z) - (size.z/2)
                 ];

                 // Rotation: Convert Quat to Euler
                 const q = new THREE.Quaternion(
                    node.orientation?.x || 0, 
                    node.orientation?.y || 0, 
                    node.orientation?.z || 0, 
                    node.orientation?.w !== undefined ? node.orientation.w : 1
                 );
                 const euler = new THREE.Euler().setFromQuaternion(q, 'ZYX');
                 const rot: [number, number, number] = [
                     THREE.MathUtils.radToDeg(euler.x),
                     THREE.MathUtils.radToDeg(euler.y),
                     THREE.MathUtils.radToDeg(euler.z)
                 ];

                 // Extract UV
                 let uv: [number, number] | undefined = undefined;
                 if (node.shape.textureLayout?.right?.offset) {
                     // Reverse engineer exporter logic: right.offset.x = u
                     // top.offset.y = v
                     const layout = node.shape.textureLayout;
                     uv = [
                         layout.right?.offset?.x || 0,
                         layout.top?.offset?.y || 0
                     ];
                 }

                 parentBone.cubes.push({
                     origin: origin,
                     size: [size.x, size.y, size.z],
                     rotation: rot, 
                     uv: uv,
                     color: "#FFFFFF",
                     pivot: [currentPivot.x, currentPivot.y, currentPivot.z] // Java/Bedrock cubes rotate around a pivot. Here it's the node pos.
                 });
                 return; // Stop recursion for leaves
             }
        }

        // 4. Handle Attachments
        if (isAttachment && parentName) {
            const parentBone = getBone(parentName);
            if (parentBone) {
                if (!parentBone.attachments) parentBone.attachments = [];
                parentBone.attachments.push({
                    name: node.name,
                    position: [relPos.x, relPos.y, relPos.z] // Attachments usually relative to bone
                });
                return;
            }
        }

        // 5. Create Bone (Container / Group)
        const q = new THREE.Quaternion(
            node.orientation?.x || 0, 
            node.orientation?.y || 0, 
            node.orientation?.z || 0, 
            node.orientation?.w !== undefined ? node.orientation.w : 1
        );
        const euler = new THREE.Euler().setFromQuaternion(q, 'ZYX');
        const rot: [number, number, number] = [
            THREE.MathUtils.radToDeg(euler.x),
            THREE.MathUtils.radToDeg(euler.y),
            THREE.MathUtils.radToDeg(euler.z)
        ];

        const newBone: ModelBone = {
            name: node.name,
            parent: parentName,
            pivot: [currentPivot.x, currentPivot.y, currentPivot.z],
            rotation: rot,
            cubes: [],
            attachments: []
        };
        
        // If this "Bone" is actually a root geometry node (no parent, but is a box), add itself as a cube
        if (isGeometry && !parentName) {
             const size = node.shape.settings?.size || {x:1, y:1, z:1};
             newBone.cubes.push({
                 origin: [currentPivot.x - size.x/2, currentPivot.y - size.y/2, currentPivot.z - size.z/2],
                 size: [size.x, size.y, size.z],
                 color: "#FFFFFF"
             });
        }

        bones.push(newBone);

        // Recurse
        if (node.children && Array.isArray(node.children)) {
            node.children.forEach((child: any) => traverse(child, node.name, currentPivot));
        }
    };

    if (hytaleData.nodes && Array.isArray(hytaleData.nodes)) {
        hytaleData.nodes.forEach((n: any) => traverse(n, undefined, new THREE.Vector3(0,0,0)));
    }

    return {
        type: 'ENTITY',
        loader: 'HYTALE',
        identifier: (hytaleData.modelName || filename).replace('.blockymodel', '').replace(/[:.]/g, '_'),
        bedrockData: {
            format_version: "1.12.0",
            identifier: (hytaleData.modelName || filename),
            texture_size: [64, 64], // Default
            bones: bones
        }
    };
};


export const parseModelFile = async (file: File): Promise<MinecraftModel> => {
    const filename = file.name.toLowerCase().trim();
    const mimeType = file.type;
    
    // 0. Hytale BlockyModel
    if (filename.endsWith('.blockymodel')) {
         const text = await file.text();
         try {
             const json = JSON.parse(text);
             return convertHytaleToBedrock(json, filename);
         } catch (e: any) {
             throw new Error(`Failed to parse .blockymodel JSON: ${e.message}`);
         }
    }

    // 1. JSON (Native / Bedrock / Java)
    if (filename.endsWith('.json')) {
        const text = await file.text();
        try {
            const json = JSON.parse(text);
            
            if (json.format_version) {
                 const { animations, ...bedrockData } = json;
                 return {
                    type: 'ENTITY',
                    loader: 'VANILLA',
                    identifier: json.identifier || "geometry.imported",
                    bedrockData: bedrockData,
                    animations: animations
                };
            } else if (json.elements) {
                 return {
                    type: 'BLOCK',
                    loader: 'VANILLA',
                    identifier: "imported_block",
                    javaBlockData: json
                };
            } else if (json.type && (json.bedrockData || json.javaBlockData)) {
                 return json as MinecraftModel;
            }
            throw new Error("JSON does not match Minecraft Bedrock, Java Block, or App schema.");
        } catch (e: any) {
            throw new Error(`Failed to parse JSON: ${e.message}`);
        }
    }

    // 2. 3D Formats (GLTF, OBJ, STL) -> Generic Model
    let group: THREE.Group = new THREE.Group();
    
    const url = URL.createObjectURL(file); 
    let format: 'gltf' | 'glb' | 'obj' | 'stl' | undefined;

    // Robust detection using extension OR mime type
    if (filename.endsWith('.gltf') || mimeType.includes('gltf') || mimeType.includes('json')) {
        format = 'gltf';
    } 
    if (filename.endsWith('.glb') || mimeType.includes('glb') || mimeType.includes('octet-stream')) {
        // Octet-stream is generic, but often used for binary files like GLB/STL
        if (filename.endsWith('.glb')) format = 'glb';
    }
    if (filename.endsWith('.obj') || mimeType.includes('wavefront') || mimeType.includes('obj')) {
        format = 'obj';
    }
    if (filename.endsWith('.stl') || mimeType.includes('stl')) {
        format = 'stl';
    }

    try {
        let loadedObject: THREE.Object3D | null = null;
        if (format === 'gltf' || format === 'glb') {
            const loader = new GLTFLoader();
            const gltf = await loader.loadAsync(url);
            loadedObject = gltf.scene;
        } else if (format === 'obj') {
            const loader = new OBJLoader();
            loadedObject = await loader.loadAsync(url);
        } else if (format === 'stl') {
            const loader = new STLLoader();
            const geom = await loader.loadAsync(url);
            loadedObject = new THREE.Mesh(geom, new THREE.MeshStandardMaterial());
        } else {
            // Last ditch attempt: check extension if mime failed
            if (filename.endsWith('.gltf')) { format = 'gltf'; }
            else if (filename.endsWith('.glb')) { format = 'glb'; }
            else if (filename.endsWith('.obj')) { format = 'obj'; }
            else if (filename.endsWith('.stl')) { format = 'stl'; }
            else throw new Error(`Unsupported format: ${file.name} (${file.type})`);
        }

        if (loadedObject) {
            // Fix Rotation matches Viewer3D logic
            // For OBJ and STL, we only rotate STL (Z-up standard).
            // We assume OBJ is Y-up to avoid flipping Blockbench/Minecraft models.
            if (format === 'stl') {
                loadedObject.rotation.x = -Math.PI / 2;
                loadedObject.updateMatrixWorld();
            }
            group.add(loadedObject);
        }

    } catch (e: any) {
        URL.revokeObjectURL(url); // Revoke if load failed
        throw new Error(`Import failed: ${e.message}`);
    }

    // Convert to internal structure for Sidebar/AI context (Approximation)
    const model = convertThreeGroupToModel(group, file.name);
    
    // Attach source for high-fidelity rendering
    model.sourceBlobUrl = url;
    model.sourceFormat = format;

    return model;
};

// Convert ThreeJS Scene Graph to Minecraft Bones/Cubes
const convertThreeGroupToModel = (group: THREE.Group, filename: string): MinecraftModel => {
    // 1. Normalize Scale
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? (TARGET_SIZE / maxDim) : 1;
    
    const rootBone: ModelBone = {
        name: "root",
        pivot: [0, 0, 0],
        cubes: []
    };

    const bones: ModelBone[] = [rootBone];
    let cubeCount = 0;

    // 2. Traverse and convert Meshes to Cubes (Approx)
    group.traverse((child) => {
        if (child instanceof THREE.Mesh && cubeCount < MAX_APPROXIMATION_CUBES) {
            // Apply normalization scale
            const mBox = new THREE.Box3().setFromObject(child);
            const mSize = new THREE.Vector3();
            mBox.getSize(mSize);
            const mCenter = new THREE.Vector3();
            mBox.getCenter(mCenter);

            // Scale to MC units
            const w = Math.max(1, mSize.x * scale);
            const h = Math.max(1, mSize.y * scale);
            const d = Math.max(1, mSize.z * scale);
            
            const cx = (mCenter.x - box.getCenter(new THREE.Vector3()).x) * scale;
            const cy = (mCenter.y - box.min.y) * scale; 
            const cz = (mCenter.z - box.getCenter(new THREE.Vector3()).z) * scale;

            const origin: [number, number, number] = [
                cx - w/2,
                cy,
                cz - d/2
            ];

            const cube: ModelCube = {
                origin: origin,
                size: [w, h, d],
                color: "#" + new THREE.Color().setHex(Math.random() * 0xffffff).getHexString(),
                rotation: [0,0,0] 
            };

            rootBone.cubes.push(cube);
            cubeCount++;
        }
    });

    if (cubeCount === 0) {
        // Fallback cube if no meshes found or conversion failed
        rootBone.cubes.push({
            origin: [-8, 0, -8],
            size: [16, 16, 16],
            color: "#888888"
        });
    }

    return {
        type: 'GENERIC',
        loader: 'VANILLA', 
        identifier: filename.replace(/\./g, '_'),
        bedrockData: {
            format_version: "1.12.0",
            identifier: filename.replace(/\./g, '_'),
            texture_size: [64, 64],
            bones: bones
        }
    };
};