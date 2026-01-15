import React, { useState, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Viewer3D from './components/Viewer3D';
import ChatInterface from './components/ChatInterface';
import { generateModelFromPrompt, generateTextureFromPrompt, generateBlockState, autoRigModel } from './services/geminiService';
import { packUVs, drawTextureLayout, scaleModelUVs } from './services/textureMapper';
import { parseModelFile } from './services/modelImporter';
import { MinecraftModel, ChatMessage, ViewMode } from './types';
import { INITIAL_MODEL, STEVE_MODEL } from './constants';
import useHistory from './hooks/useHistory';

const App: React.FC = () => {
  // Replace simple useState with useHistory for the model
  const { 
    state: model, 
    set: setModel, 
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useHistory<MinecraftModel>({ ...INITIAL_MODEL, loader: 'HYTALE' });

  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.EDITOR);
  
  // Texture State
  const [textureData, setTextureData] = useState<string | null>(null);
  const [isGeneratingTexture, setIsGeneratingTexture] = useState(false);
  const [textureDensity, setTextureDensity] = useState<'16x'|'32x'|'64x'>('16x');
  
  // New state to track actual texture scaling relative to model units
  const [uvScaleFactor, setUvScaleFactor] = useState<number>(1);
  
  // We keep the last prompt used for model generation to use for texture generation context
  const [lastPrompt, setLastPrompt] = useState<string>("");

  // Animation State
  const [activeAnimation, setActiveAnimation] = useState<string | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);

  // Capture Ref for Screenshotting the 3D view
  const captureRef = useRef<(() => string) | null>(null);

  const handleGenerate = async (prompt: string, imageBase64?: string) => {
    setIsGenerating(true);
    setLastPrompt(prompt);
    
    // Add user message immediately
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: prompt,
      image: imageBase64
    };
    setHistory(prev => [...prev, userMsg]);

    try {
      // Pass the current model to the AI to allow for context-aware refinements
      // Force 'HYTALE' loader context
      const { text, model: newModel } = await generateModelFromPrompt(
          prompt, 
          model.type, 
          'HYTALE', 
          imageBase64,
          model 
      );
      
      if (newModel) {
        // Automatically pack UVs for the new model so it's ready for texturing
        // Use the selected density
        const packedModel = packUVs(newModel, textureDensity);
        setModel(packedModel);
        
        // Reset scale factor when new model is generated until texture is applied
        setUvScaleFactor(1);

        // Reset active animation state to avoid pointing to non-existent animations from previous model
        setActiveAnimation(undefined);
        setIsPlaying(false);

        // If animations exist, select the first one automatically
        if (packedModel.animations && Object.keys(packedModel.animations).length > 0) {
             setActiveAnimation(Object.keys(packedModel.animations)[0]);
             setIsPlaying(true);
             setViewMode(ViewMode.ANIMATE);
        }
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: text,
        modelData: newModel || undefined
      };
      setHistory(prev => [...prev, aiMsg]);

    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I encountered an error while generating the model. Please check your API key or try a different prompt.",
        isError: true
      };
      setHistory(prev => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateTexture = async (customPrompt?: string, existingImage?: string) => {
      // Use custom prompt if provided, otherwise fallback to lastPrompt
      const promptToUse = customPrompt || lastPrompt;

      if (!promptToUse && !existingImage) {
          alert("Please describe the texture or generate a model first to establish context!");
          return;
      }

      setIsGeneratingTexture(true);
      try {
          // 1. Ensure Model has valid UVs packed for the TARGET DENSITY
          // This is critical. The UV map must match the requested detail level.
          let workingModel = packUVs(model, textureDensity);
          
          // Get the base texture size derived from packing (e.g. 64x64 or 128x128)
          const packedW = workingModel.bedrockData?.texture_size[0] || 64;

          // 2. Generate Layout Reference Image (Wireframe)
          const layoutImage = drawTextureLayout(workingModel, textureDensity);

          // 3. Send Layout to AI to paint over
          const base64Image = await generateTextureFromPrompt(
              promptToUse, 
              layoutImage || existingImage, // Use layout if available, otherwise existing image
              workingModel
          );
          
          // 4. CRITICAL: Detect Resolution and Scale Model UVs AND Viewer Scale
          const img = new Image();
          img.onload = () => {
              // Scale the model UV coordinates to match the new image dimensions
              const scaledModel = scaleModelUVs(workingModel, img.naturalWidth, img.naturalHeight);
              setModel(scaledModel);
              
              // Calculate effective Scale Factor for Viewer
              // Viewer needs to know: How many pixels cover 1 unit of geometry?
              // Standard density '16x' means 1 unit = 1 pixel (conceptually in MC).
              // '32x' means 1 unit = 2 pixels.
              // If AI upscales the image 4x, then 1 unit = 4 pixels (if started at 16x).
              
              // Ratio of Actual Image Width vs Packed Width
              const upScaleRatio = img.naturalWidth / packedW;
              
              let densityBase = 1;
              if (textureDensity === '32x') densityBase = 2;
              if (textureDensity === '64x') densityBase = 4;
              
              // Final Scale = Density * UpScale
              setUvScaleFactor(densityBase * upScaleRatio);

              setTextureData(base64Image);
              setViewMode(ViewMode.TEXTURE);
          };
          img.src = base64Image;

      } catch (e) {
          console.error("Failed to generate texture", e);
          alert("Failed to generate texture. Please try again.");
      } finally {
          setIsGeneratingTexture(false);
      }
  };

  const handleUploadTexture = (data: string) => {
      const img = new Image();
      img.onload = () => {
          let workingModel = packUVs(model, textureDensity);
          const packedW = workingModel.bedrockData?.texture_size[0] || 64;
          
          const scaledModel = scaleModelUVs(workingModel, img.naturalWidth, img.naturalHeight);
          setModel(scaledModel);
          
          // Calculate scale for viewer based on upload
          const upScaleRatio = img.naturalWidth / packedW;
          let densityBase = 1;
          if (textureDensity === '32x') densityBase = 2;
          if (textureDensity === '64x') densityBase = 4;
          
          setUvScaleFactor(densityBase * upScaleRatio);
          setTextureData(data);
      };
      img.src = data;
  };

  const handleDeleteBone = (index: number) => {
    setModel((prevModel) => {
        // If Entity, delete bone
        if (prevModel.type === 'ENTITY' && prevModel.bedrockData) {
             const newBones = [...prevModel.bedrockData.bones];
             newBones.splice(index, 1);
             return {
                 ...prevModel,
                 bedrockData: {
                     ...prevModel.bedrockData,
                     bones: newBones
                 }
             };
        }
        return prevModel;
    });
  };

  const handleLoadPlayerTemplate = () => {
    // Pack UVs for Steve immediately
    const packedSteve = packUVs(STEVE_MODEL, textureDensity);
    setModel(packedSteve);
    setUvScaleFactor(1); // Reset scale
    const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: "Loaded standard Hytale Humanoid template. You can now modify it or generate a texture.",
    };
    setHistory(prev => [...prev, msg]);
  };

  const handleGenerateBlockState = async () => {
      // Hytale blocks often use model logic, but if this legacy function is called:
      alert("Hytale typically handles blockstates via model configuration files, not Java Edition blockstates.");
  };

  const handleAutoRig = async () => {
      setIsGenerating(true);
      try {
          const riggedModel = await autoRigModel(model);
          // Don't forget to repack UVs after structure change
          const packed = packUVs(riggedModel, textureDensity);
          setModel(packed);

          const msg: ChatMessage = {
            id: Date.now().toString(),
            role: 'model',
            text: "I've re-organized the model into a Hytale-compatible bone hierarchy.",
          };
          setHistory(prev => [...prev, msg]);
      } catch (e) {
          console.error(e);
          alert("Failed to auto-rig model.");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleEnhanceDetail = () => {
      let screenshot: string | undefined = undefined;
      
      // If we have an imported model, capture it as reference!
      if (captureRef.current) {
         screenshot = captureRef.current();
      }

      handleGenerate(
          `Enhance the detail of this model. Add more voxels, bevels, and surface details to make it look higher fidelity. Preserve the general shape visible in the context or image.`, 
          screenshot
      );
  };

  const handleAddPrimitive = (shape: string, radius: number) => {
      // SPECIAL HANDLING FOR CYLINDERS TO AVOID "STAR" SHAPES
      // Updated for Hytale's Arbitrary Rotation capability
      let prompt = `Generate a ${shape} shape with a radius of ${radius} voxels. Ensure it is symmetric and centered.`;
      
      if (shape.toLowerCase() === 'cylinder') {
          prompt += `
          IMPORTANT: Do NOT create a cylinder by simply overlapping two cubes rotated 45 degrees (this creates a star).
          Instead, use the "Rotated Ring" method: Create a circle of ${Math.max(8, radius * 2)} vertical planks/panels, and rotate each one freely around the Y axis to face the center (e.g., 360 / 12 = 30 degree steps).
          The result must look ROUND.`;
      }
      
      handleGenerate(prompt, undefined);
  };

  const handleConvertToMinecraft = () => {
      alert("This version is strictly for Hytale. Use standard Export.");
  };

  const handleImportFile = async (file: File) => {
    try {
        const newModel = await parseModelFile(file);
        
        if (newModel) {
            // Force Hytale loader on import
            newModel.loader = 'HYTALE';
            setModel(newModel);
             const msg: ChatMessage = {
                id: Date.now().toString(),
                role: 'model',
                text: `Imported ${file.name}. Converted to Hytale Workspace.`,
            };
            setHistory(prev => [...prev, msg]);
            setViewMode(ViewMode.EDITOR);
        } else {
            alert("Could not identify model format.");
        }

    } catch (e: any) {
        console.error(e);
        alert(e.message || "Failed to import file.");
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-gray-200 font-sans overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar 
            model={model}
            setModel={setModel} 
            currentMode={viewMode}
            setMode={setViewMode}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onDeleteBone={handleDeleteBone}
            textureData={textureData}
            onGenerateTexture={handleGenerateTexture}
            onUploadTexture={handleUploadTexture}
            onClearTexture={() => setTextureData(null)}
            isGeneratingTexture={isGeneratingTexture}
            onLoadPlayerTemplate={handleLoadPlayerTemplate}
            onGenerateBlockState={handleGenerateBlockState}
            // Animation State
            activeAnimation={activeAnimation}
            setActiveAnimation={setActiveAnimation}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            // New Features
            onAutoRig={handleAutoRig}
            onEnhanceDetail={handleEnhanceDetail}
            onAddPrimitive={handleAddPrimitive}
            onImportJson={handleImportFile}
            onConvertToMinecraft={handleConvertToMinecraft}
            // Density
            textureDensity={textureDensity}
            setTextureDensity={setTextureDensity}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full min-w-0">
            {/* 3D Viewport Area */}
            <div className="flex-1 relative bg-[#121212]">
                <Viewer3D 
                    model={model} 
                    textureData={textureData}
                    activeAnimationName={activeAnimation}
                    isPlaying={isPlaying}
                    captureRef={captureRef}
                    uvScale={uvScaleFactor} // Pass the calculated scale factor
                />
            </div>

            {/* Chat Area */}
            <ChatInterface 
                onGenerate={handleGenerate} 
                isGenerating={isGenerating}
                history={history}
            />
        </div>
    </div>
  );
};

export default App;