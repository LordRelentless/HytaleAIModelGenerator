import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import JSZip from 'jszip';
import { MinecraftModel, ModelCube, ModelBone, AnimationDefinition } from '../types';

const SCALE_FACTOR = 1 / 16; 

// --- Math Helpers ---

const degToRad = (deg: number) => deg * (Math.PI / 180);

const eulerToQuaternion = (x: number, y: number, z: number) => {
    const q = new THREE.Quaternion();
    // Bedrock rotation is typically degrees XYZ order
    q.setFromEuler(new THREE.Euler(degToRad(x), degToRad(y), degToRad(z), 'ZYX')); // Order might need tweaking based on exact Hytale convention, usually ZYX or XYZ
    return { x: q.x, y: q.y, z: q.z, w: q.w };
};

// --- Hytale Node Construction ---

interface HytaleNode {
    id: string;
    name: string;
    children: HytaleNode[];
    position: { x: number, y: number, z: number };
    orientation: { x: number, y: number, z: number, w: number };
    shape: any;
}

let nodeIdCounter = 0;
const generateId = () => (++nodeIdCounter).toString();

const getTextureLayout = (cube: ModelCube, textureWidth: number, textureHeight: number) => {
    const [u, v] = cube.uv || [0, 0];
    const [w, h, d] = cube.size;
    
    // Using standard mapping logic
    const rw = Math.ceil(w);
    const rh = Math.ceil(h);
    const rd = Math.ceil(d);

    // This mapping matches standard "Box" projection in Blockbench
    return {
        front: { offset: { x: u + rd, y: v + rd }, mirror: { x: false, y: false }, angle: 0 },
        back: { offset: { x: u + rd + rw + rd, y: v + rd }, mirror: { x: false, y: false }, angle: 0 },
        left: { offset: { x: u + rd + rw, y: v + rd }, mirror: { x: false, y: false }, angle: 0 },
        right: { offset: { x: u, y: v + rd }, mirror: { x: false, y: false }, angle: 0 },
        top: { offset: { x: u + rd, y: v }, mirror: { x: false, y: false }, angle: 0 },
        bottom: { offset: { x: u + rd + rw, y: v }, mirror: { x: false, y: false }, angle: 0 },
    };
};

const buildHytaleNodeTree = (
    bones: ModelBone[], 
    parentId: string | undefined, 
    parentPivot: [number, number, number],
    textureSize: [number, number]
): HytaleNode[] => {
    const nodes: HytaleNode[] = [];
    
    // Find all bones that belong to this parent
    const currentBones = bones.filter(b => 
        parentId ? b.parent === parentId : !b.parent
    );

    for (const bone of currentBones) {
        // 1. Bone Node
        const [px, py, pz] = bone.pivot || [0,0,0];
        const [ppx, ppy, ppz] = parentPivot;
        
        // Hytale Position is relative to parent pivot
        const relX = px - ppx;
        const relY = py - ppy;
        const relZ = pz - ppz;

        const [rx, ry, rz] = bone.rotation || [0, 0, 0];
        
        const boneNode: HytaleNode = {
            id: generateId(), 
            name: bone.name,
            children: [],
            position: { x: relX, y: relY, z: relZ },
            orientation: eulerToQuaternion(rx, ry, rz),
            shape: {
                type: "none",
                offset: { x: 0, y: 0, z: 0 },
                stretch: { x: 1, y: 1, z: 1 },
                settings: { isPiece: false },
                visible: true,
                doubleSided: false,
                shadingMode: "flat",
                unwrapMode: "custom",
                textureLayout: {}
            }
        };

        // 2. Add Cubes as Child Nodes
        if (bone.cubes && bone.cubes.length > 0) {
            bone.cubes.forEach((cube, idx) => {
                const [ox, oy, oz] = cube.origin;
                const [w, h, d] = cube.size;
                
                // Cube Center
                const cx = ox + w/2;
                const cy = oy + h/2;
                const cz = oz + d/2;
                
                // Relative to Bone Pivot
                const offX = cx - px;
                const offY = cy - py;
                const offZ = cz - pz;

                const [crx, cry, crz] = cube.rotation || [0,0,0];

                const cubeNode: HytaleNode = {
                    id: generateId(),
                    name: `${bone.name}_shape_${idx}`,
                    children: [],
                    position: { x: offX, y: offY, z: offZ }, 
                    orientation: eulerToQuaternion(crx, cry, crz),
                    shape: {
                        type: "box",
                        offset: { x: 0, y: 0, z: 0 }, 
                        stretch: { x: 1, y: 1, z: 1 },
                        settings: {
                            size: { x: w, y: h, z: d }
                        },
                        textureLayout: getTextureLayout(cube, textureSize[0], textureSize[1]),
                        unwrapMode: "custom",
                        visible: true,
                        doubleSided: false,
                        shadingMode: "flat"
                    }
                };
                boneNode.children.push(cubeNode);
            });
        }

        // 3. Add Attachments as Child Nodes
        if (bone.attachments) {
            bone.attachments.forEach(att => {
                let attName = "";
                let attPos: [number, number, number] = [0,0,0];

                if (typeof att === 'string') {
                    attName = att;
                } else if (att && typeof att === 'object') {
                    attName = att.name || "attachment";
                    attPos = att.position || [0,0,0];
                }

                const attNode: HytaleNode = {
                    id: generateId(),
                    name: attName,
                    children: [],
                    position: { x: attPos[0], y: attPos[1], z: attPos[2] },
                    orientation: { x: 0, y: 0, z: 0, w: 1 },
                    shape: {
                        type: "none",
                        offset: { x: 0, y: 0, z: 0 },
                        stretch: { x: 1, y: 1, z: 1 },
                        settings: { isPiece: true }, // Marker for attachment
                        visible: true,
                        doubleSided: false,
                        shadingMode: "flat",
                        unwrapMode: "custom",
                        textureLayout: {}
                    }
                };
                boneNode.children.push(attNode);
            });
        }

        // 4. Recursion
        const childrenNodes = buildHytaleNodeTree(bones, bone.name, bone.pivot || [0,0,0], textureSize);
        boneNode.children.push(...childrenNodes);

        nodes.push(boneNode);
    }

    return nodes;
};

// --- Export Functions ---

const downloadBlob = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }, 100);
};

export const exportHytaleModel = async (model: MinecraftModel, textureData?: string | null) => {
    if (!model.bedrockData) {
        alert("Model data is missing.");
        return;
    }

    const zip = new JSZip();
    const modelsFolder = zip.folder("models");
    const animationsFolder = zip.folder("animations");

    nodeIdCounter = 0; // Reset ID counter
    const filename = (model.identifier || "hytale_model").replace(/[:/]/g, '_');
    
    // Safety check for texture size
    const textureSize = model.bedrockData.texture_size || [64, 64];

    // --- 1. Model Geometry (.blockymodel) ---
    const rootNodes = buildHytaleNodeTree(
        model.bedrockData.bones, 
        undefined, 
        [0, 0, 0], 
        textureSize
    );

    const blockyModel = {
        nodes: rootNodes,
        lod: "auto"
    };

    modelsFolder?.file(`${filename}.blockymodel`, JSON.stringify(blockyModel, null, 2));

    // --- 2. Texture (.png) ---
    if (textureData) {
        // Assume textureData is a Base64 Data URL: "data:image/png;base64,..."
        const base64Data = textureData.replace(/^data:image\/(png|jpg);base64,/, "");
        modelsFolder?.file(`${filename}.png`, base64Data, { base64: true });
    }

    // --- 3. Animations (.blockyanim) ---
    if (model.animations && Object.keys(model.animations).length > 0) {
        Object.entries(model.animations).forEach(([animName, animDef]) => {
            const hytaleAnim: any = {
                duration: Math.ceil((animDef.animation_length || 1.0) * 20), // Convert seconds to ticks (approx 20 fps)
                holdLastKeyframe: !!animDef.loop,
                nodeAnimations: {},
                formatVersion: 1
            };

            if (animDef.bones) {
                Object.entries(animDef.bones).forEach(([boneName, boneData]) => {
                    const tracks: any = {};
                    
                    // Position
                    if (boneData.position) {
                        const frames = Object.entries(boneData.position).map(([timeStr, val]) => {
                            const time = parseFloat(timeStr);
                            const v = Array.isArray(val) ? val : (val as any).post;
                            return {
                                time: Math.ceil(time * 20), // Seconds to frames
                                delta: { x: v?.[0] || 0, y: v?.[1] || 0, z: v?.[2] || 0 },
                                interpolationType: "smooth"
                            };
                        });
                        tracks.position = frames;
                    } else {
                        tracks.position = [];
                    }

                    // Rotation/Orientation
                    if (boneData.rotation) {
                        const frames = Object.entries(boneData.rotation).map(([timeStr, val]) => {
                            const time = parseFloat(timeStr);
                            const v = Array.isArray(val) ? val : (val as any).post;
                            const q = eulerToQuaternion(v?.[0] || 0, v?.[1] || 0, v?.[2] || 0);
                            return {
                                time: Math.ceil(time * 20),
                                delta: { x: q.x, y: q.y, z: q.z, w: q.w },
                                interpolationType: "smooth"
                            };
                        });
                        tracks.orientation = frames;
                    } else {
                        tracks.orientation = [];
                    }
                    
                    // Defaults
                    tracks.shapeStretch = [];
                    tracks.shapeVisible = [];
                    tracks.shapeUvOffset = [];

                    hytaleAnim.nodeAnimations[boneName] = tracks;
                });
            }

            animationsFolder?.file(`${animName}.blockyanim`, JSON.stringify(hytaleAnim, null, 2));
        });
    }

    // --- 4. Generate Zip ---
    try {
        const content = await zip.generateAsync({ type: "blob" });
        downloadBlob(content, `${filename}.zip`);
    } catch (e) {
        console.error("Failed to generate zip", e);
        alert("Failed to package Hytale model.");
    }
};

const createModelScene = (model: MinecraftModel): THREE.Scene => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();

    if (model.bedrockData?.bones) {
        const buildBone = (bone: ModelBone, parentPivot: [number, number, number] = [0,0,0]): THREE.Object3D => {
            const boneGroup = new THREE.Group();
            
            const [px, py, pz] = bone.pivot || [0,0,0];
            const [ppx, ppy, ppz] = parentPivot;
            
            // Reconstruct position relative to parent pivot
            boneGroup.position.set(px - ppx, py - ppy, pz - ppz);
            if (bone.rotation) {
                boneGroup.rotation.set(
                    degToRad(bone.rotation[0]),
                    degToRad(bone.rotation[1]),
                    degToRad(bone.rotation[2])
                );
            }

            // Add Cubes
            bone.cubes.forEach(cube => {
                const geometry = new THREE.BoxGeometry(cube.size[0] * SCALE_FACTOR, cube.size[1] * SCALE_FACTOR, cube.size[2] * SCALE_FACTOR);
                const material = new THREE.MeshStandardMaterial({ color: cube.color || 0xffffff });
                const mesh = new THREE.Mesh(geometry, material);
                
                // Cube origin logic: (origin + size/2) - pivot
                const cx = (cube.origin[0] + cube.size[0]/2) - px;
                const cy = (cube.origin[1] + cube.size[1]/2) - py;
                const cz = (cube.origin[2] + cube.size[2]/2) - pz;
                
                mesh.position.set(cx * SCALE_FACTOR, cy * SCALE_FACTOR, cz * SCALE_FACTOR);
                
                if (cube.rotation) {
                     mesh.rotation.set(
                        degToRad(cube.rotation[0]),
                        degToRad(cube.rotation[1]),
                        degToRad(cube.rotation[2])
                    );
                }
                boneGroup.add(mesh);
            });

            // Children
            const children = model.bedrockData!.bones.filter(b => b.parent === bone.name);
            children.forEach(child => {
                boneGroup.add(buildBone(child, bone.pivot));
            });
            
            return boneGroup;
        };

        const roots = model.bedrockData.bones.filter(b => !b.parent);
        roots.forEach(root => {
            group.add(buildBone(root));
        });
    }

    if (model.type === 'BLOCK' && model.javaBlockData?.elements) {
        model.javaBlockData.elements.forEach(el => {
            const w = Math.abs(el.to[0] - el.from[0]);
            const h = Math.abs(el.to[1] - el.from[1]);
            const d = Math.abs(el.to[2] - el.from[2]);
            
            const geometry = new THREE.BoxGeometry(w * SCALE_FACTOR, h * SCALE_FACTOR, d * SCALE_FACTOR);
            const material = new THREE.MeshStandardMaterial({ color: el.color || 0xffffff });
            const mesh = new THREE.Mesh(geometry, material);

            let x = el.from[0] + w/2;
            let y = el.from[1] + h/2;
            let z = el.from[2] + d/2;

            if (el.rotation) {
                const origin = el.rotation.origin;
                const axis = el.rotation.axis;
                const angle = el.rotation.angle;
                
                const pivotGroup = new THREE.Group();
                pivotGroup.position.set(origin[0] * SCALE_FACTOR, origin[1] * SCALE_FACTOR, origin[2] * SCALE_FACTOR);
                
                mesh.position.set(
                    (x - origin[0]) * SCALE_FACTOR,
                    (y - origin[1]) * SCALE_FACTOR,
                    (z - origin[2]) * SCALE_FACTOR
                );
                
                if (axis === 'x') pivotGroup.rotation.x = degToRad(angle);
                if (axis === 'y') pivotGroup.rotation.y = degToRad(angle);
                if (axis === 'z') pivotGroup.rotation.z = degToRad(angle);
                
                pivotGroup.add(mesh);
                group.add(pivotGroup);
            } else {
                mesh.position.set(x * SCALE_FACTOR, y * SCALE_FACTOR, z * SCALE_FACTOR);
                group.add(mesh);
            }
        });
    }

    scene.add(group);
    return scene;
};

// Kept for internal Viewer use
export const exportGenericModel = async (model: MinecraftModel, format: 'gltf' | 'glb' | 'obj' | 'stl') => {
    const scene = createModelScene(model);
    const filename = (model.identifier || "model").replace(/[:/]/g, '_');

    switch (format) {
        case 'gltf':
        case 'glb': {
            const exporter = new GLTFExporter();
            exporter.parse(
                scene,
                (gltf) => {
                    if (format === 'glb') {
                        const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
                        downloadBlob(blob, `${filename}.glb`);
                    } else {
                        const output = JSON.stringify(gltf, null, 2);
                        const blob = new Blob([output], { type: 'text/plain' });
                        downloadBlob(blob, `${filename}.gltf`);
                    }
                },
                (error) => console.error('An error happened during GLTF export:', error),
                { binary: format === 'glb' }
            );
            break;
        }
        case 'obj': {
            const exporter = new OBJExporter();
            const result = exporter.parse(scene);
            const blob = new Blob([result], { type: 'text/plain' });
            downloadBlob(blob, `${filename}.obj`);
            break;
        }
    }
};

export const getExportFormats = () => {
    return [
        { label: "GLTF (.gltf)", value: "gltf", desc: "Standard web 3D format." },
        { label: "GLB (.glb)", value: "glb", desc: "Binary GLTF." },
        { label: "Wavefront (.obj)", value: "obj", desc: "Universal format." },
    ];
};