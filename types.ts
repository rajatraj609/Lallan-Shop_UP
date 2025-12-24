
export enum UserRole {
  MANUFACTURER = 'Manufacturer',
  SELLER = 'Seller',
  BUYER = 'Buyer',
  ADMIN = 'Admin'
}

export type UserStatus = 'Pending' | 'Approved' | 'Rejected';

export interface User {
  id: string;
  email: string;
  password?: string;
  role: UserRole;
  name: string;
  dob?: string;
  phone?: string;
  phoneCode?: string;
  profileImage?: string; // Base64 encoded image
  
  // Moderation
  status?: UserStatus;
  isBanned?: boolean;
  rejectionReason?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string; // Could be 'ADMIN' generic or specific ID
  receiverName: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  type?: 'text' | 'system'; // New field to distinguish normal chats from system events
  isClosed?: boolean; 
  attachmentUrl?: string; 
}

export type UnitStatus = 
  | 'IN_FACTORY' 
  | 'IN_TRANSIT_TO_SELLER' 
  | 'AT_SELLER' 
  | 'SOLD_TO_BUYER'
  | 'RETURN_REQUESTED'       // Buyer wants to return
  | 'RETURNED_TO_SELLER'     // Back at Seller (Good condition)
  | 'RETURNED_DEFECTIVE';    // Sent back to Manufacturer

export interface ProductUnit {
  id: string;
  productId: string;
  serialNumber: string;
  status: UnitStatus;
  
  // Anti-Counterfeit (Aske System)
  uniqueAuthHash?: string; // SHA-256 Hash
  
  // Traceability
  manufacturerId: string;
  sellerId?: string;
  buyerId?: string;
  
  // Timeline
  manufacturingDate: string;
  dateSentToSeller?: string;
  dateSold?: string;
  dateReturned?: string;
}

// New Interface for Non-Serialized Inventory
export interface BulkStock {
  id: string;
  productId: string;
  ownerId: string; // Can be Manufacturer or Seller
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  manufacturerId: string;
  isSerialized: boolean; 
  description?: string;
  images?: string[]; // Array of Base64 strings
}

export interface CartItem {
  id: string; // cart item id
  productId: string;
  productName: string;
  quantity: number;
  isSerialized: boolean;
  price?: number; // Optional for demo
  unitIds?: string[]; // Specific units selected (for Manufacturer dispatch)
  sellerId?: string; // For Buyers: which seller they are buying from
}

export type OrderStatus = 'Awaiting Confirmation' | 'Confirmed' | 'Delivered' | 'Return Requested' | 'Returned';

export interface Order {
  id: string;
  productId: string;
  productName: string;
  
  sellerId: string;
  buyerId: string;
  buyerName: string;
  
  quantity: number;
  status: OrderStatus;
  
  // New field: Specific units assigned to this order (Only if isSerialized)
  assignedUnitIds?: string[];
  
  dateOrdered: string;
  dateConfirmed?: string;
  dateDelivered?: string;
}

export interface PasswordScore {
  score: number;
  label: string;
  color: string;
}

export interface GlobalSettings {
  serialRangeStart: number;
  serialRangeEnd: number;
  recycledSerials: number[]; // Numbers that were deleted and can be reused
  systemMessages: string[]; // Array of up to 3 strings for Home Page announcements
  
  // Website Content (HTML strings containing text and base64 images)
  contentHowItWorks?: string;
  contentOurStory?: string;
  contentSupport?: string;
  contentPrivacy?: string;
  contentTerms?: string;
}