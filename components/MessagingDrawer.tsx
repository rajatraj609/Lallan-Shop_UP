import React, { useState, useEffect, useRef } from 'react';
import { User, Message, UserRole } from '../types';
import { getMessages, sendMessage, markMessageAsRead, getUsers, getCurrentUser, endDiscussion } from '../services/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
}

const MessagingDrawer: React.FC<Props> = ({ isOpen, onClose, currentUser }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [availableRecipients, setAvailableRecipients] = useState<User[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  
  // State for the Three Dots Menu
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // State to handle "Start New Chat" on an ended discussion
  const [isChatReopened, setIsChatReopened] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
        loadData();
        const interval = setInterval(loadData, 3000); // Poll for new messages
        return () => clearInterval(interval);
    }
  }, [isOpen, selectedRecipientId]);

  useEffect(() => {
      setInputText('');
      setActiveMenuId(null); // Close menus when changing chats
      setIsChatReopened(false); // Reset reopen state when switching users
  }, [selectedRecipientId]);

  useEffect(() => {
      // Auto-scroll on new messages or chat change
      if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
  }, [messages, selectedRecipientId, isChatReopened]);

  // Click outside listener to close menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setActiveMenuId(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = () => {
      const allMsgs = getMessages();
      setMessages(allMsgs);

      // Filter Users for "New Chat" based on Role Logic
      const allUsers = getUsers();
      let targets: User[] = [];

      if (currentUser.role === UserRole.ADMIN) {
          targets = allUsers.filter(u => u.id !== currentUser.id);
      } else if (currentUser.role === UserRole.MANUFACTURER) {
          targets = allUsers.filter(u => u.role === UserRole.ADMIN || u.role === UserRole.SELLER);
      } else if (currentUser.role === UserRole.SELLER) {
          targets = allUsers.filter(u => u.role === UserRole.ADMIN || u.role === UserRole.MANUFACTURER || u.role === UserRole.BUYER); 
      } else if (currentUser.role === UserRole.BUYER) {
          targets = allUsers.filter(u => u.role === UserRole.ADMIN);
      }
      setAvailableRecipients(targets);
  };

  const handleSend = (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputText.trim() || !selectedRecipientId) return;

      const recipient = getUsers().find(u => u.id === selectedRecipientId);
      if (!recipient) return;

      const newMessage: Message = {
          id: Date.now().toString(),
          senderId: currentUser.id,
          senderName: currentUser.name,
          receiverId: recipient.id,
          receiverName: recipient.name,
          text: inputText,
          timestamp: new Date().toISOString(),
          isRead: false,
          type: 'text'
      };

      sendMessage(newMessage);
      setInputText('');
      // Sending a message naturally "reopens" the chat because the last message is now text, not system
      setIsChatReopened(false); 
      loadData();
  };

  const handleMenuToggle = (e: React.MouseEvent, partnerId: string) => {
      e.stopPropagation();
      setActiveMenuId(activeMenuId === partnerId ? null : partnerId);
  };

  const handleEndChat = (e: React.MouseEvent, partnerId: string) => {
      e.stopPropagation(); // Prevent navigation
      
      // Permanently delete the conversation for both parties
      endDiscussion(currentUser.id, partnerId);
      
      // Refresh local state immediately to reflect deletion
      loadData();
      
      if (selectedRecipientId === partnerId) {
          setSelectedRecipientId(null);
      }
      setActiveMenuId(null);
      setIsChatReopened(false);
  };

  // Handle starting a new chat from the locked overlay
  const handleStartNewConversation = () => {
      setIsChatReopened(true);
      // We don't delete history, we just unlock the input so they can append new messages.
  };

  const handleNewChatSelection = (uid: string) => {
      setSelectedRecipientId(uid);
      setIsChatReopened(false); // Reset state for the new user
  };

  // Group messages by conversation partner
  const getConversations = () => {
      const convos = new Set<string>();
      messages.forEach(m => {
          if (m.senderId === currentUser.id) convos.add(m.receiverId);
          if (m.receiverId === currentUser.id) convos.add(m.senderId);
      });
      
      return Array.from(convos).map(partnerId => {
          const partner = getUsers().find(u => u.id === partnerId);
          // Sort messages to find the last one
          const relevantMsgs = messages.filter(m => 
              (m.senderId === currentUser.id && m.receiverId === partnerId) || 
              (m.receiverId === currentUser.id && m.senderId === partnerId)
          ).sort((a,b) => b.timestamp.localeCompare(a.timestamp));
          
          if (relevantMsgs.length === 0) return null; // Should not happen given logic, but safety check

          const lastMsg = relevantMsgs[0];
          const unreadCount = messages.filter(m => m.receiverId === currentUser.id && m.senderId === partnerId && !m.isRead).length;
          
          return {
              partner,
              lastMsg,
              unreadCount
          };
      }).filter(c => c && c.partner) as { partner: User, lastMsg: Message, unreadCount: number }[]; 
  };

  const activeChatMessages = selectedRecipientId 
      ? messages.filter(m => 
          (m.senderId === currentUser.id && m.receiverId === selectedRecipientId) || 
          (m.receiverId === currentUser.id && m.senderId === selectedRecipientId)
        ).sort((a,b) => a.timestamp.localeCompare(b.timestamp))
      : [];

  // Determine if the current chat is "Ended"
  const lastActiveMsg = activeChatMessages.length > 0 ? activeChatMessages[activeChatMessages.length - 1] : null;
  const isChatEnded = lastActiveMsg?.type === 'system' && !isChatReopened;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div ref={drawerRef} id="drawer-root" className="w-full max-w-4xl h-full bg-neutral-900 border-l border-white/10 shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-right duration-300">
            
            {/* Sidebar: Conversations */}
            <div className="w-full md:w-80 border-r border-white/5 bg-neutral-950 flex flex-col">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-neutral-900">
                    <h2 className="font-display font-bold text-white">Messages</h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                    {getConversations().map(c => {
                        const isMenuOpen = activeMenuId === c.partner.id;

                        return (
                            <div 
                                key={c.partner.id}
                                onClick={() => { setSelectedRecipientId(c.partner.id); }}
                                className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors relative group cursor-pointer ${selectedRecipientId === c.partner.id ? 'bg-white/10' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1 pr-6 relative">
                                    <span className="font-bold text-sm text-white">{c.partner.name}</span>
                                    {c.unreadCount > 0 && <span className="bg-red-600 text-white text-[10px] px-1.5 rounded-full">{c.unreadCount}</span>}
                                    
                                    {/* Three Dots Button */}
                                    <button 
                                        onClick={(e) => handleMenuToggle(e, c.partner.id)}
                                        className={`absolute -right-2 top-0 p-1 text-neutral-400 hover:text-white rounded-full hover:bg-white/10 transition-all ${isMenuOpen ? 'opacity-100 bg-white/10 text-white' : 'opacity-0 group-hover:opacity-100'}`}
                                        title="Options"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                                        </svg>
                                    </button>

                                    {/* Dropdown Menu */}
                                    {isMenuOpen && (
                                        <div 
                                            ref={menuRef}
                                            className="absolute right-0 top-6 z-50 w-40 bg-neutral-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button 
                                                onClick={(e) => handleEndChat(e, c.partner.id)}
                                                className="w-full text-left px-4 py-3 text-xs font-medium text-neutral-300 hover:bg-white/5 hover:text-white transition-colors"
                                            >
                                                Delete Chat
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-between items-end">
                                    <p className={`text-xs truncate max-w-[140px] ${c.lastMsg?.type === 'system' ? 'text-neutral-400 italic' : 'text-neutral-500'}`}>
                                        {c.lastMsg?.text}
                                    </p>
                                    <span className="text-[10px] text-neutral-600 border border-white/10 px-1 rounded">{c.partner.role}</span>
                                </div>
                            </div>
                        );
                    })}
                    
                    {getConversations().length === 0 && (
                        <div className="p-8 text-center text-neutral-600 text-sm">No active discussions.</div>
                    )}
                </div>

                {/* New Chat Button */}
                <div className="p-4 border-t border-white/5 bg-neutral-900">
                    <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wide">Start New Chat</p>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {availableRecipients.map(u => (
                            <button 
                                key={u.id}
                                onClick={() => handleNewChatSelection(u.id)}
                                className="flex-shrink-0 w-10 h-10 rounded-full bg-neutral-800 border border-white/10 hover:bg-white hover:text-black transition-colors flex items-center justify-center text-xs font-bold"
                                title={`Message ${u.name} (${u.role})`}
                            >
                                {u.name.charAt(0)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-neutral-900/50 relative">
                {selectedRecipientId ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5 backdrop-blur z-20 relative">
                            <div>
                                <h3 className="text-white font-bold">{getUsers().find(u => u.id === selectedRecipientId)?.name}</h3>
                                <span className="text-xs text-neutral-500">{getUsers().find(u => u.id === selectedRecipientId)?.role}</span>
                            </div>
                        </div>

                        {/* Messages List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-neutral-700 relative" ref={scrollRef}>
                            
                            {activeChatMessages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-neutral-600 animate-in fade-in duration-300">
                                    <p className="text-sm font-medium">Start a new conversation</p>
                                    <p className="text-[10px] text-neutral-500 mt-2 uppercase tracking-wider">Secure Channel Ready</p>
                                </div>
                            ) : (
                                activeChatMessages.map(msg => {
                                    // Handle System Messages (End of Discussion Pill)
                                    if (msg.type === 'system') {
                                        return (
                                            <div key={msg.id} className="w-full flex items-center justify-center my-8 animate-in zoom-in duration-500">
                                                <div className="relative w-full max-w-sm flex items-center gap-4">
                                                     <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-white/5 flex-1"></div>
                                                     <div className="bg-neutral-900 px-6 py-2 rounded-full border border-white/10">
                                                         <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                                                             End of Discussion
                                                         </span>
                                                     </div>
                                                     <div className="h-px bg-gradient-to-l from-transparent via-white/20 to-white/5 flex-1"></div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    const isMe = msg.senderId === currentUser.id;
                                    if (!isMe && !msg.isRead) markMessageAsRead(msg.id); // Auto read

                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                                            <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${
                                                isMe 
                                                ? 'bg-white text-black rounded-tr-none' 
                                                : 'bg-neutral-800 text-neutral-200 border border-white/10 rounded-tl-none'
                                            }`}>
                                                <p>{msg.text}</p>
                                                <span className={`text-[9px] block mt-1 ${isMe ? 'text-neutral-400' : 'text-neutral-500'}`}>
                                                    {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSend} className="p-4 border-t border-white/5 bg-neutral-900 flex gap-2 relative">
                            {/* Input Lock Overlay with Start New Chat Button */}
                            {isChatEnded && (
                                <div className="absolute inset-0 bg-neutral-900/90 backdrop-blur-sm z-10 flex items-center justify-center gap-4 animate-in fade-in duration-300">
                                    <span className="text-[10px] uppercase text-neutral-500 font-bold tracking-widest">
                                        Chat Ended
                                    </span>
                                    <button 
                                        type="button"
                                        onClick={handleStartNewConversation}
                                        className="px-6 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-neutral-200 transition-transform hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                                    >
                                        Start New Conversation
                                    </button>
                                </div>
                            )}

                            <input 
                                type="text"
                                className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-all disabled:opacity-50"
                                placeholder={isChatEnded ? "Conversation ended" : "Type a message..."}
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                disabled={isChatEnded}
                            />
                            <button 
                                type="submit" 
                                disabled={isChatEnded}
                                className="px-4 bg-white text-black rounded-xl font-bold hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-600">
                        <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                        <p>Select a contact to start messaging.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default MessagingDrawer;