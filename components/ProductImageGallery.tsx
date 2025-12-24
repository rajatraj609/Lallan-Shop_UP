import React, { useState, useRef, MouseEvent, useEffect } from 'react';

interface Props {
  images: string[];
  productName: string;
}

const ProductImageGallery: React.FC<Props> = ({ images, productName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // Zoom State (Only used in Modal)
  const [showZoom, setShowZoom] = useState(false);
  const [lensPos, setLensPos] = useState({ x: 0, y: 0 });
  const [bgPos, setBgPos] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  
  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!images || images.length === 0) return null;

  // --- Zoom Logic (Only active in Modal) ---
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !isOpen) return;

    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = e.clientX - left;
    const y = e.clientY - top;

    const lensSize = 200; // Larger lens for full view
    
    let lensX = x - lensSize / 2;
    let lensY = y - lensSize / 2;

    // Calculate background position percentage
    const bgX = (x / width) * 100;
    const bgY = (y / height) * 100;

    setLensPos({ x: lensX, y: lensY });
    setBgPos({ x: bgX, y: bgY });
  };

  const nextImage = (e?: MouseEvent) => {
      e?.stopPropagation();
      setActiveIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e?: MouseEvent) => {
      e?.stopPropagation();
      setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // --- PREVIEW MODE (In Card) ---
  if (!isOpen) {
      return (
          <div 
            className="w-full h-full relative group cursor-pointer overflow-hidden"
            onClick={() => setIsOpen(true)}
          >
              <img 
                src={images[0]} 
                alt={productName} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              
              {/* Enticing Hover Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                  <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 flex flex-col items-center gap-2">
                      <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-full text-white shadow-xl hover:bg-white hover:text-black transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                          </svg>
                      </div>
                      <span className="text-white text-xs font-display font-bold tracking-widest uppercase bg-black/50 px-3 py-1 rounded-full">View Gallery</span>
                  </div>
              </div>
              
              {/* Image Counter Badge */}
              {images.length > 1 && (
                  <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      1 / {images.length}
                  </div>
              )}
          </div>
      );
  }

  // --- FULL VIEW MODAL ---
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-950/98 backdrop-blur-xl animate-in fade-in duration-300">
        
        {/* Header / Close */}
        <div className="flex justify-between items-center p-6 absolute top-0 left-0 right-0 z-50 pointer-events-none">
            <h3 className="text-white font-display font-bold text-lg hidden md:block pointer-events-auto bg-black/50 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">{productName}</h3>
            <button 
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                className="ml-auto pointer-events-auto bg-neutral-800/80 hover:bg-white hover:text-black text-white p-3 rounded-full transition-all border border-white/20 hover:scale-110 shadow-lg"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>

        {/* Main Stage */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-12 relative overflow-hidden">
            
            {/* Left Arrow */}
            {images.length > 1 && (
                <button 
                    onClick={prevImage}
                    className="absolute left-4 md:left-8 z-40 p-4 rounded-full bg-black/50 border border-white/10 text-white hover:bg-white hover:text-black transition-all hover:scale-110"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                </button>
            )}

            {/* Right Arrow */}
            {images.length > 1 && (
                <button 
                    onClick={nextImage}
                    className="absolute right-4 md:right-8 z-40 p-4 rounded-full bg-black/50 border border-white/10 text-white hover:bg-white hover:text-black transition-all hover:scale-110"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
            )}

            {/* Image Container with Zoom */}
            <div 
                ref={containerRef}
                className="relative max-h-[75vh] w-auto max-w-full cursor-crosshair shadow-2xl rounded-xl overflow-hidden bg-black border border-white/5"
                onMouseEnter={() => setShowZoom(true)}
                onMouseLeave={() => setShowZoom(false)}
                onMouseMove={handleMouseMove}
            >
                <img 
                    src={images[activeIndex]} 
                    alt="Full View" 
                    className="max-h-[75vh] w-auto max-w-full object-contain select-none"
                />

                {/* Magnifying Lens */}
                {showZoom && (
                    <div 
                        className="absolute z-50 w-[200px] h-[200px] rounded-full border-2 border-white/50 shadow-[0_0_50px_rgba(0,0,0,0.8)] bg-no-repeat pointer-events-none"
                        style={{
                            left: lensPos.x,
                            top: lensPos.y,
                            backgroundImage: `url(${images[activeIndex]})`,
                            backgroundPosition: `${bgPos.x}% ${bgPos.y}%`,
                            backgroundSize: '250%', // High Zoom Level
                            backgroundColor: '#000'
                        }}
                    >
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_5px_rgba(255,0,0,0.8)]"></div>
                    </div>
                )}
            </div>
        </div>

        {/* Large Thumbnail Strip */}
        <div className="h-32 bg-neutral-900/80 backdrop-blur border-t border-white/10 flex items-center justify-center p-4 z-50">
             <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide max-w-full px-4 items-center">
                 {images.map((img, idx) => (
                     <button
                        key={idx}
                        onClick={() => setActiveIndex(idx)}
                        className={`relative flex-shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border-2 transition-all duration-300 transform ${activeIndex === idx ? 'border-white scale-110 shadow-[0_0_25px_rgba(255,255,255,0.3)] z-10 -translate-y-2' : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/50 hover:scale-105'}`}
                     >
                         <img src={img} alt="" className="w-full h-full object-cover" />
                     </button>
                 ))}
             </div>
        </div>
    </div>
  );
};

export default ProductImageGallery;