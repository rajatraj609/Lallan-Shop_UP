import { Product, User, UserRole, Order, ProductUnit, UnitStatus, BulkStock, CartItem, Message, UserStatus, GlobalSettings } from '../types';

const USERS_KEY = 'chaintrack_users';
const PRODUCTS_KEY = 'chaintrack_products';
const UNITS_KEY = 'chaintrack_units'; 
const BULK_STOCK_KEY = 'chaintrack_bulk_stock'; 
const ORDERS_KEY = 'chaintrack_orders';
const CURRENT_USER_KEY = 'chaintrack_current_user';
const CART_KEY_PREFIX = 'chaintrack_cart_';
const MESSAGES_KEY = 'chaintrack_messages';
const SETTINGS_KEY = 'chaintrack_settings';
const SYSTEM_SECRET_KEY = 'LALLAN-ASKE-V1-SECRET'; 

export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

// --- QR Security Logic (Synchronous for UI rendering) ---

// Simple hashing function for demo purposes (MurmurHash3-like)
// In a real production app, this would be a backend signed JWT or HMAC
const generateSyncSignature = (str: string): string => {
    let h = 0xdeadbeef;
    for(let i = 0; i < str.length; i++)
        h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
    return ((h ^ h >>> 16) >>> 0).toString(16);
};

export const getSignedQRData = (serialNumber: string): string => {
    // Format: LS:{SerialNumber}:{Signature}
    // LS stands for Lallan Shop (Protocol Prefix)
    const signature = generateSyncSignature(serialNumber + SYSTEM_SECRET_KEY);
    return `LS:${serialNumber}:${signature}`;
};

export const validateSignedQR = (scannedText: string): { valid: boolean, serialNumber?: string, error?: string } => {
    // 1. Check Format
    if (!scannedText.startsWith('LS:')) {
        return { valid: false, error: 'External QR Code Detected. Please scan a genuine Lallan Shop QR.' };
    }

    const parts = scannedText.split(':');
    if (parts.length !== 3) {
        return { valid: false, error: 'Malformed QR Data.' };
    }

    const serialNumber = parts[1];
    const scannedSignature = parts[2];

    // 2. Verify Signature
    const expectedSignature = generateSyncSignature(serialNumber + SYSTEM_SECRET_KEY);

    if (scannedSignature !== expectedSignature) {
        return { valid: false, error: 'Forged QR Code. Signature verification failed.' };
    }

    return { valid: true, serialNumber };
};


// --- Global Settings & Serial Logic ---

export const getGlobalSettings = (): GlobalSettings => {
  const stored = localStorage.getItem(SETTINGS_KEY);
  let parsed: GlobalSettings;
  
  if (stored) {
      parsed = JSON.parse(stored);
  } else {
      parsed = {
        serialRangeStart: 100000,
        serialRangeEnd: 100999,
        recycledSerials: [],
        systemMessages: ['', '', '']
      };
  }

  // Ensure default structure exists for backwards compatibility
  if (!parsed.systemMessages) parsed.systemMessages = ['', '', ''];
  
  if (!parsed.contentHowItWorks) parsed.contentHowItWorks = "1. Sign Up as a Manufacturer, Seller, or Buyer.\n2. Manufacturers create digital twins of physical luxury items.\n3. Sellers receive and list verified stock.\n4. Buyers purchase authentic goods with a traceable history.";
  if (!parsed.contentOurStory) parsed.contentOurStory = "Founded in 2024, Lallan Shop was built to solve the counterfeit crisis in luxury retail. By leveraging cryptographic serials and a closed-loop supply chain, we ensure that what you buy is exactly what you get.";
  if (!parsed.contentSupport) parsed.contentSupport = "Contact our 24/7 concierge at support@lallanshop.com or use the 'Lallan Intelligence' bot after logging in for immediate assistance with orders and verification.";
  if (!parsed.contentPrivacy) parsed.contentPrivacy = "We value your privacy. Your personal data is encrypted and never shared with third-party advertisers. We only store data necessary for order fulfillment and identity verification.";
  if (!parsed.contentTerms) parsed.contentTerms = "By using Lallan Shop, you agree to our anti-fraud policies. Any attempt to tamper with QR codes or resell items outside the platform voids the authenticity guarantee.";

  return parsed;
};

export const saveGlobalSettings = (settings: GlobalSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const generateNextSerialBatch = (quantity: number): string[] => {
  const settings = getGlobalSettings();
  const allUnits = getProductUnits();
  
  // Extract all currently used numeric serials within the managed range
  // We filter for simple numeric serials to avoid conflicts with legacy "SN-2024-..." types if any existed manually
  const usedNumbers = new Set<number>();
  allUnits.forEach(u => {
    const num = parseInt(u.serialNumber);
    if (!isNaN(num)) usedNumbers.add(num);
  });

  const generated: string[] = [];
  
  // 1. Try to use Recycled numbers first (LIFO or FIFO doesn't matter much here, picking from list)
  let recycledUsedCount = 0;
  
  // Sort recycled to be nice
  settings.recycledSerials.sort((a,b) => a - b);

  while (generated.length < quantity && settings.recycledSerials.length > 0) {
     const candidate = settings.recycledSerials.shift(); // Take from front
     if (candidate !== undefined && !usedNumbers.has(candidate)) {
        generated.push(candidate.toString());
        recycledUsedCount++;
     }
  }

  // 2. Generate new numbers linearly
  if (generated.length < quantity) {
      let candidate = settings.serialRangeStart;
      
      // Fast forward to finding a gap or end of sequence
      // Optimization: In a real DB we'd have a 'last_seq' pointer. 
      // Here we iterate. For 10k-100k records this is fine.
      while (generated.length < quantity) {
          if (candidate > settings.serialRangeEnd) {
             throw new Error("Serial number range exhausted. Please contact Admin.");
          }

          if (!usedNumbers.has(candidate)) {
              generated.push(candidate.toString());
          }
          candidate++;
      }
  }

  // Update Settings (save the modified recycled array)
  saveGlobalSettings(settings);

  return generated;
};

// --- Security / Aske Logic ---

export const generateSecureHash = async (serialNumber: string, manufacturerId: string): Promise<string> => {
    const data = `${serialNumber}-${manufacturerId}-${SYSTEM_SECRET_KEY}`;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const verifyProductIdentity = async (qrSerialNumber: string, inputAuthCode: string): Promise<{valid: boolean, unit?: ProductUnit}> => {
    const units = getProductUnits();
    const unit = units.find(u => u.serialNumber === qrSerialNumber);
    
    if (!unit || !unit.uniqueAuthHash) {
        return { valid: false };
    }
    if (unit.uniqueAuthHash === inputAuthCode) {
        return { valid: true, unit };
    }
    return { valid: false };
};

// --- User Management ---

// Seed Admin Logic
const seedAdmin = (users: User[]) => {
    const adminEmail = 'LallanBabuShop@gmail.com';
    const hasAdmin = users.find(u => u.email === adminEmail);
    if (!hasAdmin) {
        const adminUser: User = {
            id: 'admin-001',
            email: adminEmail,
            password: 'LallanAdmin123!', // Default password
            role: UserRole.ADMIN,
            name: 'Lallan Babu (Admin)',
            dob: '1941-08-31',
            phone: '8987242812',
            status: 'Approved',
            isBanned: false
        };
        users.push(adminUser);
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
};

export const getUsers = (): User[] => {
  const stored = localStorage.getItem(USERS_KEY);
  const users = stored ? JSON.parse(stored) : [];
  
  // Ensure admin exists on every get if empty or missing
  if (!users.find((u: User) => u.role === UserRole.ADMIN)) {
      seedAdmin(users);
      return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  }
  return users;
};

export const saveUser = (user: User): void => {
  const users = getUsers();
  const index = users.findIndex(u => u.id === user.id);
  
  // Set default status for new users
  // Manufacturers/Sellers -> Pending
  // Buyers -> Approved
  if (!user.status) {
      if (user.role === UserRole.BUYER) user.status = 'Approved';
      else user.status = 'Pending';
  }
  if (user.isBanned === undefined) user.isBanned = false;

  if (index >= 0) {
    users[index] = user;
  } else {
    users.push(user);
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === user.id) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  }
};

export const resetPassword = (userId: string, newPassword: string): void => {
    const users = getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index >= 0) {
        users[index].password = newPassword;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
};

export const deleteUser = (userId: string): void => {
  const users = getUsers().filter(u => u.id !== userId);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === userId) {
    logout();
  }
};

// --- ADMIN MODERATION ACTIONS ---

export const toggleUserBan = (userId: string): void => {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (user && user.role !== UserRole.ADMIN) {
        user.isBanned = !user.isBanned;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
};

export const approveUser = (userId: string): void => {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
        user.status = 'Approved';
        user.rejectionReason = undefined;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
};

export const rejectUser = (userId: string, reason: string): void => {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
        user.status = 'Rejected';
        user.rejectionReason = reason;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
};

export const findUserByEmail = (email: string): User | undefined => {
  return getUsers().find(u => u.email === email);
};

export const getUsersByRole = (role: UserRole): User[] => {
  return getUsers().filter(u => u.role === role);
};

// --- Auth Session ---

export const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const login = (user: User): void => {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
};

export const logout = (): void => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

// --- Messaging System ---

export const getMessages = (): Message[] => {
    const stored = localStorage.getItem(MESSAGES_KEY);
    return stored ? JSON.parse(stored) : [];
};

export const sendMessage = (msg: Message): void => {
    const messages = getMessages();
    messages.push(msg);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
};

export const markMessageAsRead = (messageId: string): void => {
    const messages = getMessages();
    const msg = messages.find(m => m.id === messageId);
    if (msg) {
        msg.isRead = true;
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    }
};

export const endDiscussion = (senderId: string, receiverId: string): void => {
    let messages = getMessages();
    // PERMANENT DELETION: Remove all messages between these two users
    messages = messages.filter(m => !((m.senderId === senderId && m.receiverId === receiverId) || 
                                      (m.senderId === receiverId && m.receiverId === senderId)));
    
    // No placeholder. Clean wipe.
    
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
};

export const getUnreadCount = (userId: string): number => {
    const messages = getMessages();
    return messages.filter(m => m.receiverId === userId && !m.isRead).length;
};


// --- Product & Inventory Management ---

export const getProducts = (): Product[] => {
  const stored = localStorage.getItem(PRODUCTS_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const getProductUnits = (): ProductUnit[] => {
  const stored = localStorage.getItem(UNITS_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const getBulkStock = (): BulkStock[] => {
  const stored = localStorage.getItem(BULK_STOCK_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveProductBatch = async (product: Product, quantity: number, partialUnits: Partial<ProductUnit>[]): Promise<void> => {
  const products = getProducts();
  const pIndex = products.findIndex(p => p.id === product.id);
  if (pIndex >= 0) products[pIndex] = product;
  else products.push(product);
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));

  if (product.isSerialized) {
    const allUnits = getProductUnits();
    const finalUnits: ProductUnit[] = [];
    for (const u of partialUnits) {
        if (u.serialNumber && u.manufacturerId) {
             const hash = await generateSecureHash(u.serialNumber, u.manufacturerId);
             finalUnits.push({ ...u, uniqueAuthHash: hash } as ProductUnit);
        }
    }
    finalUnits.forEach(u => allUnits.push(u));
    localStorage.setItem(UNITS_KEY, JSON.stringify(allUnits));
  } else {
    const allStock = getBulkStock();
    const existingStock = allStock.find(s => s.productId === product.id && s.ownerId === product.manufacturerId);
    if (existingStock) existingStock.quantity += quantity;
    else allStock.push({ id: generateId(), productId: product.id, ownerId: product.manufacturerId, quantity: quantity });
    localStorage.setItem(BULK_STOCK_KEY, JSON.stringify(allStock));
  }
};

export const updateProductUnits = (unitsToUpdate: ProductUnit[]): void => {
  const allUnits = getProductUnits();
  unitsToUpdate.forEach(u => {
    const idx = allUnits.findIndex(existing => existing.id === u.id);
    if (idx >= 0) allUnits[idx] = u;
  });
  localStorage.setItem(UNITS_KEY, JSON.stringify(allUnits));
};

export const transferBulkStock = (productId: string, fromOwnerId: string, toOwnerId: string | null, quantity: number): void => {
    const allStock = getBulkStock();
    const sourceStock = allStock.find(s => s.productId === productId && s.ownerId === fromOwnerId);
    if (sourceStock && sourceStock.quantity >= quantity) {
        sourceStock.quantity -= quantity;
        if (toOwnerId) {
            const destStock = allStock.find(s => s.productId === productId && s.ownerId === toOwnerId);
            if (destStock) destStock.quantity += quantity;
            else allStock.push({ id: generateId(), productId: productId, ownerId: toOwnerId, quantity: quantity });
        }
    }
    localStorage.setItem(BULK_STOCK_KEY, JSON.stringify(allStock));
};

export const deleteProductUnit = (unitId: string): void => {
  const allUnits = getProductUnits();
  const unitToDelete = allUnits.find(u => u.id === unitId);
  const remainingUnits = allUnits.filter(u => u.id !== unitId);
  
  localStorage.setItem(UNITS_KEY, JSON.stringify(remainingUnits));

  // Recycle the serial number if it was numeric
  if (unitToDelete) {
      const num = parseInt(unitToDelete.serialNumber);
      if (!isNaN(num)) {
          const settings = getGlobalSettings();
          if (!settings.recycledSerials.includes(num)) {
              settings.recycledSerials.push(num);
              saveGlobalSettings(settings);
          }
      }
  }
};

export const deleteProduct = (productId: string): boolean => {
  const units = getProductUnits();
  
  // Recycle Serials for units being deleted
  const unitsToDelete = units.filter(u => u.productId === productId);
  const settings = getGlobalSettings();
  let settingsChanged = false;

  unitsToDelete.forEach(u => {
      const num = parseInt(u.serialNumber);
      if (!isNaN(num) && !settings.recycledSerials.includes(num)) {
          settings.recycledSerials.push(num);
          settingsChanged = true;
      }
  });

  if (settingsChanged) saveGlobalSettings(settings);

  // Admin force delete cleans up everything
  const products = getProducts().filter(p => p.id !== productId);
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  
  // Clean related units
  const remainingUnits = units.filter(u => u.productId !== productId);
  localStorage.setItem(UNITS_KEY, JSON.stringify(remainingUnits));
  
  // Clean related stock
  const remainingStock = getBulkStock().filter(s => s.productId !== productId);
  localStorage.setItem(BULK_STOCK_KEY, JSON.stringify(remainingStock));
  
  return true;
};

// --- Inventory Getters (Hybrid) ---

export const getProductStockForOwner = (productId: string, ownerId: string, isSerialized: boolean): number => {
    if (isSerialized) {
        const units = getProductUnits();
        return units.filter(u => 
            u.productId === productId && 
            ((u.manufacturerId === ownerId && u.status === 'IN_FACTORY') || 
             (u.sellerId === ownerId && (u.status === 'AT_SELLER' || u.status === 'RETURNED_TO_SELLER')))
        ).length;
    } else {
        const stock = getBulkStock().find(s => s.productId === productId && s.ownerId === ownerId);
        return stock ? stock.quantity : 0;
    }
};

export const getProductsWithStock = (ownerId: string, role: UserRole): (Product & { quantity: number })[] => {
  const products = getProducts();
  return products.map(p => {
    const quantity = getProductStockForOwner(p.id, ownerId, p.isSerialized);
    if (role === UserRole.MANUFACTURER && p.manufacturerId !== ownerId) return null;
    return { ...p, quantity };
  }).filter((p): p is (Product & { quantity: number }) => p !== null && (role === UserRole.MANUFACTURER || p.quantity > 0)); 
};

export const getProductsForManufacturer = (manufacturerId: string): (Product & { quantity: number })[] => {
  return getProductsWithStock(manufacturerId, UserRole.MANUFACTURER);
};

export const getProductsForSeller = (sellerId: string): (Product & { quantity: number })[] => {
  return getProductsWithStock(sellerId, UserRole.SELLER);
};

export const getAvailableSerialNumbers = (productId: string, status: UnitStatus, ownerIdField: 'manufacturerId' | 'sellerId', ownerId: string): ProductUnit[] => {
  const units = getProductUnits();
  // @ts-ignore
  return units.filter(u => u.productId === productId && u.status === status && u[ownerIdField] === ownerId);
};

export const getManufacturerDispatchHistory = (manufacturerId: string): (ProductUnit & { productName: string, sellerName: string })[] => {
  const units = getProductUnits();
  const products = getProducts();
  const users = getUsers();
  const history = units.filter(u => u.manufacturerId === manufacturerId && u.sellerId);
  return history.map(u => {
    const prod = products.find(p => p.id === u.productId);
    const seller = users.find(s => s.id === u.sellerId);
    return {
      ...u,
      productName: prod ? prod.name : 'Unknown Product',
      sellerName: seller ? seller.name : 'Unknown Seller'
    };
  }).sort((a, b) => {
    const dateA = a.dateSentToSeller || '';
    const dateB = b.dateSentToSeller || '';
    return dateB.localeCompare(dateA);
  });
};

// --- Cart Management ---

export const getCart = (userId: string): CartItem[] => {
  const stored = localStorage.getItem(CART_KEY_PREFIX + userId);
  return stored ? JSON.parse(stored) : [];
};

export const addToCart = (userId: string, item: CartItem): void => {
  const cart = getCart(userId);
  const existing = cart.find(c => c.productId === item.productId && c.sellerId === item.sellerId);
  if (existing) {
    existing.quantity += item.quantity;
    if (item.unitIds && item.unitIds.length > 0) {
        const existingUnits = existing.unitIds || [];
        const newUnits = item.unitIds.filter(id => !existingUnits.includes(id));
        existing.unitIds = [...existingUnits, ...newUnits];
    }
  } else {
    cart.push(item);
  }
  localStorage.setItem(CART_KEY_PREFIX + userId, JSON.stringify(cart));
};

export const removeFromCart = (userId: string, itemId: string): void => {
    const cart = getCart(userId).filter(c => c.id !== itemId);
    localStorage.setItem(CART_KEY_PREFIX + userId, JSON.stringify(cart));
};

export const clearCart = (userId: string): void => {
    localStorage.removeItem(CART_KEY_PREFIX + userId);
};

// --- Returns Logic ---

export const returnUnitsToManufacturer = (unitIds: string[]): void => {
  const allUnits = getProductUnits();
  unitIds.forEach(id => {
    const unit = allUnits.find(u => u.id === id);
    if (unit) {
      unit.status = 'RETURNED_DEFECTIVE';
      unit.dateReturned = new Date().toISOString().split('T')[0];
    }
  });
  localStorage.setItem(UNITS_KEY, JSON.stringify(allUnits));
};

export const returnBulkToManufacturer = (productId: string, sellerId: string, quantity: number): void => {
    const allStock = getBulkStock();
    const sellerStock = allStock.find(s => s.productId === productId && s.ownerId === sellerId);
    if (sellerStock && sellerStock.quantity >= quantity) {
        sellerStock.quantity -= quantity;
        const products = getProducts();
        const prod = products.find(p => p.id === productId);
        if (prod) {
             const mfgStock = allStock.find(s => s.productId === productId && s.ownerId === prod.manufacturerId);
             if (mfgStock) mfgStock.quantity += quantity;
        }
    }
    localStorage.setItem(BULK_STOCK_KEY, JSON.stringify(allStock));
};

export const requestOrderReturn = (orderId: string): void => {
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);
  const units = getProductUnits();
  if (order) {
    order.status = 'Return Requested';
    if (order.assignedUnitIds) {
        order.assignedUnitIds.forEach(uid => {
        const u = units.find(unit => unit.id === uid);
        if (u) u.status = 'RETURN_REQUESTED';
        });
        localStorage.setItem(UNITS_KEY, JSON.stringify(units));
    }
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }
};

export const processBuyerReturn = (orderId: string, accept: boolean): void => {
    const orders = getOrders();
    const order = orders.find(o => o.id === orderId);
    const units = getProductUnits();
    if (order) {
      if (accept) {
          order.status = 'Returned';
          if (order.assignedUnitIds) {
             order.assignedUnitIds.forEach(uid => {
                const u = units.find(unit => unit.id === uid);
                if (u) u.status = 'RETURNED_TO_SELLER';
             });
             localStorage.setItem(UNITS_KEY, JSON.stringify(units));
          } else {
             const stocks = getBulkStock();
             const sellerStock = stocks.find(s => s.productId === order.productId && s.ownerId === order.sellerId);
             if (sellerStock) {
                 sellerStock.quantity += order.quantity;
                 localStorage.setItem(BULK_STOCK_KEY, JSON.stringify(stocks));
             }
          }
      } else {
        order.status = 'Delivered';
        if (order.assignedUnitIds) {
            order.assignedUnitIds.forEach(uid => {
                const u = units.find(unit => unit.id === uid);
                if (u) u.status = 'SOLD_TO_BUYER'; 
            });
            localStorage.setItem(UNITS_KEY, JSON.stringify(units));
        }
      }
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
};

// --- Order Management ---

export const getOrders = (): Order[] => {
  const stored = localStorage.getItem(ORDERS_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveOrder = (order: Order): void => {
  const orders = getOrders();
  const index = orders.findIndex(o => o.id === order.id);
  if (index >= 0) orders[index] = order;
  else orders.push(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
};

// ---------------------------------------------------------
// CRITICAL UPDATE: REBUILT TRANSACTION LOGIC FOR CHECKOUT
// ---------------------------------------------------------
export const processCheckout = (user: User, cartItems: CartItem[]): void => {
    const products = getProducts();
    let allUnits = getProductUnits();
    let allStock = getBulkStock();
    let allOrders = getOrders();

    // Step A: Validation Phase
    // Ensure all items are in stock before processing any order
    for (const item of cartItems) {
        let sellerId = item.sellerId;
        // Fallback logic for missing sellerId (legacy support)
        if (!sellerId) {
             const productInList = products.find(p => p.id === item.productId);
             if (productInList) sellerId = productInList.manufacturerId;
        }

        if (!sellerId) throw new Error(`Data integrity error: Cannot identify seller for ${item.productName}. Please clear cart and try again.`);

        if (item.isSerialized) {
            const availableUnits = allUnits.filter(u => 
                u.productId === item.productId && 
                u.sellerId === sellerId && 
                (u.status === 'AT_SELLER' || u.status === 'RETURNED_TO_SELLER')
            );
            if (availableUnits.length < item.quantity) {
                throw new Error(`Insufficient stock for ${item.productName}. Requested: ${item.quantity}, Available: ${availableUnits.length}. Order cancelled.`);
            }
        } else {
            const stock = allStock.find(s => s.productId === item.productId && s.ownerId === sellerId);
             if (!stock || stock.quantity < item.quantity) {
                throw new Error(`Insufficient bulk stock for ${item.productName}. Order cancelled.`);
            }
        }
    }

    // Step B & C: Execution Phase (Order Creation & Inventory Deduction)
    const newOrders: Order[] = [];
    
    for (const item of cartItems) {
        // We can safely assume sellerId exists now due to validation phase
        let sellerId = item.sellerId || products.find(p => p.id === item.productId)?.manufacturerId;
        if (!sellerId) continue; 

        const newOrder: Order = {
            id: generateId(),
            productId: item.productId,
            productName: item.productName,
            sellerId: sellerId,
            buyerId: user.id,
            buyerName: user.name,
            quantity: item.quantity,
            status: 'Awaiting Confirmation',
            dateOrdered: new Date().toISOString().split('T')[0]
        };

        if (item.isSerialized) {
            // Get specific units to lock
             const availableUnits = allUnits.filter(u => 
                 u.productId === item.productId && 
                 u.sellerId === sellerId && 
                 (u.status === 'AT_SELLER' || u.status === 'RETURNED_TO_SELLER')
             );
             
             // FIFO Strategy: Take the first N available units
             const unitsToAssign = availableUnits.slice(0, item.quantity);
             const unitIds = unitsToAssign.map(u => u.id);
             
             // Update Units in memory to "SOLD"
             allUnits = allUnits.map(u => {
                 if (unitIds.includes(u.id)) {
                     return { 
                         ...u, 
                         status: 'SOLD_TO_BUYER', 
                         buyerId: user.id,
                         dateSold: new Date().toISOString().split('T')[0]
                     };
                 }
                 return u;
             });
             
             newOrder.assignedUnitIds = unitIds;
        } else {
            // Update Bulk Stock in memory
            allStock = allStock.map(s => {
                if (s.productId === item.productId && s.ownerId === sellerId) {
                    return { ...s, quantity: s.quantity - item.quantity };
                }
                return s;
            });
        }
        newOrders.push(newOrder);
    }

    // Step D: Commit Phase
    allOrders = [...allOrders, ...newOrders];
    
    // Atomic-like commit to storage
    localStorage.setItem(UNITS_KEY, JSON.stringify(allUnits));
    localStorage.setItem(BULK_STOCK_KEY, JSON.stringify(allStock));
    localStorage.setItem(ORDERS_KEY, JSON.stringify(allOrders));
    
    // Clear Cart for User (Satisfying Step D)
    localStorage.removeItem(CART_KEY_PREFIX + user.id);
    
    console.log("Order Process Success: Inventory Updated, Orders Created, Cart Cleared.");
};

export const fulfillOrder = (orderId: string, unitIds: string[] | null): void => {
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'Confirmed';
    order.dateConfirmed = new Date().toISOString().split('T')[0];
    if (unitIds && (!order.assignedUnitIds || order.assignedUnitIds.length === 0)) {
         const units = getProductUnits();
         order.assignedUnitIds = unitIds;
         unitIds.forEach(uid => {
            const u = units.find(unit => unit.id === uid);
            if (u) {
                u.status = 'SOLD_TO_BUYER';
                u.buyerId = order.buyerId;
                u.dateSold = new Date().toISOString().split('T')[0];
            }
         });
         localStorage.setItem(UNITS_KEY, JSON.stringify(units));
    }
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }
};

export const cancelOrder = (orderId: string): void => {
  const orders = getOrders();
  const orderIndex = orders.findIndex(o => o.id === orderId);
  const order = orders[orderIndex];
  if (order) {
      if (order.assignedUnitIds && order.assignedUnitIds.length > 0) {
          const units = getProductUnits();
          order.assignedUnitIds.forEach(uid => {
              const u = units.find(unit => unit.id === uid);
              if (u) {
                  u.status = 'AT_SELLER'; 
                  u.buyerId = undefined;
                  u.dateSold = undefined;
              }
          });
          localStorage.setItem(UNITS_KEY, JSON.stringify(units));
      } else {
          const allStock = getBulkStock();
          const stock = allStock.find(s => s.productId === order.productId && s.ownerId === order.sellerId);
          if (stock) stock.quantity += order.quantity;
          else {
              allStock.push({
                  id: generateId(),
                  productId: order.productId,
                  ownerId: order.sellerId,
                  quantity: order.quantity
              });
          }
          localStorage.setItem(BULK_STOCK_KEY, JSON.stringify(allStock));
      }
      orders.splice(orderIndex, 1);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }
};

export const getOrdersForSeller = (sellerId: string): Order[] => {
  return getOrders().filter(o => o.sellerId === sellerId);
};

export const getOrdersForBuyer = (buyerId: string): Order[] => {
  return getOrders().filter(o => o.buyerId === buyerId);
};