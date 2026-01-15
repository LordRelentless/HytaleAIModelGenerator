import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Loader2, Sparkles, X, Copy } from 'lucide-react';
import { ChatMessage, MinecraftModel } from '../types';

interface ChatInterfaceProps {
  onGenerate: (prompt: string, image?: string) => Promise<void>;
  isGenerating: boolean;
  history: ChatMessage[];
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onGenerate, isGenerating, history }) => {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isGenerating) return;
    
    const prompt = input;
    const img = selectedImage || undefined;
    
    setInput('');
    setSelectedImage(null);
    await onGenerate(prompt, img);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col h-64 border-t border-[#3e3e42] bg-[#1e1e1e]">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {history.length === 0 && (
            <div className="text-center text-gray-500 py-4 text-sm">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Describe a creature or item to generate a 3D model.</p>
                <p className="text-xs opacity-70">"A futuristic robot with glowing eyes" or "A rustic wooden chair"</p>
            </div>
        )}
        {history.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm group relative cursor-pointer hover:ring-1 hover:ring-white/20 transition-all ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : msg.isError 
                    ? 'bg-red-900/50 text-red-200 border border-red-800'
                    : 'bg-[#2d2d2d] text-gray-200 border border-[#3e3e42]'
              }`}
              onClick={() => setInput(msg.text)} // Reuse prompt
              title="Click to use this prompt"
            >
              {msg.image && (
                <img src={msg.image} alt="Reference" className="w-16 h-16 object-cover rounded mb-2 border border-white/20" />
              )}
              <p className="whitespace-pre-wrap">{msg.text}</p>
              {msg.modelData && (
                <div className="mt-2 pt-2 border-t border-white/10 text-xs text-green-400 flex items-center gap-1">
                    <Sparkles size={10} /> Model Generated
                </div>
              )}
              {/* Reuse Hint */}
              <div className="absolute -top-3 right-0 opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 pointer-events-none transition-opacity">
                <Copy size={8} /> Use
              </div>
            </div>
          </div>
        ))}
        {isGenerating && (
           <div className="flex justify-start">
             <div className="bg-[#2d2d2d] rounded-lg px-4 py-3 border border-[#3e3e42] flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking & Sculpting...
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-[#252526] border-t border-[#3e3e42]">
        {selectedImage && (
            <div className="mb-2 inline-flex items-center gap-2 bg-[#3e3e42] rounded-full pl-1 pr-3 py-1">
                <img src={selectedImage} alt="Preview" className="w-6 h-6 rounded-full object-cover" />
                <span className="text-xs text-gray-300">Image attached</span>
                <button onClick={() => setSelectedImage(null)} className="text-gray-400 hover:text-white">
                    <X size={14} />
                </button>
            </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
            <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-white hover:bg-[#3e3e42] rounded-lg transition-colors"
                title="Upload Reference Image"
            >
                <ImageIcon size={20} />
            </button>
            <input 
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
            />
            
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your model (e.g. 'A blue dragon with golden wings')..."
                className="flex-1 bg-[#1e1e1e] border border-[#3e3e42] text-white rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-gray-600"
                disabled={isGenerating}
            />
            
            <button
                type="submit"
                disabled={(!input && !selectedImage) || isGenerating}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-gray-500 text-white px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
            >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Generate
            </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
