import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { getCurrentUser, logout, getUnreadCount } from './services/storage';
import Auth from './components/Auth';
import ManufacturerView from './components/ManufacturerView';
import SellerView from './components/SellerView';
import BuyerView from './components/BuyerView';
import AdminView from './components/AdminView';
import ProfileModal from './components/ProfileModal';
import AskeChatbot from './components/AskeChatbot';
import MessagingDrawer from './components/MessagingDrawer';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const storedUser = getCurrentUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setIsLoading(false);
  }, []);

  // Poll for notifications
  useEffect(() => {
      if (user) {
          const checkNotifications = () => {
              setUnreadCount(getUnreadCount(user.id));
          };
          checkNotifications();
          const interval = setInterval(checkNotifications, 5000);
          return () => clearInterval(interval);
      }
  }, [user]);

  const handleLogout = () => {
    logout();
    setUser(null);
    setShowProfile(false);
    setShowMessages(false);
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-neutral-950 text-neutral-500 font-display animate-pulse">Initializing Lallan Shop...</div>;

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  const renderDashboard = () => {
    switch (user.role) {
      case UserRole.ADMIN:
          return <AdminView user={user} />;
      case UserRole.MANUFACTURER:
        return <ManufacturerView user={user} />;
      case UserRole.SELLER:
        return <SellerView user={user} />;
      case UserRole.BUYER:
        return <BuyerView user={user} />;
      default:
        return <div className="text-white">Unknown Role</div>;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col relative selection:bg-white selection:text-black">
      {/* Background Ambience */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.03),transparent_50%)] pointer-events-none"></div>

      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-neutral-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer">
              <span className="font-display font-bold text-2xl text-white tracking-tight group-hover:opacity-80 transition-opacity">Lallan Shop</span>
              <div className="h-0.5 w-0 group-hover:w-full bg-white transition-all duration-500 ease-out"></div>
            </div>
            <div className="hidden sm:block h-6 w-px bg-white/10 mx-2"></div>
            
            {/* Dynamic Rainbow Aura Role Header (Border Only) */}
            <div className="aura-border-glow p-0.5 inline-flex items-center justify-center">
                <span className="relative z-10 px-4 py-1 bg-neutral-950 rounded-full text-xs font-mono uppercase tracking-widest text-white font-bold block leading-relaxed">
                   {user.role}
                </span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Notification Bell */}
            <button 
                onClick={() => setShowMessages(true)}
                className="relative p-2 text-neutral-400 hover:text-white transition-colors group"
            >
                <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-neutral-900 animate-pulse"></span>
                )}
            </button>

            <button 
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-3 group"
            >
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium text-white group-hover:text-neutral-300 transition-colors">{user.name}</p>
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Account</p>
              </div>
              
              <div className="w-10 h-10 bg-neutral-900 border border-white/10 rounded-full flex items-center justify-center overflow-hidden group-hover:border-white transition-all duration-300">
                {user.profileImage ? (
                  <img src={user.profileImage} alt="User" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-display font-bold text-white group-hover:text-neutral-300">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-neutral-500 hover:text-white transition-colors"
              title="Log Out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-12 w-full relative z-10">
        {renderDashboard()}
      </main>

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal 
          user={user} 
          onClose={() => setShowProfile(false)} 
          onUpdate={(updatedUser) => setUser(updatedUser)}
          onLogout={handleLogout}
        />
      )}

      {/* Messaging Drawer */}
      <MessagingDrawer 
          isOpen={showMessages}
          onClose={() => setShowMessages(false)}
          currentUser={user}
      />

      {/* Aske Verification Bot - RESTRICTED TO BUYERS */}
      {user.role === UserRole.BUYER && <AskeChatbot />}
    </div>
  );
}

export default App;