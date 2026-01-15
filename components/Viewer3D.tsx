import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, GizmoHelper, GizmoViewport, Center } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { MinecraftModel, ModelBone, ModelCube, JavaBlockModel, JavaBlockElement, AnimationDefinition } from '../types';
import * as THREE from 'three';

// Fix for strict TypeScript environments where JSX.IntrinsicElements is not automatically augmented by R3F
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      meshStandardMaterial: any;
      primitive: any;
      ambientLight: any;
      pointLight: any;
      directionalLight: any;
      lineSegments: any;
      edgesGeometry: any;
      lineBasicMaterial: any;
      // HTML Elements
      div: any;
      span: any;
      button: any;
      input: any;
      label: any;
      select: any;
      option: any;
      textarea: any;
      img: any;
      p: any;
      h1: any;
      h2: any;
      h3: any;
      form: any;
      pre: any;
    }
  }
}

interface ViewerProps {
  model: MinecraftModel;
  textureData?: string | null;
  activeAnimationName?: string;
  isPlaying?: boolean;
  playbackSpeed?: number;
  captureRef?: React.MutableRefObject<(() => string) | null>;
  uvScale?: number; // Exact scale factor (e.g. 16, 32, 64)
}

const SCALE_FACTOR = 1 / 16; 

// --- Screenshot Manager ---
// Allows the parent component to request a snapshot of the current WebGL canvas
const ScreenshotManager: React.FC<{ captureRef?: React.MutableRefObject<(() => string) | null> }> = ({ captureRef }) => {
    const { gl, scene, camera } = useThree();
    
    useEffect(() => {
        if (captureRef) {
            captureRef.current = () => {
                // Render immediately to ensure buffer is fresh
                gl.render(scene, camera);
                return gl.domElement.toDataURL('image/png');
            };
        }
    }, [gl, scene, camera, captureRef]);

    return null;
};

// --- Adapters ---

const javaElementToCube = (el: JavaBlockElement): ModelCube => {
    const w = Math.abs(el.to[0] - el.from[0]);
    const h = Math.abs(el.to[1] - el.from[1]);
    const d = Math.abs(el.to[2] - el.from[2]);
    return {
        origin: el.from,
        size: [w, h, d],
        color: el.color || "#888888",
        rotation: el.rotation ? [
            el.rotation.axis === 'x' ? el.rotation.angle : 0,
            el.rotation.axis === 'y' ? el.rotation.angle : 0,
            el.rotation.axis === 'z' ? el.rotation.angle : 0
        ] : undefined,
        pivot: el.rotation?.origin 
    };
};

// --- Interpolation Logic ---
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const getInterpolatedValue = (channel: any, time: number): [number, number, number] => {
    const keyframes = Object.keys(channel).map(key => ({
        time: parseFloat(key),
        data: channel[key]
    })).sort((a, b) => a.time - b.time);

    if (keyframes.length === 0) return [0, 0, 0];
    
    let prev = keyframes[0];
    let next = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length; i++) {
        if (keyframes[i].time <= time) {
            prev = keyframes[i];
        } else {
            next = keyframes[i];
            break;
        }
    }

    const prevVal = prev.data;
    const nextVal = next.data;

    if (!prevVal || !nextVal) return [0, 0, 0];

    const pV = Array.isArray(prevVal) ? prevVal : (prevVal.post || [0,0,0]);
    const nV = Array.isArray(nextVal) ? nextVal : (nextVal.post || [0,0,0]);

    if (prev.time === next.time) return pV as [number, number, number];

    const factor = (time - prev.time) / (next.time - prev.time);
    
    return [
        lerp(pV[0], nV[0], factor),
        lerp(pV[1], nV[1], factor),
        lerp(pV[2], nV[2], factor)
    ];
};

// --- Components ---

const ExternalModelRenderer: React.FC<{ url: string, format: string }> = ({ url, format }) => {
    const [scene, setScene] = useState<THREE.Object3D | null>(null);

    useEffect(() => {
        const load = async () => {
            let loadedObject: THREE.Object3D | null = null;
            try {
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
                    loadedObject = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xcccccc }));
                }
                
                if (loadedObject) {
                    if (format === 'stl') {
                         loadedObject.rotation.x = -Math.PI / 2;
                         loadedObject.updateMatrixWorld();
                    }

                    const box = new THREE.Box3().setFromObject(loadedObject);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const targetScale = maxDim > 0 ? (32 / maxDim) : 1; 
                    
                    loadedObject.scale.setScalar(targetScale * SCALE_FACTOR);
                    
                    box.setFromObject(loadedObject); 
                    const center = new THREE.Vector3();
                    box.getCenter(center);
                    loadedObject.position.sub(center); 
                    loadedObject.position.y += (box.max.y - box.min.y) / 2; 
                }

                setScene(loadedObject);
            } catch (e) {
                console.error("Failed to load external model", e);
            }
        };
        load();
    }, [url, format]);

    if (!scene) return null;
    return <primitive object={scene} />;
};

const CustomBoxMesh: React.FC<{
    cube: ModelCube;
    pivot: [number, number, number];
    textureMap: THREE.Texture | null;
    textureSize: [number, number];
    isJavaBlock?: boolean;
    uvScale: number;
}> = ({ cube, pivot, textureMap, textureSize, isJavaBlock, uvScale = 1 }) => {
    const [ox, oy, oz] = cube.origin;
    const [w, h, d] = cube.size;
    const [px, py, pz] = pivot;
    const [texW, texH] = textureSize;
    
    let x, y, z;

    if (isJavaBlock) {
        x = ox + w / 2;
        y = oy + h / 2;
        z = oz + d / 2;
        if (cube.pivot) {
           x -= cube.pivot[0];
           y -= cube.pivot[1];
           z -= cube.pivot[2];
        }
    } else {
        x = (ox + w / 2) - px;
        y = (oy + h / 2) - py;
        z = (oz + d / 2) - pz;
    }

    const geometry = useMemo(() => {
        const geo = new THREE.BoxGeometry(w * SCALE_FACTOR, h * SCALE_FACTOR, d * SCALE_FACTOR);
        
        if (textureMap && cube.uv) {
             const [u, v] = cube.uv;
             const ru = Math.floor(u);
             const rv = Math.floor(v);
             
             // Scale geometric dimensions to texture pixels based on precise scale factor
             const rw = Math.ceil(w * uvScale);
             const rh = Math.ceil(h * uvScale);
             const rd = Math.ceil(d * uvScale);

             const n = (val: number, total: number) => val / total;
             const nv = (val: number) => 1 - (val / texH);
             
             const uvAttribute = geo.attributes.uv;
             
             const setFaceUV = (faceIdx: number, uStart: number, vStart: number, width: number, height: number) => {
                 const offset = faceIdx * 4;
                 const u0 = n(uStart, texW);
                 const u1 = n(uStart + width, texW);
                 const v0 = nv(vStart);
                 const v1 = nv(vStart + height); 

                 uvAttribute.setXY(offset + 0, u0, v0);
                 uvAttribute.setXY(offset + 1, u1, v0);
                 uvAttribute.setXY(offset + 2, u0, v1);
                 uvAttribute.setXY(offset + 3, u1, v1);
             };

             // Using Standard Box UV Mapping logic with scaled dimensions
             setFaceUV(0, ru, rv + rd, rd, rh); // Side 1 (Right)
             setFaceUV(1, ru + rd + rw, rv + rd, rd, rh); // Side 2 (Left)
             setFaceUV(2, ru + rd, rv, rw, rd); // Top
             setFaceUV(3, ru + rd + rw, rv, rw, rd); // Bottom
             setFaceUV(4, ru + rd, rv + rd, rw, rh); // Front
             setFaceUV(5, ru + rd + rw + rd, rv + rd, rw, rh); // Back

             uvAttribute.needsUpdate = true;
        }

        return geo;
    }, [cube, w, h, d, texW, texH, textureMap, uvScale]);

    return (
        <group position={[x * SCALE_FACTOR, y * SCALE_FACTOR, z * SCALE_FACTOR]}>
            <group rotation={cube.rotation ? [
                THREE.MathUtils.degToRad(cube.rotation[0] || 0),
                THREE.MathUtils.degToRad(cube.rotation[1] || 0),
                THREE.MathUtils.degToRad(cube.rotation[2] || 0)
            ] : [0,0,0]}>
                <mesh geometry={geometry} castShadow receiveShadow>
                    <meshStandardMaterial 
                        color={textureMap ? "#ffffff" : (cube.color || "#ffffff")} 
                        map={textureMap}
                        roughness={0.8}
                        metalness={0.1}
                        transparent={true} 
                        side={THREE.DoubleSide} 
                    />
                    {!textureMap && (
                        <lineSegments>
                            <edgesGeometry args={[new THREE.BoxGeometry(w * SCALE_FACTOR, h * SCALE_FACTOR, d * SCALE_FACTOR)]} />
                            <lineBasicMaterial color="#000000" opacity={0.15} transparent />
                        </lineSegments>
                    )}
                </mesh>
            </group>
        </group>
    );
};

const BoneNode: React.FC<{
    bone: ModelBone;
    allBones: ModelBone[];
    textureMap: THREE.Texture | null;
    textureSize: [number, number];
    animation?: AnimationDefinition;
    time: number;
    parentPivot?: [number, number, number];
    uvScale: number;
}> = ({ bone, allBones, textureMap, textureSize, animation, time, parentPivot = [0,0,0], uvScale }) => {
    
    const animData = animation?.bones?.[bone.name];
    let animRot = [0, 0, 0];
    let animPos = [0, 0, 0];

    if (animData) {
        if (animData.rotation) animRot = getInterpolatedValue(animData.rotation, time);
        if (animData.position) animPos = getInterpolatedValue(animData.position, time);
    }

    const [px, py, pz] = bone.pivot;
    const [ppx, ppy, ppz] = parentPivot; 

    const relX = px - ppx;
    const relY = py - ppy;
    const relZ = pz - ppz;

    const baseRot = bone.rotation || [0, 0, 0];

    const finalRot = [
        THREE.MathUtils.degToRad(baseRot[0] + animRot[0]),
        THREE.MathUtils.degToRad(baseRot[1] + animRot[1]),
        THREE.MathUtils.degToRad(baseRot[2] + animRot[2])
    ] as [number, number, number];

    const finalPos = [
        (relX + animPos[0]) * SCALE_FACTOR,
        (relY + animPos[1]) * SCALE_FACTOR,
        (relZ + animPos[2]) * SCALE_FACTOR
    ] as [number, number, number];

    const children = allBones.filter(b => b.parent === bone.name);

    return (
        <group position={finalPos} rotation={finalRot}>
            {bone.cubes.map((cube, idx) => (
                <CustomBoxMesh 
                    key={idx} 
                    cube={cube} 
                    pivot={bone.pivot} 
                    textureMap={textureMap} 
                    textureSize={textureSize}
                    uvScale={uvScale}
                />
            ))}
            
            {children.map((child, idx) => (
                <BoneNode 
                    key={idx} 
                    bone={child} 
                    allBones={allBones} 
                    textureMap={textureMap} 
                    textureSize={textureSize}
                    animation={animation}
                    time={time}
                    parentPivot={bone.pivot}
                    uvScale={uvScale}
                />
            ))}
        </group>
    );
};


const EntityRenderer: React.FC<{
    model: MinecraftModel;
    textureMap: THREE.Texture | null;
    activeAnimationName?: string;
    isPlaying: boolean;
    playbackSpeed: number;
    uvScale: number;
}> = ({ model, textureMap, activeAnimationName, isPlaying, playbackSpeed, uvScale }) => {
    const [time, setTime] = useState(0);

    const animation = useMemo(() => {
        if (!activeAnimationName || !model.animations) return undefined;
        return model.animations[activeAnimationName];
    }, [model, activeAnimationName]);

    useFrame((state, delta) => {
        if (isPlaying && animation) {
            const duration = animation.animation_length || 1.0;
            setTime(prev => (prev + delta * playbackSpeed) % duration);
        }
    });

    useEffect(() => { setTime(0); }, [activeAnimationName]);

    if (!model.bedrockData?.bones) return null;

    const rootBones = model.bedrockData.bones.filter(b => !b.parent || !model.bedrockData!.bones.find(p => p.name === b.parent));
    const textureSize = model.bedrockData.texture_size || [64, 64];

    return (
        <group>
            {rootBones.map((bone, idx) => (
                <BoneNode 
                    key={idx} 
                    bone={bone} 
                    allBones={model.bedrockData!.bones} 
                    textureMap={textureMap} 
                    textureSize={textureSize as [number, number]}
                    animation={animation}
                    time={time}
                    uvScale={uvScale}
                />
            ))}
        </group>
    );
};

const JavaBlockGroup: React.FC<{
    data: JavaBlockModel;
    textureMap: THREE.Texture | null;
    uvScale: number;
}> = ({ data, textureMap, uvScale }) => {
    return (
        <group>
            {data.elements?.map((el, idx) => {
                const cube = javaElementToCube(el);
                if (cube.pivot) {
                     return (
                         <group 
                            key={idx} 
                            position={[cube.pivot[0]*SCALE_FACTOR, cube.pivot[1]*SCALE_FACTOR, cube.pivot[2]*SCALE_FACTOR]}
                         >
                            <CustomBoxMesh 
                                cube={cube} 
                                pivot={cube.pivot} 
                                textureMap={textureMap} 
                                textureSize={[64, 64]} 
                                isJavaBlock={true}
                                uvScale={uvScale}
                            />
                         </group>
                     );
                } else {
                     return (
                         <group key={idx} position={[0,0,0]}>
                             <CustomBoxMesh 
                                cube={cube} 
                                pivot={[0,0,0]} 
                                textureMap={textureMap} 
                                textureSize={[64, 64]}
                                isJavaBlock={true} 
                                uvScale={uvScale}
                            />
                         </group>
                     );
                }
            })}
        </group>
    );
};

const Viewer3D: React.FC<ViewerProps> = ({ model, textureData, activeAnimationName, isPlaying = false, playbackSpeed = 1, captureRef, uvScale = 1 }) => {
  const [textureMap, setTextureMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (textureData) {
        const loader = new THREE.TextureLoader();
        loader.load(textureData, (tex) => {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            setTextureMap(tex);
        });
    } else {
        setTextureMap(null);
    }
  }, [textureData]);

  return (
    <div className="w-full h-full bg-[#1e1e1e] relative overflow-hidden rounded-xl border border-gray-700 shadow-2xl">
      <Canvas shadows gl={{ preserveDrawingBuffer: true }}>
        <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.5} />
        
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={0.8} castShadow />
        <directionalLight position={[0, 10, 5]} intensity={1} castShadow />

        <ScreenshotManager captureRef={captureRef} />

        <Center disableY>
          {model.sourceBlobUrl && model.sourceFormat ? (
              <ExternalModelRenderer url={model.sourceBlobUrl} format={model.sourceFormat} />
          ) : (
              <>
                {(model.type === 'ENTITY' || model.type === 'GENERIC') && (
                    <EntityRenderer 
                        model={model} 
                        textureMap={textureMap} 
                        activeAnimationName={activeAnimationName}
                        isPlaying={isPlaying}
                        playbackSpeed={playbackSpeed}
                        uvScale={uvScale}
                    />
                )}

                {model.type === 'BLOCK' && model.javaBlockData && (
                    <JavaBlockGroup data={model.javaBlockData} textureMap={textureMap} uvScale={uvScale} />
                )}
              </>
          )}
        </Center>

        <Grid 
            infiniteGrid 
            fadeDistance={20} 
            cellColor="#444" 
            sectionColor="#666" 
            cellSize={1} 
            sectionSize={1}
            position={[0, -0.01, 0]} 
        />
        
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={['#9d4b4b', '#2f7f4f', '#3b5b9d']} labelColor="white" />
        </GizmoHelper>
      </Canvas>
      
      <div className="absolute top-4 left-4 pointer-events-none">
          <div className="bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm flex flex-col gap-1">
             <span>Mode: {model.type}</span>
             <span>ID: {model.identifier}</span>
             {model.sourceBlobUrl && (
                 <span className="text-yellow-400">Import: {model.sourceFormat?.toUpperCase()}</span>
             )}
             {activeAnimationName && !model.sourceBlobUrl && (
                 <span className="text-green-400">Anim: {activeAnimationName}</span>
             )}
          </div>
      </div>
    </div>
  );
};

export default Viewer3D;