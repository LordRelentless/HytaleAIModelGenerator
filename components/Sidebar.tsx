import React, { useRef, useState, useMemo } from 'react';
import { Box, Layers, Code, FileJson, Undo, Redo, Trash2, Image as ImageIcon, Wand2, Upload, Settings, Cuboid, Ghost, User, Grid2X2, Play, Pause, Film, Activity, AlertTriangle, Sparkles, Hammer, Shapes, FileUp, Download, Package, Gamepad2, RefreshCcw, Plus, MousePointer2 } from 'lucide-react';
import { MinecraftModel, ViewMode, ModLoader, ModelType, ModelBone, ModelAttachment } from '../types';
import { exportHytaleModel } from '../services/modelExporter';
import { HYTALE_TEMPLATE } from '../constants';
import { packUVs } from '../services/textureMapper';

interface SidebarProps {
  model: MinecraftModel;
  setModel: (val: MinecraftModel | ((prev: MinecraftModel) => MinecraftModel)) => void;
  currentMode: ViewMode;
  setMode: (mode: ViewMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDeleteBone: (index: number) => void;
  textureData?: string | null;
  onGenerateTexture: (prompt?: string, existingImage?: string) => void;
  onUploadTexture: (data: string) => void;
  onClearTexture: () => void;
  isGeneratingTexture: boolean;
  onLoadPlayerTemplate: () => void;
  onGenerateBlockState: () => void;
  activeAnimation?: string;
  setActiveAnimation?: (name: string) => void;
  isPlaying?: boolean;
  setIsPlaying?: (val: boolean) => void;
  onAutoRig: () => void;
  onEnhanceDetail: () => void;
  onAddPrimitive: (shape: string, radius: number) => void;
  onImportJson: (file: File) => void;
  onConvertToMinecraft?: () => void; 
  textureDensity: '16x' | '32x' | '64x';
  setTextureDensity: (val: '16x' | '32x' | '64x') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  model, 
  setModel,
  currentMode, 
  setMode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDeleteBone,
  textureData,
  onGenerateTexture,
  onUploadTexture,
  onClearTexture,
  isGeneratingTexture,
  onLoadPlayerTemplate,
  onGenerateBlockState,
  activeAnimation,
  setActiveAnimation,
  isPlaying,
  setIsPlaying,
  onAutoRig,
  onEnhanceDetail,
  onAddPrimitive,
  onImportJson,
  onConvertToMinecraft,
  textureDensity,
  setTextureDensity
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [texturePrompt, setTexturePrompt] = useState("");
  const [primitiveRadius, setPrimitiveRadius] = useState<number>(4);
  const [selectedBoneIndex, setSelectedBoneIndex] = useState<number | null>(null);
  const [newAttachmentName, setNewAttachmentName] = useState("hand_right");

  const stats = useMemo(() => {
    let cubes = 0;
    let bones = 0;
    if (model.bedrockData?.bones) {
        bones = model.bedrockData.bones.length;
        const countCubes = (bArr: any[]) => {
            bArr.forEach(b => {
                cubes += b.cubes?.length || 0;
            });
        };
        countCubes(model.bedrockData.bones);
    }
    
    // 255 Limit check
    const totalNodes = bones + cubes;
    const isOverLimit = totalNodes > 255;

    let complexity = "Low";
    if (totalNodes > 100) complexity = "Medium";
    if (totalNodes > 200) complexity = "High";
    if (isOverLimit) complexity = "Over Limit!";

    return { cubes, bones, totalNodes, complexity, isOverLimit };
  }, [model]);

  const handleExportHytale = () => {
    if (stats.isOverLimit) {
        if (!confirm(`Warning: Your model has ${stats.totalNodes} nodes, which exceeds the Hytale limit of 255. It may not load correctly. Export anyway?`)) {
            return;
        }
    }
    exportHytaleModel(model, textureData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
    }
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleTextureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onUploadTexture(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddAttachment = () => {
      if (selectedBoneIndex === null || !model.bedrockData) return;
      setModel(prev => {
          const newBones = [...(prev.bedrockData?.bones || [])];
          const bone = { ...newBones[selectedBoneIndex] };
          
          const newAtt: ModelAttachment = {
              name: newAttachmentName,
              position: [0, 0, 0]
          };
          
          let currentAtts: ModelAttachment[] = [];
          if (bone.attachments) {
              if (bone.attachments.length > 0 && typeof bone.attachments[0] === 'string') {
                  currentAtts = (bone.attachments as unknown as string[]).map(s => ({ name: s, position: [0,0,0] }));
              } else {
                  currentAtts = bone.attachments as ModelAttachment[];
              }
          }
          
          bone.attachments = [...currentAtts, newAtt];
          newBones[selectedBoneIndex] = bone;
          
          return {
              ...prev,
              bedrockData: { ...prev.bedrockData!, bones: newBones }
          };
      });
  };

  const handleUpdateAttachment = (attIndex: number, field: 'x'|'y'|'z'|'name', value: string | number) => {
      if (selectedBoneIndex === null || !model.bedrockData) return;
      setModel(prev => {
          const newBones = [...prev.bedrockData!.bones];
          const bone = { ...newBones[selectedBoneIndex] };
          const attachments = [...(bone.attachments as ModelAttachment[])];
          const att = { ...attachments[attIndex] };
          
          if (!att.position) att.position = [0,0,0];

          if (field === 'name') att.name = value as string;
          else if (field === 'x') att.position = [Number(value), att.position[1], att.position[2]];
          else if (field === 'y') att.position = [att.position[0], Number(value), att.position[2]];
          else if (field === 'z') att.position = [att.position[0], att.position[1], Number(value)];

          attachments[attIndex] = att;
          bone.attachments = attachments;
          newBones[selectedBoneIndex] = bone;
          return { ...prev, bedrockData: { ...prev.bedrockData!, bones: newBones } };
      });
  };

  const handleRemoveAttachment = (attIndex: number) => {
      if (selectedBoneIndex === null || !model.bedrockData) return;
      setModel(prev => {
          const newBones = [...prev.bedrockData!.bones];
          const bone = { ...newBones[selectedBoneIndex] };
          const attachments = [...(bone.attachments as ModelAttachment[])];
          attachments.splice(attIndex, 1);
          bone.attachments = attachments;
          newBones[selectedBoneIndex] = bone;
          return { ...prev, bedrockData: { ...prev.bedrockData!, bones: newBones } };
      });
  };

  const selectedBone = selectedBoneIndex !== null && model.bedrockData ? model.bedrockData.bones[selectedBoneIndex] : null;

  return (
    <div className="w-80 bg-[#1e1e1e] border-r border-[#3e3e42] flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[#3e3e42] flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Box className="text-blue-500" />
          Hytale Studio
        </h1>
        <div className="flex gap-1">
            <button onClick={onUndo} disabled={!canUndo} className="p-1.5 hover:bg-[#3e3e42] rounded disabled:opacity-30" title="Undo">
                <Undo size={16} />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-1.5 hover:bg-[#3e3e42] rounded disabled:opacity-30" title="Redo">
                <Redo size={16} />
            </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#3e3e42]">
        {[
          { id: ViewMode.EDITOR, icon: Cuboid, label: 'Edit' },
          { id: ViewMode.TEXTURE, icon: ImageIcon, label: 'Paint' },
          { id: ViewMode.ANIMATE, icon: Film, label: 'Anim' },
          { id: ViewMode.JSON, icon: Code, label: 'Code' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id as ViewMode)}
            className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${
              currentMode === tab.id 
                ? 'bg-[#252526] text-blue-400 border-b-2 border-blue-500' 
                : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        
        {/* Statistics */}
        <div className="bg-[#252526] p-3 rounded-lg text-xs space-y-1 border border-[#3e3e42]">
            <div className="flex justify-between text-gray-400">
                <span>Bones: <span className="text-white">{stats.bones}</span></span>
                <span>Cubes: <span className="text-white">{stats.cubes}</span></span>
            </div>
            <div className="flex justify-between text-gray-400 border-t border-[#3e3e42] pt-1 mt-1">
                <span>Total Nodes: <span className={stats.isOverLimit ? "text-red-500 font-bold" : "text-white"}>{stats.totalNodes} / 255</span></span>
            </div>
        </div>

        {currentMode === ViewMode.EDITOR && (
            <>  
                {/* Bone List & Selection */}
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-gray-500 uppercase flex justify-between items-center">
                        Hierarchy
                        <span className="text-[10px] font-normal lowercase">(Click bone to edit)</span>
                    </h3>
                    <div className="max-h-40 overflow-y-auto bg-[#121212] border border-[#3e3e42] rounded p-1">
                        {model.bedrockData?.bones.map((bone, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => setSelectedBoneIndex(idx)}
                                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs ${selectedBoneIndex === idx ? 'bg-blue-900/50 text-blue-200 border border-blue-800' : 'text-gray-400 hover:bg-[#2d2d2d]'}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${bone.parent ? 'bg-gray-600' : 'bg-orange-500'}`} />
                                <span className="truncate">{bone.name}</span>
                                {bone.attachments && bone.attachments.length > 0 && (
                                    <div className="ml-auto flex gap-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Attachment Editor */}
                {selectedBone && (
                    <div className="bg-[#252526] p-3 rounded border border-blue-900/50 space-y-3">
                        <div className="flex items-center justify-between border-b border-[#3e3e42] pb-2">
                            <h3 className="text-xs font-bold text-blue-400 uppercase flex items-center gap-2">
                                <Settings size={12} /> {selectedBone.name}
                            </h3>
                            <button onClick={() => onDeleteBone(selectedBoneIndex!)} className="text-red-400 hover:text-red-300">
                                <Trash2 size={12} />
                            </button>
                        </div>

                        {/* Attachments List */}
                        <div className="space-y-2">
                            <label className="text-[10px] text-gray-500 font-bold uppercase">Attachments</label>
                            
                            {(selectedBone.attachments as ModelAttachment[])?.map((att, attIdx) => (
                                <div key={attIdx} className="bg-[#1e1e1e] p-2 rounded border border-[#3e3e42] space-y-1">
                                    <div className="flex items-center gap-1">
                                        <input 
                                            type="text" 
                                            value={att.name || ""}
                                            onChange={(e) => handleUpdateAttachment(attIdx, 'name', e.target.value)}
                                            className="bg-transparent text-xs text-yellow-400 font-mono w-full focus:outline-none"
                                        />
                                        <button onClick={() => handleRemoveAttachment(attIdx)} className="text-gray-500 hover:text-red-400">
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1">
                                        <div className="flex items-center bg-[#121212] rounded px-1">
                                            <span className="text-[8px] text-red-400 mr-1">X</span>
                                            <input type="number" value={att.position ? att.position[0] : 0} onChange={(e) => handleUpdateAttachment(attIdx, 'x', e.target.value)} className="w-full bg-transparent text-[10px] text-gray-300 outline-none text-right" />
                                        </div>
                                        <div className="flex items-center bg-[#121212] rounded px-1">
                                            <span className="text-[8px] text-green-400 mr-1">Y</span>
                                            <input type="number" value={att.position ? att.position[1] : 0} onChange={(e) => handleUpdateAttachment(attIdx, 'y', e.target.value)} className="w-full bg-transparent text-[10px] text-gray-300 outline-none text-right" />
                                        </div>
                                        <div className="flex items-center bg-[#121212] rounded px-1">
                                            <span className="text-[8px] text-blue-400 mr-1">Z</span>
                                            <input type="number" value={att.position ? att.position[2] : 0} onChange={(e) => handleUpdateAttachment(attIdx, 'z', e.target.value)} className="w-full bg-transparent text-[10px] text-gray-300 outline-none text-right" />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div className="flex gap-1 pt-1">
                                <select 
                                    value={newAttachmentName}
                                    onChange={(e) => setNewAttachmentName(e.target.value)}
                                    className="flex-1 bg-[#1e1e1e] text-[10px] text-gray-300 border border-[#3e3e42] rounded px-1"
                                >
                                    <option value="hand_right">hand_right</option>
                                    <option value="hand_left">hand_left</option>
                                    <option value="head_top">head_top</option>
                                    <option value="eye_left">eye_left</option>
                                    <option value="eye_right">eye_right</option>
                                    <option value="back_center">back_center</option>
                                    <option value="custom">custom...</option>
                                </select>
                                <button 
                                    onClick={handleAddAttachment}
                                    className="bg-[#3e3e42] hover:bg-yellow-900/50 text-gray-300 hover:text-yellow-400 p-1 rounded border border-[#3e3e42]"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Primitives Section */}
                <div className="space-y-3 pt-4 border-t border-[#3e3e42]">
                    <h3 className="text-xs font-bold text-gray-500 uppercase">Add Primitive</h3>
                    <div className="flex items-center gap-2 mb-2">
                         <span className="text-xs text-gray-400">Radius:</span>
                         <input 
                            type="number" 
                            min={1} 
                            max={16} 
                            value={primitiveRadius}
                            onChange={(e) => setPrimitiveRadius(parseInt(e.target.value) || 4)}
                            className="w-12 bg-[#1e1e1e] border border-[#3e3e42] rounded px-1 py-0.5 text-xs text-white"
                         />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {['Cube', 'Sphere', 'Cylinder', 'Cone'].map(shape => (
                            <button 
                                key={shape}
                                onClick={() => onAddPrimitive(shape, primitiveRadius)}
                                className="flex items-center justify-center gap-2 bg-[#2d2d2d] hover:bg-[#3e3e42] text-gray-300 px-2 py-2 rounded text-xs transition-colors border border-[#3e3e42]"
                            >
                                <Shapes size={14} /> {shape}
                            </button>
                        ))}
                    </div>
                </div>
            </>
        )}

        {currentMode === ViewMode.TEXTURE && (
            <div className="space-y-4">
                 <h3 className="text-xs font-bold text-gray-500 uppercase">Texture Manager</h3>
                 
                 {/* Density Selector */}
                 <div className="space-y-1">
                     <label className="text-[10px] text-gray-400 font-bold uppercase">Target Pixel Density</label>
                     <div className="flex gap-1 bg-[#121212] p-1 rounded border border-[#3e3e42]">
                         {(['16x', '32x', '64x'] as const).map(d => (
                             <button
                                key={d}
                                onClick={() => setTextureDensity(d)}
                                className={`flex-1 text-[10px] py-1 rounded ${textureDensity === d ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                             >
                                 {d}
                             </button>
                         ))}
                     </div>
                     <p className="text-[10px] text-gray-500">
                         {textureDensity === '16x' ? 'Low: Standard Blocks' : 
                          textureDensity === '32x' ? 'Med: Props & Items' : 
                          'High: Avatars & Detailed Weapons'}
                     </p>
                 </div>

                 <div className="space-y-2 pt-2">
                    <label className="text-xs text-gray-400">AI Texture Generation</label>
                    <textarea 
                        value={texturePrompt}
                        onChange={(e) => setTexturePrompt(e.target.value)}
                        placeholder="Describe texture details (e.g. rusty metal, dragon scales)..."
                        className="w-full h-20 bg-[#1e1e1e] border border-[#3e3e42] rounded p-2 text-xs text-white resize-none focus:border-blue-500 outline-none"
                    />
                    <button 
                        onClick={() => onGenerateTexture(texturePrompt)}
                        disabled={isGeneratingTexture}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded text-xs font-medium flex items-center justify-center gap-2"
                    >
                        {isGeneratingTexture ? <RefreshCcw className="animate-spin" size={14} /> : <Wand2 size={14} />}
                        Generate Texture
                    </button>
                 </div>

                 <div className="h-px bg-[#3e3e42]" />

                 <div className="flex gap-2">
                     <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-[#2d2d2d] hover:bg-[#3e3e42] text-white py-2 rounded text-xs border border-[#3e3e42] flex items-center justify-center gap-2">
                         <Upload size={14} /> Upload
                     </button>
                     <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleTextureUpload} />
                     
                     <button onClick={onClearTexture} className="bg-[#2d2d2d] hover:bg-red-900/50 hover:text-red-200 text-gray-400 py-2 px-3 rounded text-xs border border-[#3e3e42]">
                         <Trash2 size={14} />
                     </button>
                 </div>

                 {textureData && (
                     <div className="mt-2">
                         <p className="text-xs text-gray-500 mb-1">Current Texture:</p>
                         <img src={textureData} alt="Texture" className="w-full aspect-square object-contain bg-[url('/grid.png')] border border-[#3e3e42] rounded" />
                     </div>
                 )}
            </div>
        )}

        {currentMode === ViewMode.ANIMATE && (
             <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Animation Controller</h3>
                
                {model.animations && Object.keys(model.animations).length > 0 ? (
                    <>
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400">Select Animation</label>
                            <select 
                                value={activeAnimation || ''} 
                                onChange={(e) => setActiveAnimation && setActiveAnimation(e.target.value)}
                                className="w-full bg-[#1e1e1e] border border-[#3e3e42] text-white text-xs rounded p-2 outline-none"
                            >
                                {Object.keys(model.animations).map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>

                        <button 
                            onClick={() => setIsPlaying && setIsPlaying(!isPlaying)}
                            className={`w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                                isPlaying ? 'bg-red-900/50 text-red-200 border border-red-800' : 'bg-green-900/50 text-green-200 border border-green-800'
                            }`}
                        >
                            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                            {isPlaying ? 'Pause' : 'Play'}
                        </button>

                        <div className="bg-[#252526] p-2 rounded border border-[#3e3e42] text-xs text-gray-400">
                            <p>Length: {model.animations[activeAnimation!]?.animation_length?.toFixed(2)}s</p>
                            <p>Loop: {model.animations[activeAnimation!]?.loop ? 'Yes' : 'No'}</p>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-8 text-gray-500 text-xs">
                        <Activity size={24} className="mx-auto mb-2 opacity-50" />
                        No animations found in this model.
                    </div>
                )}
             </div>
        )}

        {currentMode === ViewMode.JSON && (
            <div className="space-y-2 h-full flex flex-col">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Model Source</h3>
                <div className="flex-1 bg-[#121212] rounded border border-[#3e3e42] p-2 overflow-auto custom-scrollbar">
                    <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(model, null, 2)}
                    </pre>
                </div>
            </div>
        )}

      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-[#3e3e42] bg-[#252526] space-y-2">
        <button onClick={handleExportHytale} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors">
            <Download size={16} /> Export Hytale Model
        </button>
        <div className="flex gap-2">
             <button onClick={() => importInputRef.current?.click()} className="flex-1 bg-[#2d2d2d] hover:bg-[#3e3e42] text-gray-300 py-2 rounded text-xs flex items-center justify-center gap-2 border border-[#3e3e42]">
                <FileUp size={14} /> Import
             </button>
             <input type="file" ref={importInputRef} className="hidden" accept=".json,.gltf,.glb,.obj" onChange={handleFileChange} />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;