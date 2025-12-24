import React, { useState, useEffect, useRef } from 'react';
import { verifyProductIdentity, getProducts, getProductStockForOwner, getUsersByRole, validateSignedQR } from '../services/storage';
import { UserRole } from '../types';
import { Html5Qrcode } from 'html5-qrcode';
import { GoogleGenAI, Type } from "@google/genai";

interface Message {
    sender: 'bot' | 'user';
    text: string;
    googleQuery?: string;
}

const AskeChatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<'helper' | 'verify'>('helper');
  
  // Animation State
  const [isRetracted, setIsRetracted] = useState(false);
  const [isButtonExpanded, setIsButtonExpanded] = useState(true);

  // Chat Logic State
  const [verifyMessages, setVerifyMessages] = useState<Message[]>([]);
  const [verifyStep, setVerifyStep] = useState<'input-code' | 'scan' | 'verifying' | 'success' | 'fail'>('input-code');
  const [inputCode, setInputCode] = useState('');
  
  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  
  // Helper Logic State
  const [helperMessages, setHelperMessages] = useState<Message[]>([]);
  const [helperInput, setHelperInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Closing & Reset Logic
  useEffect(() => {
    if (!isOpen) {
        // RESET STATE when closed to prevent scanner from persisting
        if (isScanning) {
            stopScanner();
        }
        // Reset verify step to input so it doesn't default to scan on reopen
        if (activeMode === 'verify') {
             setVerifyStep('input-code');
             setVerifyMessages([]);
             setInputCode('');
        }

        setIsButtonExpanded(true);
        const timer = setTimeout(() => {
            setIsButtonExpanded(false);
        }, 5000);
        return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-Greeting for Helper
  useEffect(() => {
    if (isOpen && activeMode === 'helper' && helperMessages.length === 0) {
        setHelperMessages([{sender: 'bot', text: "Hello. I am Aske, your intelligent concierge. Ask me about our collection, dimensions, or styling advice."}]);
    }
  }, [isOpen, activeMode]);

  // Verify Mode Transition
  useEffect(() => {
    if (activeMode === 'verify') {
        setIsRetracted(false);
        setVerifyMessages([]);
        setVerifyStep('input-code');
        setInputCode('');
        stopScanner(); // Ensure scanner is off when entering tab
        
        const t1 = setTimeout(() => {
            setIsRetracted(true);
            setVerifyMessages([{ sender: 'bot', text: "Secure Verification Protocol Initiated. Please enter your unique Authentication Code." }]);
        }, 800); 
        
        return () => clearTimeout(t1);
    } else {
        stopScanner();
    }
  }, [activeMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [verifyMessages, helperMessages, activeMode, isTyping]);

  // Cleanup Scanner on Unmount
  useEffect(() => {
      return () => {
          stopScanner();
      };
  }, []);

  const stopScanner = () => {
      // Always turn off scanning flag immediately
      setIsScanning(false);

      if (scannerRef.current) {
          if (scannerRef.current.isScanning) {
              scannerRef.current.stop().then(() => {
                  try {
                    scannerRef.current?.clear();
                  } catch (e) {
                    // ignore
                  }
              }).catch(err => {
                  console.warn("Scanner stop warning:", err);
              });
          } else {
              try {
                scannerRef.current.clear();
              } catch (e) {
                 // ignore
              }
          }
      }
  };

  const startScanner = () => {
    setScannerError('');
    setIsScanning(true); // Mounts the div
    
    // Slight delay to ensure DOM element with id="reader" is rendered by React
    setTimeout(async () => {
        try {
            const element = document.getElementById("reader");
            if (!element) {
                // If element is gone (user closed modal or switched tab), abort
                return; 
            }

            const scanner = new Html5Qrcode("reader", { 
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                verbose: false
            });
            scannerRef.current = scanner;

            const config = { 
                fps: 20, 
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };

            await scanner.start(
                { facingMode: "environment" }, 
                config, 
                (decodedText) => {
                    handleScanSuccess(decodedText);
                },
                (errorMessage) => {
                    // Ignore frame parse errors
                }
            );
        } catch (err: any) {
            console.error("Scanner Error:", err);
            setScannerError("Camera access denied or unavailable.");
            setIsScanning(false); 
            setVerifyMessages(prev => [...prev, { sender: 'bot', text: "Error: Camera access required for scanning." }]);
        }
    }, 100);
  };

  const handleScanSuccess = (decodedText: string) => {
      if (navigator.vibrate) navigator.vibrate(200);
      stopScanner();
      
      // NEW VALIDATION LOGIC
      const validation = validateSignedQR(decodedText);

      if (!validation.valid) {
          setVerifyStep('fail');
          setVerifyMessages(prev => [...prev, { sender: 'user', text: "[Scanned QR]" }]);
          setTimeout(() => {
              setVerifyMessages(prev => [...prev, { sender: 'bot', text: `SECURITY ALERT: ${validation.error}` }]);
          }, 500);
          return;
      }

      // If valid, extract clean serial number
      const cleanSerial = validation.serialNumber!;
      
      setVerifyStep('verifying');
      setVerifyMessages(prev => [...prev, { sender: 'user', text: `[Scanned ID]: ${cleanSerial}` }]);
      
      setTimeout(() => {
          verifyProcess(cleanSerial);
      }, 800);
  };

  // --- Image Pre-Processing for Manual Upload ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (!ctx) return;

              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);

              // Apply Contrast & Grayscale Filters
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const data = imageData.data;
              const factor = (259 * (128 + 255)) / (255 * (259 - 128));

              for (let i = 0; i < data.length; i += 4) {
                  const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                  let color = avg;
                  color = factor * (color - 128) + 128;
                  color = Math.max(0, Math.min(255, color));
                  data[i] = color;
                  data[i + 1] = color;
                  data[i + 2] = color;
              }
              ctx.putImageData(imageData, 0, 0);

              canvas.toBlob(async (blob) => {
                  if (blob) {
                      const processedFile = new File([blob], "processed_qr.png", { type: "image/png" });
                      try {
                          const scanner = new Html5Qrcode("reader-hidden");
                          const result = await scanner.scanFileV2(processedFile, true);
                          handleScanSuccess(result.decodedText);
                      } catch (err) {
                          setVerifyMessages(prev => [...prev, { sender: 'bot', text: "Could not detect QR code in image. Try a clearer photo." }]);
                      }
                  }
              }, 'image/png');
          };
          img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
  };

  // --- Verification Logic ---
  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.length < 5) return;
    
    setVerifyMessages(prev => [...prev, { sender: 'user', text: inputCode }]);
    setTimeout(() => {
       setVerifyStep('scan');
       setVerifyMessages(prev => [...prev, { sender: 'bot', text: "Code received. Activate scanner to verify product signature." }]);
    }, 500);
  };
  
  const verifyProcess = async (scannedSerial: string) => {
     const result = await verifyProductIdentity(scannedSerial, inputCode);
     
     if (result.valid) {
         setVerifyStep('success');
         setVerifyMessages(prev => [...prev, { sender: 'bot', text: `Verified: ${scannedSerial}\nProduct Identity Confirmed.` }]);
     } else {
         setVerifyStep('fail');
         setVerifyMessages(prev => [...prev, { sender: 'bot', text: `Hash Mismatch.\nScanned: ${scannedSerial}\nProvided Auth: ${inputCode}` }]);
     }
  };

  // --- Helper Chat Logic with Gemini ---
  const handleHelperSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!helperInput.trim()) return;
      
      const userText = helperInput.trim();
      setHelperMessages(prev => [...prev, { sender: 'user', text: userText }]);
      setHelperInput('');
      setIsTyping(true);

      try {
          // 1. Gather Context
          const products = getProducts();
          const sellers = getUsersByRole(UserRole.SELLER);
          
          const inventoryList = products.map(p => {
             let totalStock = 0;
             sellers.forEach(s => {
                 totalStock += getProductStockForOwner(p.id, s.id, p.isSerialized);
             });
             return `- ${p.name} (Type: ${p.isSerialized ? 'Serialized Unique Item' : 'Bulk Item'}, Stock: ${totalStock}, Desc: ${p.description || 'Premium Luxury Item'})`;
          }).join('\n');

          // 2. Call Gemini API
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: userText,
             config: {
                 systemInstruction: `You are 'Aske', the intelligent AI concierge for 'Lallan Shop'.
                 Your tone is sophisticated, helpful, and concise.
                 
                 Current Inventory:
                 ${inventoryList}
                 
                 Instructions:
                 1. Answer the user's question based on the inventory.
                 2. If they ask about dimensions/fit, infer from the name (e.g. 'Watch' fits wrist, 'Sofa' needs room).
                 3. If discussing a specific product from our inventory, you MUST include its name in the 'productName' field.
                 4. If unsure or item is missing, suggest contacting the Admin via the Messaging Drawer.
                 5. Response MUST be in JSON format.`,
                 responseMimeType: "application/json",
                 responseSchema: {
                     type: Type.OBJECT,
                     properties: {
                         response: { type: Type.STRING },
                         productName: { type: Type.STRING, nullable: true }
                     }
                 }
             }
          });

          const jsonRes = JSON.parse(response.text || '{}');
          
          setHelperMessages(prev => [...prev, { 
              sender: 'bot', 
              text: jsonRes.response || "I am processing your request...", 
              googleQuery: jsonRes.productName 
          }]);

      } catch (error) {
          console.error("AI Error:", error);
          setHelperMessages(prev => [...prev, { sender: 'bot', text: "I am currently unable to access the neural network. Please try again or contact Admin." }]);
      } finally {
          setIsTyping(false);
      }
  };

  const LiquidBranding = ({ collapsed }: { collapsed: boolean }) => {
    return (
      <div className="flex items-center justify-center font-display font-bold text-2xl tracking-tight h-12 select-none overflow-hidden">
        {["A", "s", "l", "i", " ", "a", "n", "d", " ", "F", "a", "k", "e"].map((char, index) => {
          const isKept = [0, 1, 11, 12].includes(index); // Aske
          return (
            <span
              key={index}
              className={`inline-block whitespace-pre transition-all duration-[1200ms] ease-[cubic-bezier(0.77,0,0.175,1)] ${isKept ? 'text-white' : 'text-neutral-500'}`}
              style={{
                  maxWidth: collapsed && !isKept ? '0px' : '0.7em',
                  opacity: collapsed && !isKept ? 0 : 1,
                  filter: collapsed && !isKept ? 'blur(8px)' : 'blur(0)',
                  transform: collapsed && !isKept ? 'scale(0.8)' : 'scale(1)',
              }}
            >
              {char}
            </span>
          );
        })}
      </div>
    );
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-50 flex items-center justify-center h-14 bg-white text-black rounded-full shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-105 transition-all duration-500 group overflow-hidden px-5"
      >
        <div className="relative z-10 flex font-display font-bold text-lg tracking-tight select-none">
             {["A", "s", "l", "i", " ", "F", "a", "k", "e"].map((char, index) => {
                const isKept = [0, 1, 7, 8].includes(index);
                const isCollapsed = !isButtonExpanded && !isKept;
                return (
                    <span 
                        key={index}
                        className="inline-block whitespace-pre overflow-hidden transition-all duration-[1000ms] ease-[cubic-bezier(0.77,0,0.175,1)]"
                        style={{
                            maxWidth: isCollapsed ? '0px' : '0.8em',
                            opacity: isCollapsed ? 0 : 1,
                            transform: isCollapsed ? 'translateY(10px) scale(0.5)' : 'translateY(0) scale(1)',
                        }}
                    >
                        {char}
                    </span>
                );
            })}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-50 w-80 md:w-96 bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl animate-in slide-in-from-bottom-10 duration-500 overflow-hidden flex flex-col h-[600px]">
      
      {/* Header */}
      <div className="p-4 bg-white/5 border-b border-white/5 space-y-4 relative z-20">
         <div className="flex justify-between items-center">
            <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-500">
                {activeMode === 'helper' ? 'Lallan Intelligence' : 'Aske Verification'}
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </button>
         </div>

         {/* Mode Toggle */}
         <div className="relative bg-black rounded-full p-1 flex h-10 border border-white/10">
            <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full transition-all duration-500 ease-[cubic-bezier(0.77,0,0.175,1)] shadow-[0_0_15px_rgba(255,255,255,0.3)] ${activeMode === 'helper' ? 'left-1' : 'left-[calc(50%+2px)]'}`} ></div>
            <button onClick={() => setActiveMode('helper')} className={`flex-1 relative z-10 text-xs font-bold uppercase tracking-wide transition-colors duration-300 ${activeMode === 'helper' ? 'text-black' : 'text-neutral-500 hover:text-neutral-300'}`}>Helper</button>
            <button onClick={() => setActiveMode('verify')} className={`flex-1 relative z-10 text-xs font-bold uppercase tracking-wide transition-colors duration-300 ${activeMode === 'verify' ? 'text-black' : 'text-neutral-500 hover:text-neutral-300'}`}>Authenticity</button>
         </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden bg-neutral-900/50">
          
          {/* CAMERA OVERLAY - CONDITIONALLY RENDERED ONLY WHEN SCANNING IS TRUE */}
          {activeMode === 'verify' && isScanning && (
              <div className="absolute inset-0 z-30 bg-black flex flex-col animate-in fade-in duration-300">
                  <div className="relative flex-1 overflow-hidden">
                      <div id="reader" className="w-full h-full object-cover"></div>
                      
                      {/* Custom Scanner UI Overlay */}
                      <div className="absolute inset-0 pointer-events-none z-10">
                          <div className="absolute inset-0 border-[40px] border-black/50"></div>
                          <div className="absolute top-[20%] left-[10%] right-[10%] bottom-[20%] border-2 border-white/30 rounded-lg flex items-center justify-center overflow-hidden">
                              <div className="w-[120%] h-1 bg-red-500/80 shadow-[0_0_15px_rgba(239,68,68,1)] animate-[scan_1.5s_ease-in-out_infinite]"></div>
                          </div>
                          <div className="absolute bottom-10 w-full text-center text-xs text-white/70 font-mono tracking-widest animate-pulse">
                              AI VISION ACTIVE
                          </div>
                      </div>
                  </div>
                  <div className="p-4 bg-neutral-900 border-t border-white/10 flex gap-3">
                      <button 
                        onClick={stopScanner}
                        className="flex-1 py-3 bg-neutral-800 text-white rounded-xl font-bold hover:bg-neutral-700"
                      >
                          Cancel Scan
                      </button>
                      {/* Manual Upload Button */}
                      <div className="relative">
                          <button className="h-full px-4 bg-neutral-800 text-neutral-400 rounded-xl hover:bg-neutral-700 border border-white/5">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                              </svg>
                          </button>
                          <input 
                            type="file" 
                            ref={fileInputRef}
                            accept="image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={handleFileUpload}
                          />
                      </div>
                  </div>
              </div>
          )}

          {/* HIDDEN READER FOR FILE SCANS */}
          <div id="reader-hidden" className="hidden"></div>

          {/* --- MODE 1: PRODUCT HELPER --- */}
          {activeMode === 'helper' && (
              <div className="absolute inset-0 flex flex-col animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                      {helperMessages.map((msg, idx) => (
                          <div key={idx} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} mb-4`}>
                              <div className={`relative max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-lg backdrop-blur-md ${msg.sender === 'user' ? 'bg-white text-black rounded-tr-none' : 'bg-neutral-800/80 text-neutral-200 border border-white/10 rounded-tl-none'}`}>
                                  <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
                                  
                                  {/* Google Search Integration */}
                                  {msg.sender === 'bot' && msg.googleQuery && (
                                      <div className="mt-3 pt-2 border-t border-white/10 flex justify-end">
                                          <a 
                                              href={`https://www.google.com/search?q=${encodeURIComponent(msg.googleQuery)}`} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1.5 bg-white text-black px-3 py-1.5 rounded-full text-[10px] font-bold hover:bg-neutral-200 transition-colors shadow-sm group"
                                          >
                                              <div className="w-3 h-3 bg-contain bg-center bg-no-repeat" style={{backgroundImage: 'url("https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg")'}}></div>
                                              Search {msg.googleQuery}
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-neutral-500 group-hover:text-black">
                                                <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                                              </svg>
                                          </a>
                                      </div>
                                  )}
                              </div>
                          </div>
                      ))}
                      
                      {isTyping && (
                          <div className="flex justify-start">
                              <div className="p-3 bg-neutral-800/80 backdrop-blur-md rounded-2xl rounded-tl-none border border-white/10 flex gap-1">
                                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                              </div>
                          </div>
                      )}
                      
                      <div ref={messagesEndRef} />
                  </div>
                  <form onSubmit={handleHelperSubmit} className="p-3 border-t border-white/5 flex gap-2">
                      <input type="text" placeholder="Ask Aske..." disabled={isTyping} className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-50" value={helperInput} onChange={e => setHelperInput(e.target.value)} />
                      <button type="submit" disabled={isTyping} className="p-3 bg-white text-black rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                      </button>
                  </form>
              </div>
          )}

          {/* --- MODE 2: AUTHENTICITY CHECK --- */}
          {activeMode === 'verify' && (
              <div className="absolute inset-0 flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="pt-6 pb-2 border-b border-white/5 bg-gradient-to-b from-black/40 to-transparent">
                      <LiquidBranding collapsed={isRetracted} />
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                      {verifyMessages.map((msg, idx) => (
                          <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-lg ${msg.sender === 'user' ? 'bg-white text-black rounded-tr-none' : 'bg-black/60 text-neutral-200 border border-white/10 rounded-tl-none font-mono backdrop-blur-sm'}`}>
                                  {msg.text}
                              </div>
                          </div>
                      ))}
                      
                      {verifyStep === 'verifying' && (
                        <div className="flex justify-start">
                            <div className="p-3 bg-neutral-800 rounded-2xl rounded-tl-none border border-white/5 flex gap-1">
                                <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                            </div>
                        </div>
                      )}

                      {verifyStep === 'success' && (
                        <div className="p-6 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex flex-col items-center text-center animate-in zoom-in duration-500">
                            <div className="w-12 h-12 rounded-full bg-emerald-500 text-black flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(16,185,129,0.3)]"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></div>
                            <h3 className="text-emerald-400 font-display font-bold tracking-wide">AUTHENTIC</h3>
                            <p className="text-emerald-200/60 text-[10px] mt-1 uppercase tracking-widest">Verified by Aske</p>
                        </div>
                      )}
                      {verifyStep === 'fail' && (
                        <div className="p-6 bg-red-950/30 border border-red-500/30 rounded-2xl flex flex-col items-center text-center animate-in zoom-in duration-500">
                            <div className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(239,68,68,0.3)]"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></div>
                            <h3 className="text-red-400 font-display font-bold tracking-wide">COUNTERFEIT ALERT</h3>
                            <p className="text-red-200/60 text-[10px] mt-1 uppercase tracking-widest">Hash Mismatch Detected</p>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                  </div>

                  {/* Actions */}
                  <div className="p-4 border-t border-white/5">
                      {verifyStep === 'input-code' && (
                        <form onSubmit={handleCodeSubmit} className="flex gap-2">
                            <input type="text" value={inputCode} onChange={(e) => setInputCode(e.target.value)} placeholder="Auth Code (e.g. 8f42a...)" className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-white/30 font-mono transition-colors" autoFocus />
                            <button type="submit" className="px-4 bg-white text-black rounded-xl font-bold hover:bg-neutral-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg></button>
                        </form>
                      )}

                      {verifyStep === 'scan' && (
                        <div className="flex flex-col gap-2">
                            <button onClick={startScanner} className="w-full py-3 bg-neutral-800 text-white border border-white/10 rounded-xl hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 group shadow-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 group-hover:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                                Activate Auto-Capture
                            </button>
                            {scannerError && <p className="text-red-400 text-xs text-center">{scannerError} <button onClick={startScanner} className="underline">Retry</button></p>}
                        </div>
                      )}
                      
                      {(verifyStep === 'success' || verifyStep === 'fail') && (
                          <button onClick={() => { setVerifyStep('input-code'); setVerifyMessages([]); setInputCode(''); }} className="w-full py-3 bg-neutral-800 text-neutral-400 font-medium rounded-xl hover:text-white transition-colors">Start New Verification</button>
                      )}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default AskeChatbot;