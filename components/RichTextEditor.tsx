
import React, { useRef, useEffect } from 'react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  label: string;
}

const RichTextEditor: React.FC<Props> = ({ content, onChange, label }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    if (editorRef.current) {
        // Only set if completely empty to prevent overwriting user progress if they switch tabs rapidly
        // or ensure it syncs on mount.
        if (editorRef.current.innerHTML !== content) {
             editorRef.current.innerHTML = content;
        }
    }
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const compressImage = (file: File): Promise<string> => {
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
              const img = new Image();
              img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  // Resize to reasonable max width for doc flow & storage
                  const maxWidth = 800; 
                  let width = img.width;
                  let height = img.height;
                  
                  if (width > maxWidth) {
                      height *= maxWidth / width;
                      width = maxWidth;
                  }
                  
                  canvas.width = width;
                  canvas.height = height;
                  ctx?.drawImage(img, 0, 0, width, height);
                  // Compress quality
                  resolve(canvas.toDataURL('image/jpeg', 0.7)); 
              };
              img.src = e.target?.result as string;
          };
          reader.readAsDataURL(file);
      });
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault(); // Prevent default blob insertion
        const file = items[i].getAsFile();
        if (file) {
            const base64 = await compressImage(file);
            document.execCommand('insertImage', false, base64);
            handleInput();
        }
      }
    }
  };

  const insertImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const base64 = await compressImage(e.target.files[0]);
          editorRef.current?.focus();
          document.execCommand('insertImage', false, base64);
          handleInput();
          e.target.value = ''; // Reset
      }
  };

  return (
    <div className="space-y-0 rounded-xl overflow-hidden border border-white/10 bg-black/50">
       <div className="flex justify-between items-center bg-neutral-800/50 p-3 border-b border-white/10">
           <label className="text-[10px] uppercase text-neutral-400 font-bold tracking-wider pl-1">{label}</label>
           <div className="relative">
               <label className="cursor-pointer text-xs bg-white text-black px-3 py-1.5 rounded-lg font-bold hover:bg-neutral-200 flex items-center gap-2 transition-colors">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                   </svg>
                   <span>Add Image</span>
                   <input type="file" className="hidden" accept="image/*" onChange={insertImageFile} />
               </label>
           </div>
       </div>
       <div 
         ref={editorRef}
         contentEditable
         className="w-full px-4 py-4 text-white text-sm outline-none min-h-[200px] max-h-[500px] overflow-y-auto rich-text-area"
         onInput={handleInput}
         onPaste={handlePaste}
       />
       <style>{`
         .rich-text-area img {
             max-width: 100%;
             border-radius: 8px;
             margin: 15px 0;
             border: 1px solid rgba(255,255,255,0.1);
             box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
         }
         .rich-text-area:empty:before {
            content: 'Start typing or paste an image...';
            color: #525252;
         }
       `}</style>
    </div>
  );
};

export default RichTextEditor;
