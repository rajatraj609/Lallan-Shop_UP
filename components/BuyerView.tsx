import React, { useState, useEffect } from 'react';
import { User, Product, Order, UserRole, CartItem, ProductUnit } from '../types';
import { getProductsForSeller, getOrdersForBuyer, generateId, cancelOrder, getProductStockForOwner, getUsers, requestOrderReturn, getCart, addToCart, removeFromCart, clearCart, getProductUnits, processCheckout, saveOrder } from '../services/storage';
import CartDrawer from './CartDrawer';
import ProductImageGallery from './ProductImageGallery';

interface Props {
  user: User;
}

const BuyerView: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'orders'>('browse');
  // Product is extended with quantity for display purposes
  const [products, setProducts] = useState<(Product & { quantity: number, sellerName: string, sellerId: string })[]>([]);
  const [myOrders, setMyOrders] = useState<(Order & { assignedUnits?: ProductUnit[] })[]>([]);
  
  // Cart State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Selection for adding to cart
  const [selectedProduct, setSelectedProduct] = useState<(Product & { quantity: number, sellerId: string, sellerName: string }) | null>(null);
  const [orderQty, setOrderQty] = useState(1);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  useEffect(() => {
    refreshData();
  }, [user.id, activeTab]);

  const refreshData = () => {
    // Logic: In a real app, Buyers see products listed by Sellers.
    // For this demo, we iterate all Sellers and get their stock.
    const allSellers = getUsers().filter(u => u.role === UserRole.SELLER);
    let aggregatedProducts: (Product & { quantity: number, sellerName: string, sellerId: string })[] = [];

    allSellers.forEach(seller => {
        // Use the new Service which handles both Serialized and Bulk quantity checks
        const sellerProducts = getProductsForSeller(seller.id); 
        const mapped = sellerProducts.map(p => ({
            ...p,
            sellerId: seller.id,
            sellerName: seller.name
        }));
        aggregatedProducts = [...aggregatedProducts, ...mapped];
    });

    setProducts(aggregatedProducts.filter(p => p.quantity > 0));
    
    // Fetch orders and augment with Unit Details (specifically Auth Codes)
    const rawOrders = getOrdersForBuyer(user.id).reverse();
    const allUnits = getProductUnits();
    
    const augmentedOrders = rawOrders.map(order => {
        let assignedUnits: ProductUnit[] = [];
        if (order.assignedUnitIds && order.assignedUnitIds.length > 0) {
             assignedUnits = order.assignedUnitIds.map(uid => allUnits.find(u => u.id === uid)).filter(u => u !== undefined) as ProductUnit[];
        }
        return { ...order, assignedUnits };
    });

    setMyOrders(augmentedOrders);
    setCartItems(getCart(user.id));
  };

  const handleAddToCartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    
    // Double check stock
    const currentStock = getProductStockForOwner(selectedProduct.id, selectedProduct.sellerId, selectedProduct.isSerialized);

    if (orderQty > currentStock) {
      alert("Exceeds available stock.");
      return;
    }

    const item: CartItem = {
        id: generateId(),
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: orderQty,
        isSerialized: selectedProduct.isSerialized,
        sellerId: selectedProduct.sellerId, // Store specific seller ID
        price: 0 // Demo
    };

    addToCart(user.id, item);
    // Force refresh of cart state
    const updatedCart = getCart(user.id);
    setCartItems(updatedCart);
    
    setSelectedProduct(null);
    setOrderQty(1);
    setIsCartOpen(true);
  };

  const handleRemoveFromCart = (id: string) => {
      removeFromCart(user.id, id);
      setCartItems(getCart(user.id));
  };

  const handleCheckout = async () => {
      if (cartItems.length === 0) return;

      console.log("Order Process Started");
      setIsProcessingCheckout(true);

      // Simulate a small network delay for UX
      setTimeout(() => {
          try {
            // New Robust Transaction Logic
            processCheckout(user, cartItems);
            
            // On Success
            console.log("Order Process Success - Logic Complete");
            setCartItems([]);
            setIsCartOpen(false);
            setShowSuccessModal(true);
          } catch (error: any) {
            console.error("Order Failed", error);
            alert("Checkout Failed: " + error.message);
          } finally {
            setIsProcessingCheckout(false);
          }
      }, 1500);
  };

  const closeSuccessModal = () => {
      setShowSuccessModal(false);
      setActiveTab('orders');
      refreshData();
  };

  const handleConfirmDelivery = (order: Order) => {
    const updatedOrder: Order = {
      ...order,
      status: 'Delivered',
      dateDelivered: new Date().toISOString().split('T')[0]
    };
    saveOrder(updatedOrder);
    refreshData();
  };

  const performCancelOrder = (orderId: string) => {
    cancelOrder(orderId);
    setConfirmCancelId(null);
    refreshData();
  };

  const handleReturnItem = (orderId: string) => {
      if (confirm('Are you sure you want to return this item? It will be sent back to the seller.')) {
        requestOrderReturn(orderId);
        refreshData();
      }
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Navigation Pills */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex-1"></div>
        <div className="bg-neutral-900/80 backdrop-blur border border-white/10 p-1 rounded-full inline-flex">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-8 py-3 rounded-full text-sm font-medium transition-all duration-300 ${
              activeTab === 'browse' 
                ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.1)]' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Collection
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-8 py-3 rounded-full text-sm font-medium transition-all duration-300 ${
              activeTab === 'orders' 
                ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.1)]' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            My Acquisitions
          </button>
        </div>
        <div className="flex-1 flex justify-end">
             <button 
               onClick={() => setIsCartOpen(true)}
               className="relative p-3 bg-neutral-800 rounded-full hover:bg-white hover:text-black transition-colors"
             >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                {cartItems.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-black text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-black">
                        {cartItems.reduce((acc, item) => acc + item.quantity, 0)}
                    </span>
                )}
             </button>
        </div>
      </div>

      {activeTab === 'browse' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.length === 0 ? (
            <div className="col-span-full py-20 text-center text-neutral-600 bg-neutral-900/20 border border-white/5 rounded-3xl">
              <h3 className="font-display text-xl mb-2">Collection Sold Out</h3>
              <p className="text-sm">Please check back for future drops.</p>
            </div>
          ) : (
            products.map((product, idx) => (
              <div 
                key={`${product.id}-${product.sellerId}`} 
                className="group relative bg-neutral-900/40 backdrop-blur-sm border border-white/5 rounded-3xl overflow-hidden hover:border-white/20 transition-all duration-500 hover:-translate-y-1"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* Product Image Section */}
                <div className="w-full aspect-[4/3] bg-neutral-950 flex items-center justify-center relative overflow-hidden group-hover:shadow-2xl transition-shadow">
                    {product.images && product.images.length > 0 ? (
                        <ProductImageGallery images={product.images} productName={product.name} />
                    ) : (
                        // Fallback Abstract Art
                        <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-black flex items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.1),transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <h1 className="text-6xl font-display font-bold text-white/5 select-none scale-150 group-hover:scale-110 transition-transform duration-700">LALLAN</h1>
                        </div>
                    )}
                   <div className="absolute top-4 right-4 flex gap-2 z-10 pointer-events-none">
                      <span className={`backdrop-blur text-[10px] font-bold px-3 py-1 rounded-full border shadow-lg ${product.isSerialized ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-amber-500/20 border-amber-500/30 text-amber-300'}`}>
                          {product.isSerialized ? 'SERIALIZED' : 'BULK'}
                      </span>
                   </div>
                </div>

                <div className="p-8">
                  <div className="mb-6">
                    <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Seller: {product.sellerName}</p>
                    <h3 className="text-2xl font-display font-bold text-white group-hover:text-neutral-200 transition-colors">{product.name}</h3>
                  </div>
                  
                  <div className="flex items-end justify-between border-t border-white/5 pt-6">
                    <div>
                      <span className="block text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Available Units</span>
                      <span className="text-xl font-mono text-white">{product.quantity}</span>
                    </div>
                    
                    <button
                      onClick={() => { setSelectedProduct(product); setOrderQty(1); }}
                      className="px-6 py-2 bg-white text-black text-sm font-bold rounded-full hover:bg-neutral-200 transition-colors"
                    >
                      Acquire
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {myOrders.length === 0 ? (
             <div className="py-20 text-center text-neutral-600 bg-neutral-900/20 border border-white/5 rounded-3xl">
              <h3 className="font-display text-xl mb-2">No Acquisitions Yet</h3>
              <p className="text-sm">Explore our collection to start your journey.</p>
            </div>
          ) : (
            myOrders.map(order => (
              <div key={order.id} className="bg-neutral-900/40 backdrop-blur border border-white/5 rounded-3xl p-8 hover:bg-neutral-900/60 transition-colors group">
                 <div className="flex flex-col md:flex-row gap-8 items-center">
                    
                    {/* Order Info */}
                    <div className="flex-1 w-full">
                       <div className="flex items-center gap-3 mb-3">
                         <span className="text-xs font-mono text-neutral-500">{order.dateOrdered}</span>
                         <span className="w-1 h-1 rounded-full bg-neutral-700"></span>
                         <span className="text-xs text-neutral-400 uppercase tracking-wider">ID: {order.id.substring(0,8)}</span>
                       </div>
                       <div className="flex items-center gap-2 mb-2">
                           <h3 className="text-2xl font-display font-bold text-white">{order.productName}</h3>
                           {order.status === 'Return Requested' && (
                               <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase">Return Pending</span>
                           )}
                           {order.status === 'Returned' && (
                               <span className="px-2 py-0.5 rounded-full bg-neutral-500/10 border border-neutral-500/20 text-neutral-400 text-[10px] font-bold uppercase">Returned</span>
                           )}
                       </div>
                       <p className="text-neutral-400 text-sm">Quantity: <span className="text-white font-mono">{order.quantity}</span></p>

                       {/* ASKE VAULT: Show Codes for Confirmed/Delivered Orders */}
                       {/* Note: Units are sold immediately, but maybe we hide codes until 'Confirmed' by Seller? 
                           For demo, let's show them immediately or wait for confirmation. 
                           Original code waited for confirmation. Let's keep that UX. */}
                       {order.assignedUnits && order.assignedUnits.length > 0 && ['Confirmed', 'Delivered', 'Return Requested'].includes(order.status) && (
                           <div className="mt-4 p-4 bg-black/40 border border-emerald-900/30 rounded-xl animate-in fade-in slide-in-from-top-2">
                               <div className="flex items-center gap-2 mb-2">
                                   <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                         <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                       </svg>
                                   </div>
                                   <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">Aske Verified Vault</span>
                               </div>
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                   {order.assignedUnits.map(unit => (
                                       <div key={unit.id} className="text-xs">
                                           <div className="flex justify-between text-[10px] text-neutral-500">
                                               <span>Serial: {unit.serialNumber}</span>
                                           </div>
                                           <div className="font-mono bg-emerald-950/30 text-emerald-200 p-1.5 rounded border border-emerald-500/10 break-all select-all cursor-text" title="Copy for Verification">
                                               {unit.uniqueAuthHash || "Generating..."}
                                           </div>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       )}
                    </div>
                    
                    {/* Minimal Timeline */}
                    <div className="flex-1 w-full flex items-center justify-center">
                       <div className="relative w-full max-w-sm flex items-center justify-between">
                          {/* Line */}
                          <div className="absolute top-1/2 left-0 w-full h-px bg-neutral-800 -z-10"></div>
                          
                          {/* Step 1 */}
                          <div className="flex flex-col items-center gap-2 bg-neutral-900 px-2">
                             <div className={`w-3 h-3 rounded-full border-2 ${['Awaiting Confirmation', 'Confirmed', 'Delivered', 'Return Requested', 'Returned'].includes(order.status) ? 'border-white bg-white' : 'border-neutral-700 bg-neutral-900'}`}></div>
                             <span className="text-[10px] uppercase tracking-wider text-neutral-500">Ordered</span>
                          </div>
                          {/* Step 2 */}
                          <div className="flex flex-col items-center gap-2 bg-neutral-900 px-2">
                             <div className={`w-3 h-3 rounded-full border-2 ${['Confirmed', 'Delivered', 'Return Requested', 'Returned'].includes(order.status) ? 'border-white bg-white' : 'border-neutral-700 bg-neutral-900'}`}></div>
                             <span className="text-[10px] uppercase tracking-wider text-neutral-500">Confirmed</span>
                          </div>
                          {/* Step 3 */}
                          <div className="flex flex-col items-center gap-2 bg-neutral-900 px-2">
                             <div className={`w-3 h-3 rounded-full border-2 ${['Delivered', 'Return Requested', 'Returned'].includes(order.status) ? 'border-white bg-white' : 'border-neutral-700 bg-neutral-900'}`}></div>
                             <span className="text-[10px] uppercase tracking-wider text-neutral-500">Delivered</span>
                          </div>
                       </div>
                    </div>

                    {/* Actions */}
                    <div className="md:w-48 text-right flex justify-end">
                       {/* IF status is 'Confirmed', Buyer can 'Mark Received' */}
                       {order.status === 'Confirmed' ? (
                          <button 
                             onClick={() => handleConfirmDelivery(order)}
                            className="px-5 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-neutral-200 transition-colors"
                          >
                            Mark Received
                          </button>
                        ) : order.status === 'Delivered' ? (
                          <div className="flex flex-col items-end gap-2">
                              <div className="px-4 py-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full uppercase tracking-wider">
                                Delivered
                              </div>
                              <button 
                                onClick={() => handleReturnItem(order.id)}
                                className="text-xs text-neutral-500 hover:text-white underline"
                              >
                                Return Item
                              </button>
                          </div>
                        ) : order.status === 'Return Requested' ? (
                            <div className="text-xs text-amber-500 font-medium">Processing Return</div>
                        ) : order.status === 'Returned' ? (
                            <div className="text-xs text-neutral-500">Return Complete</div>
                        ) : (
                          confirmCancelId === order.id ? (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                               <button onClick={() => setConfirmCancelId(null)} className="text-xs text-neutral-400 hover:text-white px-2">Back</button>
                               <button 
                                onClick={() => performCancelOrder(order.id)}
                                className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-full hover:bg-red-500"
                               >
                                Confirm
                               </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setConfirmCancelId(order.id)}
                              className="px-5 py-2 border border-white/20 text-neutral-400 hover:text-white hover:border-white text-xs font-bold rounded-full transition-colors"
                            >
                              Cancel
                            </button>
                          )
                        )}
                    </div>
                 </div>
              </div>
            ))
          )}
        </div>
      )}

      <CartDrawer 
         isOpen={isCartOpen}
         onClose={() => setIsCartOpen(false)}
         cartItems={cartItems}
         onRemoveItem={handleRemoveFromCart}
         onCheckout={handleCheckout}
         isProcessing={isProcessingCheckout}
      />

      {/* SUCCESS MODAL */}
      {showSuccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
              <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center flex flex-col items-center shadow-2xl animate-in zoom-in duration-300">
                  <div className="w-20 h-20 rounded-full bg-emerald-500 text-black flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-10 h-10 animate-[ping_1s_ease-in-out_1]">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                  </div>
                  <h2 className="text-2xl font-display font-bold text-white mb-2">Order Confirmed</h2>
                  <p className="text-neutral-400 text-sm mb-8">Thank you for your acquisition. Your order has been placed and inventory reserved.</p>
                  
                  <button 
                    onClick={closeSuccessModal}
                    className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors"
                  >
                      View My Orders
                  </button>
              </div>
          </div>
      )}

      {/* High-End Modal for Adding to Cart */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white to-transparent opacity-20"></div>
             
             <div className="p-8">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-6 text-center">Add to Cart</h3>
                
                <div className="text-center mb-8">
                   <h2 className="text-2xl font-display font-bold text-white mb-2">{selectedProduct.name}</h2>
                   <p className="text-sm text-neutral-400">Available Stock: {selectedProduct.quantity}</p>
                   <p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-2">Seller: {selectedProduct.sellerName}</p>
                </div>

                <form onSubmit={handleAddToCartSubmit}>
                   <div className="flex items-center justify-center gap-4 mb-8">
                      <button 
                        type="button"
                        className="w-10 h-10 rounded-full border border-white/10 text-white hover:bg-white hover:text-black transition-colors"
                        onClick={() => setOrderQty(Math.max(1, orderQty - 1))}
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        className="w-16 text-center bg-transparent text-2xl font-mono text-white focus:outline-none"
                        value={orderQty}
                        readOnly
                      />
                      <button 
                        type="button"
                        className="w-10 h-10 rounded-full border border-white/10 text-white hover:bg-white hover:text-black transition-colors"
                        onClick={() => setOrderQty(Math.min(selectedProduct.quantity, orderQty + 1))}
                      >
                        +
                      </button>
                   </div>
                   
                   <div className="space-y-3">
                      <button 
                        type="submit"
                        className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors"
                      >
                        Add to Cart
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSelectedProduct(null)}
                        className="w-full py-3 text-neutral-500 hover:text-white transition-colors text-sm"
                      >
                        Cancel
                      </button>
                   </div>
                </form>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuyerView;