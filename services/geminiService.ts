import { GoogleGenAI, Type } from "@google/genai";
import { MinecraftModel, ModelType, ModLoader, JavaBlockState, AnimationDefinition } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// Helper to validate/clean API key
const getApiKey = () => {
  const key = process.env.API_KEY;
  if (!key) throw new Error("API Key is missing");
  return key;
};

// --- Helpers to transform Array KV pairs back to Objects ---

const arrayToMap = (arr: any[], keyProp: string, valProp: string) => {
    if (!arr || !Array.isArray(arr)) return undefined;
    return arr.reduce((acc, curr) => {
        acc[curr[keyProp]] = curr[valProp];
        return acc;
    }, {} as Record<string, any>);
};

const arrayToVariantMap = (arr: any[]) => {
    if (!arr || !Array.isArray(arr)) return undefined;
    return arr.reduce((acc, curr) => {
        acc[curr.name] = curr.data;
        return acc;
    }, {} as Record<string, any>);
};

// --- Helper to transform Objects to Arrays (Context Prep) ---

const animationsMapToList = (animations?: Record<string, AnimationDefinition>) => {
    if (!animations) return undefined;
    return {
        list: Object.entries(animations).map(([name, def]) => {
            const bonesList = def.bones ? Object.entries(def.bones).map(([boneName, data]) => {
                const rotationList = data.rotation ? Object.entries(data.rotation).map(([t, v]) => ({ time: t, value: v })) : undefined;
                const positionList = data.position ? Object.entries(data.position).map(([t, v]) => ({ time: t, value: v })) : undefined;
                return {
                    bone_name: boneName,
                    rotation: rotationList,
                    position: positionList
                };
            }) : [];
            return {
                name,
                loop: def.loop,
                animation_length: def.animation_length,
                bones: bonesList
            };
        })
    };
};

// --- Schema Definitions ---

const BEDROCK_DATA_SCHEMA = {
  type: Type.OBJECT,
  nullable: true,
  properties: {
    format_version: { type: Type.STRING },
    identifier: { type: Type.STRING },
    texture_size: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    bones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          parent: { type: Type.STRING, nullable: true },
          pivot: { 
              type: Type.ARRAY, 
              items: { type: Type.NUMBER },
              description: "Absolute pivot point [x, y, z] for rotation."
          },
          rotation: { 
              type: Type.ARRAY, 
              items: { type: Type.NUMBER }, 
              nullable: true,
              description: "[x, y, z] rotation in DEGREES. X=Pitch, Y=Yaw, Z=Roll."
          },
          attachments: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              nullable: true,
              description: "Hytale/Engine Attachment Points (e.g., 'hand_right', 'head_top')"
          },
          cubes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                origin: { 
                    type: Type.ARRAY, 
                    items: { type: Type.NUMBER },
                    description: "Min corner [x, y, z]"
                },
                size: { 
                    type: Type.ARRAY, 
                    items: { type: Type.NUMBER },
                    description: "[width, height, depth]"
                },
                color: { type: Type.STRING },
                rotation: { 
                    type: Type.ARRAY, 
                    items: { type: Type.NUMBER }, 
                    nullable: true,
                    description: "Cube-specific rotation [x, y, z] in degrees"
                }
              },
              required: ["origin", "size", "color"]
            }
          }
        },
        required: ["name", "pivot", "cubes"]
      }
    }
  },
  required: ["identifier", "bones"]
};

const ANIMATIONS_SCHEMA = {
    type: Type.OBJECT,
    nullable: true,
    properties: {
        list: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING }, // "animation.model.walk"
                    loop: { type: Type.BOOLEAN },
                    animation_length: { type: Type.NUMBER },
                    bones: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                bone_name: { type: Type.STRING },
                                rotation: { 
                                    type: Type.ARRAY, 
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            time: { type: Type.STRING }, // "0.0"
                                            value: { type: Type.ARRAY, items: { type: Type.NUMBER } } // [x,y,z]
                                        },
                                        required: ["time", "value"]
                                    }
                                },
                                position: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            time: { type: Type.STRING },
                                            value: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                                        },
                                        required: ["time", "value"]
                                    }
                                }
                            },
                            required: ["bone_name"]
                        }
                    }
                },
                required: ["name", "bones"]
            }
        }
    }
};

const JAVA_BLOCK_DATA_SCHEMA = {
    type: Type.OBJECT,
    nullable: true,
    properties: {
        parent: { type: Type.STRING },
        textures: { 
            type: Type.ARRAY, 
            nullable: true,
            items: {
                type: Type.OBJECT,
                properties: {
                    key: { type: Type.STRING },
                    value: { type: Type.STRING }
                },
                required: ["key", "value"]
            }
        },
        elements: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    from: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    to: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    color: { type: Type.STRING },
                    rotation: {
                        type: Type.OBJECT,
                        nullable: true,
                        properties: {
                            origin: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                            axis: { type: Type.STRING, enum: ["x", "y", "z"] },
                            angle: { type: Type.NUMBER }
                        },
                        required: ["origin", "axis", "angle"]
                    }
                },
                required: ["from", "to"]
            }
        }
    },
    required: ["elements"]
};

const JAVA_BLOCK_STATE_SCHEMA = {
    type: Type.OBJECT,
    nullable: true,
    properties: {
        variants: { 
            type: Type.ARRAY, 
            nullable: true,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    data: {
                        type: Type.OBJECT,
                        properties: {
                            model: { type: Type.STRING },
                            x: { type: Type.NUMBER, nullable: true },
                            y: { type: Type.NUMBER, nullable: true },
                            uvlock: { type: Type.BOOLEAN, nullable: true }
                        },
                        required: ["model"]
                    }
                },
                required: ["name", "data"]
            }
        },
        multipart: { 
            type: Type.ARRAY, 
            nullable: true,
            items: { 
                type: Type.OBJECT, 
                properties: {
                    when: { 
                        type: Type.ARRAY,
                        nullable: true,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                condition: { type: Type.STRING },
                                value: { type: Type.STRING }
                            },
                            required: ["condition", "value"]
                        }
                    },
                    apply: {
                        type: Type.OBJECT,
                        properties: {
                            model: { type: Type.STRING },
                            x: { type: Type.NUMBER, nullable: true },
                            y: { type: Type.NUMBER, nullable: true },
                            uvlock: { type: Type.BOOLEAN, nullable: true }
                        },
                        required: ["model"]
                    }
                },
                required: ["apply"]
            } 
        }
    }
};

const FULL_MODEL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    response_text: {
        type: Type.STRING,
        description: "Description of the generated model.",
    },
    model_type: {
        type: Type.STRING,
        enum: ["ENTITY", "BLOCK"],
        description: "The type of model generated based on the request."
    },
    identifier: { type: Type.STRING, description: "modid:name" },
    bedrock_data: BEDROCK_DATA_SCHEMA,
    animations: ANIMATIONS_SCHEMA,
    java_block_data: JAVA_BLOCK_DATA_SCHEMA,
    java_block_state: JAVA_BLOCK_STATE_SCHEMA
  },
  required: ["response_text", "model_type", "identifier"]
};

// --- Parsers ---

const parseResponseAnimations = (animationsList: any) => {
    if (!animationsList || !animationsList.list) return undefined;
    const animations: Record<string, any> = {};
    animationsList.list.forEach((anim: any) => {
         const bones: Record<string, any> = {};
         anim.bones.forEach((b: any) => {
             const rotationMap: Record<string, any> = {};
             if (b.rotation) b.rotation.forEach((k: any) => rotationMap[k.time] = k.value);
             
             const positionMap: Record<string, any> = {};
             if (b.position) b.position.forEach((k: any) => positionMap[k.time] = k.value);

             bones[b.bone_name] = {
                 rotation: Object.keys(rotationMap).length ? rotationMap : undefined,
                 position: Object.keys(positionMap).length ? positionMap : undefined,
             };
         });

         animations[anim.name] = {
             loop: anim.loop,
             animation_length: anim.animation_length,
             bones: bones
         };
    });
    return animations;
};

const parseJavaBlockData = (data: any) => {
    if (!data) return undefined;
    const parsed = { ...data };
    if (parsed.textures) {
        parsed.textures = arrayToMap(parsed.textures, 'key', 'value');
    }
    return parsed;
};

const parseJavaBlockState = (data: any) => {
    if (!data) return undefined;
    const parsed = { ...data };
    if (parsed.variants) {
        parsed.variants = arrayToVariantMap(parsed.variants);
    }
    if (Array.isArray(parsed.multipart)) {
        parsed.multipart = parsed.multipart.map((mp: any) => ({
            ...mp,
            when: mp.when ? arrayToMap(mp.when, 'condition', 'value') : undefined
        }));
    }
    return parsed;
};

// --- Clean JSON Helper ---
const cleanAndParseJSON = (text: string) => {
    // Attempt to clean markdown block code if present
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    let cleanText = match ? match[1] : text;
    
    // Attempt basic cleanup of whitespace
    cleanText = cleanText.trim();

    try {
        return JSON.parse(cleanText);
    } catch (e) {
        // Attempt Repair for simple truncation
        // This is a naive attempt to fix "Unexpected end of JSON input" 
        // by closing open brackets/braces.
        console.warn("Attempting JSON repair for truncated response...");
        try {
            let stack = [];
            for (let char of cleanText) {
                if (char === '{') stack.push('}');
                else if (char === '[') stack.push(']');
                else if (char === '}' || char === ']') {
                    if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
                }
            }
            while (stack.length > 0) {
                cleanText += stack.pop();
            }
            return JSON.parse(cleanText);
        } catch (repairError) {
            console.error("JSON Repair Failed. Raw Text:", text);
            throw new Error("Failed to parse model data. The model might be too complex or the response was truncated.");
        }
    }
};

// --- Exports ---

export const generateModelFromPrompt = async (
  prompt: string, 
  currentType: ModelType,
  currentLoader: ModLoader,
  imageBase64?: string,
  currentModelContext?: MinecraftModel
): Promise<{ text: string; model: MinecraftModel | null }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const parts: any[] = [{ text: `Current Mode: ${currentType}. Loader: ${currentLoader}. Request: ${prompt}` }];
    
    // Check if we have an image - this changes how we treat the context
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/png", 
          data: imageBase64.split(',')[1]
        }
      });
      parts.push({ 
          text: `IMAGE PROVIDED. This is the visual target (Ground Truth). 
          1. **Orientation**: Reconstruct the model so it faces Negative Z (-Z) (North).
          2. **Geometry**: Use the "1-Pixel Rule". If a part looks thin (sword, wing, paper), use a depth of 1. If it looks round, use rotated cubes (hexagons/octagons).
          3. **Fidelity**: IGNORE the simplified shape of the 'current context' if it's just a generic box. Trace the image details.` 
      });
    }

    if (currentModelContext && (currentModelContext.bedrockData?.bones?.length || currentModelContext.javaBlockData?.elements?.length)) {
       let contextObj: any = {};
       if (currentModelContext.type === 'ENTITY') {
           // PRE-PROCESS ANIMATIONS: Map -> List
           const animationsList = animationsMapToList(currentModelContext.animations);
           
           contextObj = {
               bedrock_data: currentModelContext.bedrockData,
               animations: animationsList
           };
       } else {
           contextObj = {
               java_block_data: currentModelContext.javaBlockData,
               java_block_state: currentModelContext.javaBlockState
           };
       }

       const contextStr = JSON.stringify(contextObj).substring(0, 50000); 
       
       let correctionHint = "";
       if (/wrong|fix|opposite|backwards|inverted|flip|posture|level/i.test(prompt)) {
           correctionHint = "\n\n**CORRECTION MODE ACTIVE**:\n1. The user is reporting a visual or logic error.\n2. Use the 'Thinking' process to simulate the bone hierarchy rotations.\n3. If correcting posture, remember: Child bones inherit rotation. Rotating the body +45deg requires rotating the head -45deg to keep it level.\n4. If an animation is broken, find the specific keyframes in the provided context and adjust them.";
       }

       parts.push({ 
         text: `CURRENT_MODEL_CONTEXT (JSON): ${contextStr}\n\nINSTRUCTION: The user wants to modify this existing model. \n1. YOU MUST RETURN the full model structure.\n2. **CRITICAL**: YOU MUST PRESERVE ALL existing animations, bones, and shapes in the JSON unless the user explicitly asks to remove them OR if you are doing a "Conversion" from a low-quality generic import (where the context is just a box).${correctionHint}` 
       });
    }

    // Hytale Specific Freedom Injection
    if (currentLoader === 'HYTALE') {
        parts.push({
            text: "REMINDER: Hytale supports arbitrary multi-axis rotation. Do not restrict yourself to Minecraft's 22.5 degree limit. Use free rotation [x,y,z] to achieve better shapes and curves."
        });
    }

    if (currentType === 'BLOCK' && /circle|round|cylinder|wheel|octagon|hexagon|tube|pipe/i.test(prompt)) {
        parts.push({
            text: "REMINDER: For Java BLOCKS, rotations are strictly limited to 0, 22.5, and 45 degrees. To make round shapes, use octagons (45 deg) or voxel steps. Do not use 30/60 degrees."
        });
    }

    if (currentType === 'BLOCK' && /sphere|ball|orb|globe/i.test(prompt)) {
        parts.push({
            text: "REMINDER: Spheres in Java Blocks must be VOXELIZED (constructed of stacked horizontal plates of varying sizes). Do NOT try to rotate cubes to form a sphere surface, as the 22.5 degree limit makes this impossible."
        });
    }

    // Use Gemini 3 Pro with Thinking for complex spatial reasoning and context preservation
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", 
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: FULL_MODEL_SCHEMA,
        // Increase Output Token limit to prevent truncated JSON for complex 3D models
        maxOutputTokens: 65536, 
        thinkingConfig: {
            // Limit thinking to leave room for the large JSON output
            thinkingBudget: 4096 // Increase thinking budget for complex geometry calculations
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No response from AI");

    const parsed = cleanAndParseJSON(resultText);
    
    const newModel: MinecraftModel = {
        type: parsed.model_type as ModelType,
        loader: currentLoader, 
        identifier: parsed.identifier,
        bedrockData: parsed.bedrock_data,
        animations: parseResponseAnimations(parsed.animations),
        javaBlockData: parseJavaBlockData(parsed.java_block_data),
        javaBlockState: parseJavaBlockState(parsed.java_block_state)
    };

    return {
        text: parsed.response_text,
        model: newModel
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const generateTextureFromPrompt = async (
  prompt: string, 
  referenceImage: string, 
  modelContext: MinecraftModel
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    // referenceImage is data:image/png;base64,...
    // Extract base64 data and mimeType
    const matches = referenceImage.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid base64 image data");
    const mimeType = matches[1];
    const data = matches[2];

    const parts: any[] = [
        {
            inlineData: {
                mimeType,
                data
            }
        },
        {
            text: `Texture Painting Task.
            Description: ${prompt}.
            Instruction: The provided image is a UV layout wireframe on a WHITE background with color-coded faces.
            1. **CRITICAL**: You MUST respect the layout. Do not ignore the colored boxes.
            2. Paint the specific texture details INSIDE the colored boxes provided in the reference image.
            3. Do NOT paint a generic image over the whole canvas. The texture map is fragmented.
            4. Fill the colored islands with the material (wood, metal, skin) requested.
            5. Keep the background WHITE or transparent where there are no boxes.`
        }
    ];

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts },
    });

    for (const cand of response.candidates || []) {
        for (const part of cand.content.parts) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    }
    throw new Error("No image generated by AI.");
};

export const generateBlockState = async (
    identifier: string,
    description: string
): Promise<JavaBlockState> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a valid Java Edition Blockstate JSON for identifier: "${identifier}". 
        Logic: ${description}.
        Instructions:
        1. Use the identifier "${identifier}" as the model resource location if not specified otherwise.
        2. If the logic implies multiple variants (e.g. facing, open/closed), generate them.
        3. If the logic implies multipart (e.g. fences), use that.
        4. Ensure the JSON conforms to standard Minecraft Java Edition blockstate format.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: JAVA_BLOCK_STATE_SCHEMA.properties
            }
        }
    });

    const parsed = cleanAndParseJSON(response.text || "{}");
    return parseJavaBlockState(parsed) as JavaBlockState;
};

export const autoRigModel = async (model: MinecraftModel): Promise<MinecraftModel> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const contextStr = JSON.stringify(model.bedrockData || {}).substring(0, 50000);
    
    // Auto-rig is complex spatial reasoning, upgrade to Pro with thinking.
    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: `Task: Auto-Rig Minecraft Model.
        Input Context: ${contextStr}
        Instruction: Analyze the input Bedrock geometry. 
        1. Identify body parts (head, body, arms, legs) based on cube positions/sizes.
        2. Create a hierarchical bone structure (parenting).
        3. Set Pivots correctly for animation (Head at neck, Arms at shoulders, Legs at hips).
        4. Return the full Bedrock Data structure within the response.
        `,
        config: {
             responseMimeType: "application/json",
             responseSchema: FULL_MODEL_SCHEMA,
             maxOutputTokens: 65536,
             thinkingConfig: {
                 thinkingBudget: 2048 
             }
        }
    });
    
    const parsed = cleanAndParseJSON(response.text || "{}");
    
    const newModel: MinecraftModel = {
        ...model,
        bedrockData: parsed.bedrock_data,
        animations: parseResponseAnimations(parsed.animations) // Preserve animations or accept new ones if generated
    };
    
    return newModel;
};