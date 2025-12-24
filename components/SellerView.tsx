import React, { useState, useEffect } from 'react';
import { User, Product, Order, ProductUnit } from '../types';
import { getOrdersForSeller, getAvailableSerialNumbers, fulfillOrder, getProductsForSeller, returnUnitsToManufacturer, processBuyerReturn, getProductUnits, returnBulkToManufacturer } from '../services/storage';

interface Props {
  user: User;
}

const SellerView: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'returns'>('dashboard');
  
  const [products, setProducts] = useState<(Product & { quantity: number })[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // Fulfillment Modal State
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [availableOrderUnits, setAvailableOrderUnits] = useState<ProductUnit[]>([]);
  const [selectedFulfillIds, setSelectedFulfillIds] = useState<Set<string>>(new Set());
  const [isAutoAssigned, setIsAutoAssigned] = useState(false);

  // Returns / Defectives State
  const [defectiveUnits, setDefectiveUnits] = useState<ProductUnit[]>([]);
  const [selectedDefectiveIds, setSelectedDefectiveIds] = useState<Set<string>>(new Set());
  const [pendingReturns, setPendingReturns] = useState<Order[]>([]);

  useEffect(() => {
    refreshData();
  }, [user.id, activeTab]);

  const refreshData = () => {
    setProducts(getProductsForSeller(user.id));
    setOrders(getOrdersForSeller(user.id));
    
    // Get units available for return to manufacturer (status: AT_SELLER or RETURNED_TO_SELLER)
    const allUnits = getProductUnits();
    const myStock = allUnits.filter(u => u.sellerId === user.id && (u.status === 'AT_SELLER' || u.status === 'RETURNED_TO_SELLER'));
    setDefectiveUnits(myStock);

    // Get orders with 'Return Requested'
    const myOrders = getOrdersForSeller(user.id);
    setPendingReturns(myOrders.filter(o => o.status === 'Return Requested'));
  };

  const openFulfillmentModal = (order: Order) => {
    const product = products.find(p => p.id === order.productId);
    
    // Check if units are already assigned (Auto-assignment from Buyer Checkout)
    if (order.assignedUnitIds && order.assignedUnitIds.length > 0) {
        setIsAutoAssigned(true);
        // Pre-select them visually for context
        const assigned = getProductUnits().filter(u => order.assignedUnitIds?.includes(u.id));
        setAvailableOrderUnits(assigned);
        setSelectedFulfillIds(new Set(order.assignedUnitIds));
        setActiveOrder(order);
        return;
    }

    setIsAutoAssigned(false);

    // If not serialized (Bulk), we just fulfill immediately/confirm
    if (product && !product.isSerialized) {
        if (confirm(`Confirm bulk shipment of ${order.quantity} units for ${order.productName}?`)) {
            fulfillOrder(order.id, null); // Null means bulk
            refreshData();
        }
        return;
    }

    // Serialized Logic (Legacy or Manual Fallback)
    const units = getAvailableSerialNumbers(order.productId, 'AT_SELLER', 'sellerId', user.id);
    setAvailableOrderUnits(units);
    setSelectedFulfillIds(new Set());
    setActiveOrder(order);
  };

  const toggleFulfillSelection = (unitId: string) => {
    if (isAutoAssigned) return; // Cannot change selection if auto-assigned

    const newSet = new Set(selectedFulfillIds);
    if (newSet.has(unitId)) {
        newSet.delete(unitId);
    } else {
        // Prevent selecting more than ordered
        if (activeOrder && newSet.size < activeOrder.quantity) {
            newSet.add(unitId);
        }
    }
    setSelectedFulfillIds(newSet);
  };

  const handleConfirmFulfillment = () => {
    if (!activeOrder) return;
    if (selectedFulfillIds.size !== activeOrder.quantity) {
        alert(`You must select exactly ${activeOrder.quantity} units to fulfill this order.`);
        return;
    }

    fulfillOrder(activeOrder.id, Array.from(selectedFulfillIds));
    setActiveOrder(null);
    refreshData();
  };

  // --- RETURN LOGIC ---
  const toggleDefectiveSelection = (unitId: string) => {
      const newSet = new Set(selectedDefectiveIds);
      if (newSet.has(unitId)) newSet.delete(unitId);
      else newSet.add(unitId);
      setSelectedDefectiveIds(newSet);
  };

  const handleReturnToManufacturer = () => {
      if (selectedDefectiveIds.size === 0) return;
      returnUnitsToManufacturer(Array.from(selectedDefectiveIds));
      setSelectedDefectiveIds(new Set());
      refreshData();
      alert("Selected units marked as defective and returned to Manufacturer record.");
  };

  const handleBuyerReturn = (orderId: string, accept: boolean) => {
      processBuyerReturn(orderId, accept);
      refreshData();
  };


  const pendingOrders = orders.filter(o => o.status === 'Awaiting Confirmation');
  const pastOrders = orders.filter(o => o.status !== 'Awaiting Confirmation' && o.status !== 'Return Requested');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
      
      {/* Navigation */}
      <div className="flex justify-center mb-8">
        <div className="bg-neutral-900/80 backdrop-blur border border-white/10 p-1 rounded-xl inline-flex">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-8 py-3 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'dashboard' ? 'bg-white text-black shadow-lg' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('returns')}
            className={`px-8 py-3 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'returns' ? 'bg-white text-black shadow-lg' : 'text-neutral-400 hover:text-white'
            }`}
          >
             {pendingReturns.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
             Returns & Defectives
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <>
            {/* Alert Section */}
            {pendingOrders.length > 0 && (
                <div className="bg-gradient-to-r from-amber-900/20 to-neutral-900 border border-amber-500/30 rounded-3xl overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.1)]">
                <div className="px-8 py-6 border-b border-amber-500/10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                            </svg>
                        </div>
                        <div>
                        <h3 className="text-xl font-display font-bold text-white">Pending Approvals</h3>
                        <p className="text-amber-200/60 text-sm">Require immediate attention ({pendingOrders.length})</p>
                        </div>
                    </div>
                </div>
                <div className="divide-y divide-white/5">
                    {pendingOrders.map(order => (
                    <div key={order.id} className="px-8 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                            <div>
                                <h4 className="font-medium text-white text-lg">{order.productName}</h4>
                                <div className="flex items-center gap-3 text-sm text-neutral-400 mt-1">
                                    <span>Qty Req: <span className="text-white font-bold">{order.quantity}</span></span>
                                    <span>•</span>
                                    <span>Client: {order.buyerName}</span>
                                </div>
                            </div>
                        </div>
                        <button 
                        onClick={() => openFulfillmentModal(order)}
                        className="px-6 py-2 bg-white text-black text-sm font-bold rounded-full hover:bg-neutral-200 transition-colors"
                        >
                            Ship Order
                        </button>
                    </div>
                    ))}
                </div>
                </div>
            )}

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Inventory Column */}
                <div className="bg-neutral-900/40 backdrop-blur border border-white/5 rounded-3xl p-8 flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-display font-bold text-white">Inventory</h2>
                    <span className="bg-neutral-800 border border-white/10 px-3 py-1 rounded-full text-xs font-mono text-neutral-300">
                        {products.reduce((acc, curr) => acc + curr.quantity, 0)} Items
                    </span>
                </div>
                
                {products.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm border border-dashed border-white/5 rounded-2xl p-8">No stock available.</div>
                ) : (
                    <div className="space-y-3">
                    {products.map(p => (
                        <div key={p.id} className="group bg-neutral-950 border border-white/5 p-5 rounded-2xl flex justify-between items-center hover:border-white/20 transition-all">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-black/40 rounded-lg overflow-hidden border border-white/5">
                                    {p.images && p.images.length > 0 ? (
                                        <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center font-bold text-neutral-700">L</div>
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-medium text-white mb-1 group-hover:text-neutral-200">{p.name}</h4>
                                    <div className="flex gap-2">
                                        <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded border ${p.isSerialized ? 'border-blue-500/30 text-blue-400' : 'border-amber-500/30 text-amber-400'}`}>
                                            {p.isSerialized ? 'Serialized' : 'Bulk'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                            <span className="block text-2xl font-display font-bold text-white">{p.quantity}</span>
                            <span className="text-[10px] text-neutral-500 uppercase tracking-widest">Available</span>
                            </div>
                        </div>
                    ))}
                    </div>
                )}
                </div>

                {/* Sales History Column */}
                <div className="bg-neutral-900/40 backdrop-blur border border-white/5 rounded-3xl p-8 flex flex-col h-full">
                <h2 className="text-2xl font-display font-bold text-white mb-8">Sales Ledger</h2>
                {pastOrders.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm border border-dashed border-white/5 rounded-2xl p-8">No transaction history.</div>
                ) : (
                    <div className="space-y-3">
                    {pastOrders.map(order => (
                        <div key={order.id} className="relative overflow-hidden bg-neutral-950 border border-white/5 p-5 rounded-2xl group">
                            <div className="flex justify-between items-start mb-3 relative z-10">
                            <h4 className="font-medium text-white">{order.productName}</h4>
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                order.status === 'Delivered' 
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                                : order.status === 'Returned'
                                ? 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
                                : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            }`}>
                                {order.status}
                            </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm relative z-10">
                            <div>
                                <span className="text-neutral-500 text-[10px] uppercase tracking-wider">Client</span>
                                <p className="text-neutral-300">{order.buyerName}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-neutral-500 text-[10px] uppercase tracking-wider">Volume</span>
                                <p className="text-white font-mono">{order.quantity}</p>
                            </div>
                            </div>
                        </div>
                    ))}
                    </div>
                )}
                </div>
            </div>
        </>
      )}

      {activeTab === 'returns' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             
             {/* Pending Buyer Returns */}
             <div className="space-y-6">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                    Inbound Returns
                    <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-full">{pendingReturns.length}</span>
                </h3>
                
                {pendingReturns.length === 0 ? (
                    <div className="p-8 border border-dashed border-white/5 rounded-3xl text-center text-neutral-600 text-sm">
                        No pending return requests from buyers.
                    </div>
                ) : (
                    pendingReturns.map(order => (
                        <div key={order.id} className="bg-neutral-900 border border-amber-500/20 p-6 rounded-2xl">
                             <div className="flex justify-between items-start mb-4">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Return Requested</span>
                                    <h4 className="text-lg font-bold text-white mt-1">{order.productName}</h4>
                                    <p className="text-sm text-neutral-400">Buyer: {order.buyerName}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-mono text-neutral-500">Order #{order.id.substring(0,6)}</span>
                                </div>
                             </div>
                             
                             <div className="bg-black/30 p-3 rounded-xl mb-4 text-xs font-mono text-neutral-300">
                                 Units: {order.quantity}
                             </div>

                             <div className="flex gap-3">
                                <button 
                                  onClick={() => handleBuyerReturn(order.id, true)}
                                  className="flex-1 py-2 bg-white text-black text-sm font-bold rounded-xl hover:bg-neutral-200 transition-colors"
                                >
                                    Approve & Restock
                                </button>
                                {/* <button className="px-4 py-2 border border-white/10 text-neutral-400 hover:text-white rounded-xl text-sm font-bold">Reject</button> */}
                             </div>
                        </div>
                    ))
                )}
             </div>

             {/* Outbound Defective Returns */}
             <div className="space-y-6">
                 <div className="flex justify-between items-center">
                    <h3 className="text-xl font-display font-bold text-white">Return to Manufacturer</h3>
                    <button 
                        onClick={handleReturnToManufacturer}
                        disabled={selectedDefectiveIds.size === 0}
                        className="text-xs bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        Mark Defective ({selectedDefectiveIds.size})
                    </button>
                 </div>
                 
                 <div className="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 h-[500px] overflow-y-auto">
                     {defectiveUnits.length === 0 ? (
                         <div className="h-full flex items-center justify-center text-neutral-600 text-sm">No serialized inventory available to return.</div>
                     ) : (
                         <div className="grid grid-cols-2 gap-3">
                             {defectiveUnits.map(unit => {
                                 const isSelected = selectedDefectiveIds.has(unit.id);
                                 return (
                                    <div 
                                    key={unit.id}
                                    onClick={() => toggleDefectiveSelection(unit.id)}
                                    className={`cursor-pointer relative p-4 rounded-xl border transition-all duration-200 ${
                                      isSelected 
                                        ? 'bg-red-900/20 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.1)]' 
                                        : 'bg-black/40 border-white/5 hover:border-white/20'
                                    }`}
                                  >
                                      <div className="flex justify-between items-start mb-2">
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-red-500 bg-red-500 text-white' : 'border-neutral-600'}`}>
                                            {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
                                        </div>
                                        {unit.status === 'RETURNED_TO_SELLER' && (
                                            <span className="text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded">Returned Item</span>
                                        )}
                                      </div>
                                      <p className="font-mono text-sm text-white tracking-wide">{unit.serialNumber}</p>
                                  </div>
                                 );
                             })}
                         </div>
                     )}
                 </div>
             </div>
          </div>
      )}

      {/* FULFILLMENT MODAL */}
      {activeOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
           <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
              <div className="p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                 <div>
                    <h2 className="text-lg font-display font-bold text-white">Fulfill Order #{activeOrder.id.substring(0,4)}</h2>
                    <p className="text-xs text-neutral-400 mt-1">
                        {isAutoAssigned 
                           ? <span className="text-emerald-400 font-bold">Units already reserved by Checkout.</span>
                           : <>Select <span className="text-white font-bold">{activeOrder.quantity}</span> serial numbers to ship.</>
                        }
                    </p>
                 </div>
                 <button onClick={() => setActiveOrder(null)} className="text-neutral-500 hover:text-white">Close</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-neutral-900">
                  {availableOrderUnits.length < activeOrder.quantity && !isAutoAssigned ? (
                     <div className="p-4 bg-red-900/20 border border-red-500/20 rounded-xl text-center">
                        <p className="text-red-400 text-sm">Insufficient stock. You need {activeOrder.quantity} units but only have {availableOrderUnits.length}.</p>
                     </div>
                  ) : (
                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {availableOrderUnits.map(unit => {
                           // If auto assigned, check against activeOrder
                           const isSelected = isAutoAssigned 
                                ? true 
                                : selectedFulfillIds.has(unit.id);
                           const isDisabled = isAutoAssigned 
                                ? true 
                                : (!isSelected && selectedFulfillIds.size >= activeOrder.quantity);
                           
                           return (
                             <button
                               key={unit.id}
                               onClick={() => toggleFulfillSelection(unit.id)}
                               disabled={isDisabled}
                               className={`relative p-4 rounded-xl border text-left transition-all ${
                                 isSelected 
                                   ? 'bg-white text-black border-white shadow-lg scale-[1.02]' 
                                   : isDisabled 
                                      ? 'opacity-40 cursor-not-allowed bg-black border-white/5'
                                      : 'bg-black/40 border-white/10 hover:border-white/30 text-white'
                               }`}
                             >
                                <div className="text-[10px] uppercase tracking-wider opacity-60 mb-2">{unit.manufacturingDate}</div>
                                <div className="font-mono font-bold text-sm">{unit.serialNumber}</div>
                                {isSelected && (
                                   <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full"></div>
                                )}
                             </button>
                           )
                        })}
                     </div>
                  )}
              </div>

              <div className="p-6 border-t border-white/5 bg-neutral-900 flex justify-between items-center">
                 <div className="text-sm text-neutral-400">
                    Selected: <span className={selectedFulfillIds.size === activeOrder.quantity || isAutoAssigned ? "text-emerald-400 font-bold" : "text-white"}>
                        {isAutoAssigned ? activeOrder.quantity : selectedFulfillIds.size}
                    </span> / {activeOrder.quantity}
                 </div>
                 <button 
                   onClick={handleConfirmFulfillment}
                   disabled={!isAutoAssigned && selectedFulfillIds.size !== activeOrder.quantity}
                   className="px-6 py-3 bg-white disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-bold rounded-xl transition-colors"
                 >
                    Confirm & Ship
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default SellerView;