import React, { useState, useEffect, useRef } from 'react';
import { User, Product, UserRole, ProductUnit, CartItem } from '../types';
import { getUsersByRole, saveProductBatch, getProducts, getAvailableSerialNumbers, updateProductUnits, generateId, getManufacturerDispatchHistory, deleteProductUnit, deleteProduct, getProductUnits, transferBulkStock, addToCart, getCart, removeFromCart, clearCart, getBulkStock, generateNextSerialBatch, getSignedQRData } from '../services/storage';
import CartDrawer from './CartDrawer';

interface Props {
  user: User;
}

const ManufacturerView: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'produce' | 'distribute' | 'inventory'>('produce');
  
  // --- PRODUCTION STATE ---
  const [prodName, setProdName] = useState('');
  const [isSerialized, setIsSerialized] = useState(true);
  const [qty, setQty] = useState(1);
  const [mfgDate, setMfgDate] = useState(new Date().toISOString().split('T')[0]);
  const [productImages, setProductImages] = useState<string[]>([]);
  
  // Replaced manual entry with generated list
  const [generatedSerials, setGeneratedSerials] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- DISTRIBUTION STATE ---
  const [distMode, setDistMode] = useState<'new' | 'history'>('new');
  const [historyItems, setHistoryItems] = useState<(ProductUnit & { productName: string, sellerName: string })[]>([]);
  
  // Cart / Staging
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [sellers, setSellers] = useState<User[]>([]);
  const [targetSellerId, setTargetSellerId] = useState('');
  
  // Add to Cart Modal State
  const [selectedProductForCart, setSelectedProductForCart] = useState<Product | null>(null);
  const [cartQtyInput, setCartQtyInput] = useState(1);
  const [availableUnitsForCart, setAvailableUnitsForCart] = useState<ProductUnit[]>([]);
  const [selectedUnitIdsForCart, setSelectedUnitIdsForCart] = useState<Set<string>>(new Set());

  // --- INVENTORY MANAGEMENT STATE ---
  const [inventoryProducts, setInventoryProducts] = useState<(Product & { totalCount: number })[]>([]);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedProductUnits, setExpandedProductUnits] = useState<ProductUnit[]>([]);


  // Handle Qty Change
  const handleQtyChange = (newQty: number) => {
    let val = Math.max(1, newQty);
    if (isSerialized && val > 100) val = 100; // Cap batch size for performance
    setQty(val);
    setGeneratedSerials([]); // Reset generated serials if qty changes
  };

  const handleGenerateSerials = () => {
      try {
          const serials = generateNextSerialBatch(qty);
          setGeneratedSerials(serials);
      } catch (e: any) {
          alert(e.message);
      }
  };

  // Image Handling
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          // Explicitly cast to File[] to avoid 'unknown' type inference in some TS environments
          const files = Array.from(e.target.files) as File[];
          const remainingSlots = 5 - productImages.length;
          const filesToProcess = files.slice(0, remainingSlots);
          
          if (files.length > remainingSlots) {
              alert(`Only ${remainingSlots} more image(s) allowed.`);
          }

          filesToProcess.forEach(file => {
              const reader = new FileReader();
              reader.onload = (ev) => {
                  const img = new Image();
                  img.onload = () => {
                      // Resize logic to save LocalStorage space (Max 600px width/height)
                      const canvas = document.createElement('canvas');
                      const ctx = canvas.getContext('2d');
                      const maxWidth = 600;
                      const maxHeight = 600;
                      let width = img.width;
                      let height = img.height;

                      if (width > height) {
                          if (width > maxWidth) {
                              height *= maxWidth / width;
                              width = maxWidth;
                          }
                      } else {
                          if (height > maxHeight) {
                              width *= maxHeight / height;
                              height = maxHeight;
                          }
                      }

                      canvas.width = width;
                      canvas.height = height;
                      ctx?.drawImage(img, 0, 0, width, height);
                      
                      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                      setProductImages(prev => [...prev, compressedBase64]);
                  };
                  img.src = ev.target?.result as string;
              };
              reader.readAsDataURL(file);
          });
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
      setProductImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleProductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSerialized && generatedSerials.length === 0) {
      alert("Please click 'Generate Serial Numbers' before registering.");
      return;
    }
    
    setIsSubmitting(true);

    const productId = generateId();
    const product: Product = {
      id: productId,
      name: prodName,
      manufacturerId: user.id,
      isSerialized: isSerialized,
      images: productImages
    };

    const units: Partial<ProductUnit>[] = isSerialized ? generatedSerials.map(sn => ({
      id: generateId(),
      productId: productId,
      serialNumber: sn,
      status: 'IN_FACTORY',
      manufacturerId: user.id,
      manufacturingDate: mfgDate
    })) : [];

    // Await the async hash generation inside storage
    await saveProductBatch(product, qty, units);
    
    setIsSubmitting(false);
    // Reset
    setProdName('');
    setIsSerialized(true);
    setQty(1);
    setGeneratedSerials([]);
    setProductImages([]);
    alert("Production batch registered successfully.");
  };

  // --- DISTRIBUTION LOGIC ---

  useEffect(() => {
    refreshData();
  }, [activeTab, user.id, distMode]);

  const refreshData = () => {
    // Refresh Cart
    setCartItems(getCart(user.id));
    setSellers(getUsersByRole(UserRole.SELLER));
    
    if (distMode === 'history') {
      const history = getManufacturerDispatchHistory(user.id);
      setHistoryItems(history);
    }
    
    if (activeTab === 'inventory') {
        const allProds = getProducts().filter(p => p.manufacturerId === user.id);
        const allUnits = getProductUnits();
        const allBulk = getBulkStock();
        
        const prodsWithCount = allProds.map(p => {
            if (p.isSerialized) {
                return {
                    ...p,
                    totalCount: allUnits.filter(u => u.productId === p.id).length
                };
            } else {
                // Get Bulk Stock
                const stock = allBulk.find(s => s.productId === p.id && s.ownerId === user.id);
                return {
                    ...p,
                    totalCount: stock ? stock.quantity : 0
                };
            }
        });
        setInventoryProducts(prodsWithCount);
    }
  };

  const openAddCartModal = (product: Product) => {
     setSelectedProductForCart(product);
     if (product.isSerialized) {
         // Fetch specific available units
         const units = getAvailableSerialNumbers(product.id, 'IN_FACTORY', 'manufacturerId', user.id);
         setAvailableUnitsForCart(units);
         setSelectedUnitIdsForCart(new Set());
     }
     setCartQtyInput(1);
  };

  const toggleUnitSelection = (unitId: string) => {
      const newSet = new Set(selectedUnitIdsForCart);
      if (newSet.has(unitId)) newSet.delete(unitId);
      else newSet.add(unitId);
      setSelectedUnitIdsForCart(newSet);
  };

  const handleConfirmAddToCart = (e: React.FormEvent) => {
     e.preventDefault();
     if (!selectedProductForCart) return;

     let finalQty = cartQtyInput;
     let unitIds: string[] = [];

     if (selectedProductForCart.isSerialized) {
         if (selectedUnitIdsForCart.size === 0) {
             alert("Please select at least one serial number.");
             return;
         }
         finalQty = selectedUnitIdsForCart.size;
         unitIds = Array.from(selectedUnitIdsForCart);
     } else {
         // BULK VALIDATION LOGIC
         const allBulk = getBulkStock();
         const stockRecord = allBulk.find(s => s.productId === selectedProductForCart.id && s.ownerId === user.id);
         const availablePhysical = stockRecord ? stockRecord.quantity : 0;
         
         const currentCart = getCart(user.id);
         const existingInCart = currentCart.find(c => c.productId === selectedProductForCart.id);
         const cartQty = existingInCart ? existingInCart.quantity : 0;

         if (finalQty + cartQty > availablePhysical) {
             alert(`Insufficient Bulk Stock.\nAvailable: ${availablePhysical}\nAlready in Cart: ${cartQty}\nRequested to Add: ${finalQty}`);
             return;
         }
     }

     const item: CartItem = {
         id: generateId(),
         productId: selectedProductForCart.id,
         productName: selectedProductForCart.name,
         quantity: finalQty,
         isSerialized: selectedProductForCart.isSerialized,
         unitIds: unitIds.length > 0 ? unitIds : undefined
     };
     
     addToCart(user.id, item);
     setCartItems(getCart(user.id));
     setSelectedProductForCart(null); // Close modal
     setIsCartOpen(true); // Open drawer feedback
  };

  const handleRemoveFromCart = (id: string) => {
      removeFromCart(user.id, id);
      setCartItems(getCart(user.id));
  };

  const handleDispatchCheckout = () => {
      setShowDispatchModal(true);
      setIsCartOpen(false);
  };

  const confirmDispatch = () => {
      if (!targetSellerId) return;
      
      cartItems.forEach(item => {
          if (item.isSerialized) {
              // Dispatch specific selected units
              if (item.unitIds && item.unitIds.length > 0) {
                  const allUnits = getProductUnits();
                  const updatedUnits: ProductUnit[] = [];
                  
                  item.unitIds.forEach(id => {
                      const u = allUnits.find(unit => unit.id === id);
                      if (u && u.status === 'IN_FACTORY') {
                          updatedUnits.push({
                              ...u,
                              status: 'AT_SELLER' as const,
                              sellerId: targetSellerId,
                              dateSentToSeller: new Date().toISOString().split('T')[0]
                          });
                      }
                  });
                  updateProductUnits(updatedUnits);
              } else {
                  console.warn("No unit IDs found for serialized dispatch.");
              }
          } else {
              // Bulk Transfer
              transferBulkStock(item.productId, user.id, targetSellerId, item.quantity);
          }
      });

      clearCart(user.id);
      setCartItems([]);
      setShowDispatchModal(false);
      setTargetSellerId('');
      alert("Dispatch successful. Items transferred to Seller.");
      refreshData();
  };

  // --- INVENTORY LOGIC ---
  const toggleExpandProduct = (productId: string) => {
      if (expandedProductId === productId) {
          setExpandedProductId(null);
          setExpandedProductUnits([]);
      } else {
          setExpandedProductId(productId);
          const allUnits = getProductUnits();
          setExpandedProductUnits(allUnits.filter(u => u.productId === productId));
      }
  };

  const handleDeleteUnit = (unitId: string) => {
      if (confirm('Permanently delete this Serial Number? This will return the number to the available pool.')) {
          deleteProductUnit(unitId);
          // Refresh
          const updatedUnits = expandedProductUnits.filter(u => u.id !== unitId);
          setExpandedProductUnits(updatedUnits);
          
          setInventoryProducts(prev => prev.map(p => {
              if (p.id === expandedProductId) {
                  return { ...p, totalCount: p.totalCount - 1 };
              }
              return p;
          }));
      }
  };

  const handleDeleteProduct = (productId: string) => {
      if (deleteProduct(productId)) {
          setInventoryProducts(prev => prev.filter(p => p.id !== productId));
          alert("Product definition deleted.");
      } else {
          alert("Cannot delete product. Ensure all serial numbers or stock are deleted first.");
      }
  };


  return (
    <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Tabs */}
      <div className="flex justify-center mb-10">
        <div className="bg-neutral-900/80 backdrop-blur border border-white/10 p-1 rounded-xl inline-flex">
          <button
            onClick={() => setActiveTab('produce')}
            className={`px-8 py-3 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'produce' ? 'bg-white text-black shadow-lg' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Production
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-8 py-3 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'inventory' ? 'bg-white text-black shadow-lg' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Inventory & QR
          </button>
          <button
            onClick={() => setActiveTab('distribute')}
            className={`px-8 py-3 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'distribute' ? 'bg-white text-black shadow-lg' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Distribution
          </button>
        </div>
      </div>

      {activeTab === 'produce' && (
        <div className="bg-neutral-900/50 backdrop-blur border border-white/5 rounded-3xl p-8">
           <div className="mb-8 border-b border-white/5 pb-4">
             <h2 className="text-2xl font-display font-bold text-white mb-1">Batch Production</h2>
             <p className="text-neutral-500 text-sm">Register inventory. Serialized items will use Admin-managed sequential numbers.</p>
           </div>

           <form onSubmit={handleProductionSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Product Name</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-white/40 focus:ring-0 outline-none transition"
                    value={prodName}
                    onChange={e => setProdName(e.target.value)}
                    placeholder="e.g. Noir Chronograph"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Mfg Date</label>
                  <input
                    type="date"
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-white/40 focus:ring-0 outline-none transition [color-scheme:dark]"
                    value={mfgDate}
                    onChange={e => setMfgDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Image Upload Section */}
              <div className="space-y-3 p-4 bg-black/30 rounded-xl border border-white/5">
                  <div className="flex justify-between items-center">
                      <label className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Product Images (Max 5)</label>
                      <span className="text-xs text-neutral-500">{productImages.length}/5 Uploaded</span>
                  </div>
                  
                  <div className="grid grid-cols-5 gap-3">
                      {productImages.map((img, idx) => (
                          <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group">
                              <img src={img} alt="Preview" className="w-full h-full object-cover" />
                              <button 
                                type="button" 
                                onClick={() => removeImage(idx)}
                                className="absolute top-1 right-1 p-1 bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                          </div>
                      ))}
                      
                      {productImages.length < 5 && (
                          <button 
                            type="button" 
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-square rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center text-neutral-500 hover:text-white hover:border-white/40 transition-colors"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                              <span className="text-[9px] uppercase tracking-wide">Add</span>
                          </button>
                      )}
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    multiple 
                    accept="image/*"
                    onChange={handleImageSelect}
                  />
              </div>

              {/* Serialization Toggle */}
              <div className="flex items-center gap-4 bg-black/30 p-4 rounded-xl border border-white/5">
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={isSerialized}
                        onChange={e => { setIsSerialized(e.target.checked); setGeneratedSerials([]); }}
                    />
                    <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white"></div>
                    <span className="ml-3 text-sm font-medium text-white">Track by Serial Number?</span>
                 </label>
                 <p className="text-xs text-neutral-500">
                    {isSerialized ? 'System generates unique numeric IDs.' : 'Bulk tracking by total quantity only.'}
                 </p>
              </div>

              <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Batch Quantity</label>
                  <div className="flex items-center gap-4">
                     <button 
                        type="button" 
                        onClick={() => handleQtyChange(Math.max(1, qty - 1))} 
                        className="w-12 h-12 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 font-bold transition-colors border border-white/5"
                     >
                        -
                     </button>
                     <input
                      type="number"
                      min="1"
                      max={isSerialized ? 100 : 1000}
                      value={qty}
                      onChange={e => handleQtyChange(parseInt(e.target.value) || 1)}
                      className="flex-1 bg-black/50 border border-white/10 rounded-xl py-3 text-center text-white font-mono text-xl focus:outline-none focus:border-white/30 transition-colors"
                    />
                    <button 
                        type="button" 
                        onClick={() => handleQtyChange(qty + 1)} 
                        className="w-12 h-12 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 font-bold transition-colors border border-white/5"
                    >
                        +
                    </button>
                  </div>
              </div>

              {/* Automated Serial Generation Area */}
              {isSerialized && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 bg-neutral-800/20 p-6 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-white font-bold text-sm">Automated Serialization</h3>
                            <p className="text-xs text-neutral-500">Generates next available numbers from Admin range.</p>
                        </div>
                        <button 
                            type="button"
                            onClick={handleGenerateSerials}
                            className="px-6 py-2 bg-white text-black text-sm font-bold rounded-lg hover:bg-neutral-200 transition-colors shadow-lg"
                        >
                            {generatedSerials.length > 0 ? 'Regenerate Numbers' : 'Generate Serial Numbers'}
                        </button>
                    </div>

                    {generatedSerials.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-[200px] overflow-y-auto p-2 bg-black/40 rounded-xl border border-white/5">
                            {generatedSerials.map((sn, idx) => (
                                <div key={idx} className="bg-neutral-900 border border-white/10 rounded p-2 text-center">
                                    <span className="text-xs font-mono text-emerald-400 font-bold">{sn}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
              )}

              <button 
                type="submit" 
                disabled={isSubmitting || (isSerialized && generatedSerials.length === 0)}
                className="w-full py-4 bg-white text-black font-display font-bold rounded-xl hover:bg-neutral-200 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Registering...' : 'Register Batch'}
              </button>
           </form>
        </div>
      )}

      {activeTab === 'inventory' && (
          <div className="bg-neutral-900/50 backdrop-blur border border-white/5 rounded-3xl p-6">
             <h2 className="text-lg font-display font-bold text-white mb-6">Product Management & QR Generation</h2>
             
             <div className="space-y-4">
                 {inventoryProducts.length === 0 ? (
                     <div className="text-center py-12 text-neutral-600">No products registered.</div>
                 ) : (
                     inventoryProducts.map(p => (
                         <div key={p.id} className="bg-black/30 border border-white/5 rounded-2xl overflow-hidden">
                             <div className="p-4 flex items-center justify-between">
                                 <div className="flex items-center gap-4">
                                     <div className="w-16 h-16 rounded-xl bg-neutral-800 flex items-center justify-center text-white font-bold overflow-hidden border border-white/10">
                                         {p.images && p.images.length > 0 ? (
                                             <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                                         ) : (
                                             p.name.charAt(0)
                                         )}
                                     </div>
                                     <div>
                                         <h3 className="text-white font-medium flex items-center gap-2">
                                            {p.name}
                                            <span className="text-[10px] uppercase border border-white/10 px-1.5 rounded text-neutral-400">
                                                {p.isSerialized ? 'Serialized' : 'Bulk'}
                                            </span>
                                         </h3>
                                         <p className="text-xs text-neutral-500">
                                             {p.isSerialized 
                                                ? `Total Units: ${p.totalCount}` 
                                                : `Available Stock: ${p.totalCount}`
                                             }
                                         </p>
                                     </div>
                                 </div>
                                 <div className="flex items-center gap-3">
                                     {p.isSerialized && (
                                        <button 
                                            onClick={() => toggleExpandProduct(p.id)}
                                            className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            {expandedProductId === p.id ? 'Hide Codes' : 'Show QR Codes'}
                                        </button>
                                     )}
                                     <button 
                                        onClick={() => handleDeleteProduct(p.id)}
                                        className="text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                                     >
                                        Delete Product
                                     </button>
                                 </div>
                             </div>

                             {/* Expanded Serial Numbers */}
                             {p.isSerialized && expandedProductId === p.id && (
                                 <div className="border-t border-white/5 bg-neutral-950/50 p-4">
                                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                         {expandedProductUnits.map(unit => (
                                             <div key={unit.id} className="flex flex-col p-4 rounded-xl bg-neutral-900 border border-white/5 relative group">
                                                 <div className="flex justify-between items-start mb-3">
                                                     <div>
                                                         <p className="font-mono text-sm font-bold text-white">{unit.serialNumber}</p>
                                                         <p className="text-[10px] text-neutral-500 uppercase mt-1">Status: {unit.status.replace(/_/g, ' ')}</p>
                                                     </div>
                                                     <div className="bg-white p-1 rounded-sm">
                                                        {/* QR Code simulating a link to verify - UPDATED TO USE SIGNED DATA */}
                                                        <img 
                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getSignedQRData(unit.serialNumber))}`} 
                                                            alt="QR" 
                                                            className="w-12 h-12"
                                                        />
                                                     </div>
                                                 </div>
                                                 
                                                 {unit.uniqueAuthHash && (
                                                     <div className="mt-2 pt-2 border-t border-white/5">
                                                         <p className="text-[9px] uppercase text-neutral-500 mb-1">Secret Auth Code (Print Only)</p>
                                                         <div className="bg-black/50 p-1.5 rounded font-mono text-[10px] text-emerald-400 break-all border border-emerald-900/30">
                                                             {unit.uniqueAuthHash}
                                                         </div>
                                                     </div>
                                                 )}
                                                 
                                                 {/* Allow deletion only if in factory or returned defective */}
                                                 {['IN_FACTORY', 'RETURNED_DEFECTIVE'].includes(unit.status) && (
                                                     <button 
                                                       onClick={() => handleDeleteUnit(unit.id)}
                                                       className="absolute top-2 right-2 p-1 bg-red-900/20 rounded-full text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                       title="Delete Unit"
                                                     >
                                                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                                           <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                         </svg>
                                                     </button>
                                                 )}
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             )}
                         </div>
                     ))
                 )}
             </div>
          </div>
      )}

      {activeTab === 'distribute' && (
        <div className="space-y-6">
          {/* Sub Navigation for Distribution */}
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
             <div className="flex gap-4">
                <button 
                    onClick={() => setDistMode('new')}
                    className={`text-sm font-medium transition-colors ${distMode === 'new' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                    Dispatch New
                </button>
                <button 
                    onClick={() => setDistMode('history')}
                    className={`text-sm font-medium transition-colors ${distMode === 'history' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                    Dispatch History
                </button>
             </div>
             {distMode === 'new' && (
                 <button 
                    onClick={() => setIsCartOpen(true)}
                    className="flex items-center gap-2 text-sm bg-white text-black px-4 py-2 rounded-full font-bold"
                 >
                    View Cart ({cartItems.reduce((acc, i) => acc + i.quantity, 0)})
                 </button>
             )}
          </div>

          {distMode === 'new' ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* Reusing Product List Logic roughly for selection */}
                 {getProducts().filter(p => p.manufacturerId === user.id).map(product => (
                     <div key={product.id} className="bg-neutral-900 border border-white/5 p-6 rounded-2xl hover:border-white/20 transition-all group">
                        <div className="w-full h-32 bg-black/50 rounded-lg mb-4 overflow-hidden border border-white/5">
                            {product.images && product.images.length > 0 ? (
                                <img src={product.images[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-700 font-display font-bold text-2xl">LALLAN</div>
                            )}
                        </div>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-white font-bold">{product.name}</h3>
                                <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${product.isSerialized ? 'border-blue-500/30 text-blue-400' : 'border-amber-500/30 text-amber-400'}`}>
                                    {product.isSerialized ? 'Serialized' : 'Bulk'}
                                </span>
                            </div>
                        </div>
                        <button 
                            onClick={() => openAddCartModal(product)}
                            className="w-full py-2 bg-neutral-800 text-white text-sm font-medium rounded-lg hover:bg-neutral-700 transition-colors"
                        >
                            Add to Cart
                        </button>
                     </div>
                 ))}
             </div>
          ) : (
            // HISTORY TABLE VIEW
            <div className="bg-neutral-900/40 backdrop-blur border border-white/5 rounded-3xl overflow-hidden animate-in fade-in duration-300">
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm text-neutral-400">
                    <thead className="bg-white/5 text-neutral-200 uppercase text-xs font-bold tracking-wider">
                       <tr>
                          <th className="px-6 py-4">Date Sent</th>
                          <th className="px-6 py-4">Product Name</th>
                          <th className="px-6 py-4">ID / Type</th>
                          <th className="px-6 py-4">Recipient Seller</th>
                          <th className="px-6 py-4 text-right">Current Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                       {historyItems.length === 0 ? (
                          <tr>
                             <td colSpan={5} className="px-6 py-12 text-center text-neutral-600">No dispatch history found.</td>
                          </tr>
                       ) : (
                          historyItems.map((item) => (
                             <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4 font-mono text-xs">{item.dateSentToSeller}</td>
                                <td className="px-6 py-4 text-white font-medium">{item.productName}</td>
                                <td className="px-6 py-4 font-mono text-white">{item.serialNumber}</td>
                                <td className="px-6 py-4">{item.sellerName}</td>
                                <td className="px-6 py-4 text-right">
                                   <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${
                                      item.status === 'SOLD_TO_BUYER' 
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                      : item.status === 'RETURNED_DEFECTIVE'
                                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                   }`}>
                                      {item.status.replace(/_/g, ' ')}
                                   </span>
                                </td>
                             </tr>
                          ))
                       )}
                    </tbody>
                 </table>
               </div>
            </div>
          )}
        </div>
      )}

      <CartDrawer 
         isOpen={isCartOpen}
         onClose={() => setIsCartOpen(false)}
         cartItems={cartItems}
         onRemoveItem={handleRemoveFromCart}
         onCheckout={handleDispatchCheckout}
         isManufacturer={true}
      />

      {/* Add to Cart Modal (Replaces Prompt) */}
      {selectedProductForCart && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
           <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[80vh]">
              <h3 className="text-lg font-bold text-white mb-2">Add to Cart</h3>
              <p className="text-sm text-neutral-400 mb-6">Select inventory for <span className="text-white font-medium">{selectedProductForCart.name}</span></p>
              
              <form onSubmit={handleConfirmAddToCart} className="flex-1 flex flex-col min-h-0">
                 
                 {/* SERIALIZED SELECTION */}
                 {selectedProductForCart.isSerialized ? (
                     <div className="flex-1 overflow-y-auto mb-6 bg-black/30 rounded-xl p-2 border border-white/5">
                        {availableUnitsForCart.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-neutral-500 text-sm">No units in factory ready for dispatch.</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {availableUnitsForCart.map(unit => {
                                    const isSelected = selectedUnitIdsForCart.has(unit.id);
                                    return (
                                        <button 
                                            key={unit.id}
                                            type="button"
                                            onClick={() => toggleUnitSelection(unit.id)}
                                            className={`relative p-3 rounded-lg border text-left transition-all ${
                                                isSelected 
                                                ? 'bg-white text-black border-white shadow-lg' 
                                                : 'bg-neutral-800/50 text-white border-white/5 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="text-[10px] uppercase opacity-60 mb-1">{unit.manufacturingDate}</div>
                                            <div className="font-mono text-xs font-bold">{unit.serialNumber}</div>
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full"></div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                     </div>
                 ) : (
                     // BULK QUANTITY INPUT
                     <div className="flex items-center gap-4 mb-6">
                         <button type="button" onClick={() => setCartQtyInput(Math.max(1, cartQtyInput - 1))} className="w-10 h-10 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 font-bold transition-colors">-</button>
                         <input 
                           type="number" 
                           min="1" 
                           value={cartQtyInput} 
                           onChange={(e) => setCartQtyInput(Math.max(1, parseInt(e.target.value) || 0))}
                           className="flex-1 bg-black/50 border border-white/10 rounded-xl py-2 text-center text-white font-mono text-lg focus:outline-none"
                         />
                         <button type="button" onClick={() => setCartQtyInput(cartQtyInput + 1)} className="w-10 h-10 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 font-bold transition-colors">+</button>
                     </div>
                 )}

                 {selectedProductForCart.isSerialized && (
                     <div className="text-sm text-neutral-400 mb-4 text-center">
                         Selected: <span className="text-white font-bold">{selectedUnitIdsForCart.size}</span> units
                     </div>
                 )}
                 
                 <div className="flex gap-3">
                    <button type="button" onClick={() => setSelectedProductForCart(null)} className="flex-1 py-3 text-neutral-400 hover:text-white font-medium transition-colors">Cancel</button>
                    <button type="submit" className="flex-1 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors">Confirm Add</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
             <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-sm p-8">
                 <h2 className="text-xl font-bold text-white mb-4">Select Recipient</h2>
                 <p className="text-sm text-neutral-500 mb-6">Choose a Seller to transfer these {cartItems.reduce((a,b) => a+b.quantity, 0)} items to.</p>
                 
                 <div className="space-y-4">
                    <select 
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none"
                        value={targetSellerId}
                        onChange={e => setTargetSellerId(e.target.value)}
                    >
                        <option value="">-- Select Partner --</option>
                        {sellers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    
                    <button 
                        onClick={confirmDispatch}
                        disabled={!targetSellerId}
                        className="w-full py-3 bg-white disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-bold rounded-xl"
                    >
                        Confirm Dispatch
                    </button>
                    <button onClick={() => setShowDispatchModal(false)} className="w-full py-3 text-neutral-500 hover:text-white">Cancel</button>
                 </div>
             </div>
        </div>
      )}

    </div>
  );
};

export default ManufacturerView;