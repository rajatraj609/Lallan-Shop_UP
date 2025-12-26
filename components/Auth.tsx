import React, { useState, useEffect } from 'react';
import { User, UserRole, GlobalSettings } from '../types';
import { saveUser, findUserByEmail, login, generateId, resetPassword, getGlobalSettings } from '../services/storage';
import PasswordStrength from './PasswordStrength';

interface Props {
  onLogin: (user: User) => void;
}

type AuthMode = 'LOGIN' | 'SIGNUP' | 'RECOVERY_VERIFY' | 'RECOVERY_RESET';

const Auth: React.FC<Props> = ({ onLogin }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  
  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  // New Fields for Signup & Recovery
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  
  // Reset Password Specifics
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  
  // Validation States
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  // System Messages State
  const [systemMessages, setSystemMessages] = useState<string[]>([]);
  const [activeMsgIndex, setActiveMsgIndex] = useState(0);

  // Info Modal State
  const [activeInfoModal, setActiveInfoModal] = useState<{title: string, content: string} | null>(null);
  const [siteSettings, setSiteSettings] = useState<GlobalSettings | null>(null);

  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Load settings on mount
    const settings = getGlobalSettings();
    setSiteSettings(settings);
    // Filter out empty strings
    const msgs = (settings.systemMessages || []).filter(m => m.trim() !== '');
    setSystemMessages(msgs);
  }, []);

  // Auto-rotate messages every 4 seconds
  useEffect(() => {
    if (systemMessages.length <= 1) return;

    const interval = setInterval(() => {
        setActiveMsgIndex((prev) => (prev + 1) % systemMessages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [systemMessages]);

  const handleInfoClick = (type: 'how' | 'story' | 'support' | 'privacy' | 'terms') => {
      if (!siteSettings) return;
      let title = '';
      let content = '';

      switch(type) {
          case 'how': 
             title = 'How it works'; 
             content = siteSettings.contentHowItWorks || "Content not available.";
             break;
          case 'story': 
             title = 'Our Story'; 
             content = siteSettings.contentOurStory || "Content not available.";
             break;
          case 'support': 
             title = 'Support'; 
             content = siteSettings.contentSupport || "Content not available.";
             break;
          case 'privacy': 
             title = 'Privacy Policy'; 
             content = siteSettings.contentPrivacy || "Content not available.";
             break;
          case 'terms': 
             title = 'Terms of Service'; 
             content = siteSettings.contentTerms || "Content not available.";
             break;
      }
      setActiveInfoModal({ title, content });
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setError('');
    setSuccessMsg('');
    setRejectionReason(null);
    setAuthMode('LOGIN');
    resetForm();
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setPhone('');
    setDob('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleRecoveryVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const user = findUserByEmail(email);
    const cleanInputPhone = phone.replace(/\D/g, '');
    const userCleanPhone = user?.phone?.replace(/\D/g, '');
    
    // Strict Verification: Check if User exists AND Phone matches AND DOB matches
    if (user && userCleanPhone === cleanInputPhone && user.dob === dob) {
        setSuccessMsg('Identity verified. Please set a new password.');
        setAuthMode('RECOVERY_RESET');
    } else {
        setError('Verification failed. Details do not match our records.');
    }
  };

  const handlePasswordReset = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (!isPasswordValid) {
          setError('New password does not meet strength requirements.');
          return;
      }
      if (newPassword !== confirmNewPassword) {
          setError('Passwords do not match.');
          return;
      }

      const user = findUserByEmail(email);
      if (user) {
          resetPassword(user.id, newPassword);
          setSuccessMsg('Password reset successful. Please login.');
          setAuthMode('LOGIN');
          setPassword('');
      } else {
          setError('An unexpected error occurred.');
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setRejectionReason(null);

    if (authMode === 'LOGIN') {
      const user = findUserByEmail(email);
      if (user && user.password === password) {
        
        // --- 1. Admin Logic (Auto-Detect or Switch) ---
        if (user.role === UserRole.ADMIN) {
             login(user);
             onLogin(user);
             return;
        }

        // --- 2. Ban Logic ---
        if (user.isBanned) {
            setError("This account has been suspended for violating Lallan Shop terms. Contact Support if you believe this is an error.");
            return;
        }

        // --- 3. Role Mismatch ---
        if (selectedRole && user.role !== selectedRole) {
            setError(`Account found, but it is registered as ${user.role}. Please switch portals.`);
            return;
        }

        // --- 4. Moderation Status Logic ---
        if (user.status === 'Pending') {
             setSuccessMsg("Your account is currently Pending Approval. Please wait for an Administrator to verify your details.");
             return;
        }

        if (user.status === 'Rejected') {
             setRejectionReason(user.rejectionReason || "No reason provided.");
             setError("Application Rejected.");
             return;
        }

        // --- 5. Success ---
        login(user);
        onLogin(user);

      } else {
        setError('Invalid credentials.');
      }
    } else if (authMode === 'SIGNUP') {
      if (selectedRole === UserRole.ADMIN) {
          setError("Admin registration is restricted.");
          return;
      }

      if (!isPasswordValid) {
        setError('Password strength requirement not met.');
        return;
      }
      if (findUserByEmail(email)) {
        setError('Email already registered.');
        return;
      }

      if (!phone || !dob) {
          setError('Phone number and Date of Birth are required.');
          return;
      }

      const cleanPhone = phone.replace(/\D/g, '');
      const indianPhoneRegex = /^[6-9]\d{9}$/;

      if (!indianPhoneRegex.test(cleanPhone)) {
          setError('Invalid Phone. Must be 10 digits starting with 6, 7, 8, or 9.');
          return;
      }

      const newUser: User = {
        id: generateId(),
        email,
        password,
        role: selectedRole!,
        name,
        phone: cleanPhone,
        dob,
        status: selectedRole === UserRole.BUYER ? 'Approved' : 'Pending', // Gatekeeping
        isBanned: false
      };

      saveUser(newUser);
      setAuthMode('LOGIN');
      
      if (newUser.status === 'Pending') {
          setSuccessMsg('Registration successful. Your account is Pending Approval.');
      } else {
          setSuccessMsg('Registration successful. Welcome to Lallan Shop.');
      }
      resetForm();
    }
  };

  const renderHeader = () => {
      switch(authMode) {
          case 'LOGIN': return 'Welcome Back';
          case 'SIGNUP': return 'Join Our Group';
          case 'RECOVERY_VERIFY': return 'Identity Verification';
          case 'RECOVERY_RESET': return 'Reset Credentials';
          default: return '';
      }
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans relative overflow-x-hidden selection:bg-indigo-500/30">
      
      {/* --- Website Header --- */}
      <header className="w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between z-50">
          <div className="flex items-center gap-3 select-none">
             <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-black font-bold text-xl shadow-[0_0_15px_rgba(255,255,255,0.2)]">L</div>
             <span className="text-xl font-display font-bold tracking-tight text-white">Lallan Shop</span>
          </div>
          
          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
             <button onClick={() => handleInfoClick('how')} className="hover:text-white transition-colors">How it works</button>
             <button onClick={() => handleInfoClick('story')} className="hover:text-white transition-colors">Our Story</button>
             <button onClick={() => handleInfoClick('support')} className="hover:text-white transition-colors">Support</button>
          </div>

          {/* Mobile Menu Button */}
          <button 
             onClick={() => setIsMobileMenuOpen(true)}
             className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
             aria-label="Open Menu"
          >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
               <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
             </svg>
          </button>
      </header>

      {/* --- Main Content --- */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8 relative z-10 w-full">
         
         {/* Background Ambience */}
         <div className="absolute top-1/4 left-1/4 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-indigo-500/10 rounded-full blur-[80px] md:blur-[120px] pointer-events-none mix-blend-screen animate-pulse"></div>
         <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none"></div>

         <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 shadow-2xl rounded-3xl overflow-hidden border border-white/5 bg-neutral-900/60 backdrop-blur-xl mx-auto">
            
            {/* Left Panel - Hero/Visual (Hidden on Mobile) */}
            <div className="hidden md:flex flex-col justify-between p-12 bg-neutral-900/60 relative border-r border-white/5 overflow-hidden">
               {/* Background Image Fix: Using inline style for reliability */}
               <div 
                 className="absolute inset-0 bg-cover bg-center opacity-30 grayscale pointer-events-none"
                 style={{ backgroundImage: "url('https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070&auto=format&fit=crop')" }}
               ></div>
               
               <div className="relative z-10">
                 <h1 className="text-5xl font-display font-bold text-white tracking-tight mb-4 leading-tight">Curating<br/>Excellence.</h1>
                 <p className="text-neutral-400 text-lg font-light leading-relaxed max-w-xs">
                   Bridging the gap between master craftsmanship and discerning collectors with secure, verified supply chains.
                 </p>
                 
                 {/* Desktop Admin Access */}
                 <button
                    onClick={() => handleRoleSelect(UserRole.ADMIN)}
                    className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-black/40 text-xs font-mono text-neutral-400 hover:text-white hover:bg-white/10 hover:border-white/30 transition-all cursor-pointer backdrop-blur-md group"
                 >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 group-hover:animate-ping"></span>
                    Admin Console
                 </button>
               </div>
               
               {/* Admin System Messages Carousel */}
               {systemMessages.length > 0 && (
                   <div className="relative z-10 animate-in fade-in duration-500">
                        {/* Dots */}
                        <div className="flex gap-2 mb-2">
                             {systemMessages.map((_, idx) => (
                                 <button 
                                     key={idx}
                                     onClick={() => setActiveMsgIndex(idx)}
                                     className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${activeMsgIndex === idx ? 'bg-white scale-125' : 'bg-neutral-600 hover:bg-neutral-400'}`}
                                     aria-label={`Show message ${idx + 1}`}
                                 />
                             ))}
                        </div>
                        {/* Active Message */}
                        <p className="text-xs text-neutral-400 tracking-wide font-mono min-h-[1.25rem] transition-all duration-300 animate-in fade-in slide-in-from-right-2" key={activeMsgIndex}>
                             {systemMessages[activeMsgIndex]}
                        </p>
                   </div>
               )}
            </div>

            {/* Right Panel - Auth Form */}
            <div className="p-6 md:p-12 flex flex-col justify-center bg-black/40 relative">
              
              {!selectedRole ? (
                 <div className="animate-in slide-in-from-right-8 duration-500">
                    <h2 className="text-2xl font-display font-semibold text-white mb-2">Select Portal</h2>
                    <p className="text-neutral-500 text-sm mb-8">Choose your specialized access point.</p>
                    
                    <div className="space-y-3">
                        <button onClick={() => handleRoleSelect(UserRole.BUYER)} className="w-full group bg-neutral-900/50 border border-white/5 hover:border-white/20 hover:bg-white/5 p-4 rounded-xl flex items-center gap-4 transition-all overflow-hidden relative">
                            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-white group-hover:scale-110 transition-transform relative z-10">
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                            </div>
                            <div className="text-left relative z-10">
                                <h3 className="text-white font-medium group-hover:scale-105 transition-transform origin-left">
                                    Buyer
                                </h3>
                                <p className="text-xs text-neutral-500">Shopping & Orders</p>
                            </div>
                        </button>

                        <button onClick={() => handleRoleSelect(UserRole.SELLER)} className="w-full group bg-neutral-900/50 border border-white/5 hover:border-white/20 hover:bg-white/5 p-4 rounded-xl flex items-center gap-4 transition-all overflow-hidden relative">
                            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-white group-hover:scale-110 transition-transform relative z-10">
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" /></svg>
                            </div>
                            <div className="text-left relative z-10">
                                <h3 className="text-white font-medium group-hover:scale-105 transition-transform origin-left">
                                    Seller
                                </h3>
                                <p className="text-xs text-neutral-500">Retail & Inventory</p>
                            </div>
                        </button>

                        <button onClick={() => handleRoleSelect(UserRole.MANUFACTURER)} className="w-full group bg-neutral-900/50 border border-white/5 hover:border-white/20 hover:bg-white/5 p-4 rounded-xl flex items-center gap-4 transition-all overflow-hidden relative">
                            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-white group-hover:scale-110 transition-transform relative z-10">
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>
                            </div>
                            <div className="text-left relative z-10">
                                <h3 className="text-white font-medium group-hover:scale-105 transition-transform origin-left">
                                    Manufacturer
                                </h3>
                                <p className="text-xs text-neutral-500">Production & Distribution</p>
                            </div>
                        </button>
                    </div>

                    {/* Mobile Only Admin Link */}
                    <div className="mt-8 pt-6 border-t border-white/5 flex justify-center md:hidden">
                        <button onClick={() => handleRoleSelect(UserRole.ADMIN)} className="text-xs text-neutral-600 hover:text-white transition-colors flex items-center gap-2">
                             <span className="w-1.5 h-1.5 rounded-full bg-red-900"></span>
                             System Admin Login
                        </button>
                    </div>
                 </div>
              ) : (
                <div className="animate-in slide-in-from-right-8 duration-500">
                  <div className="flex justify-between items-center mb-6">
                      <button onClick={() => setSelectedRole(null)} className="flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors group">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 group-hover:-translate-x-1 transition-transform">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                        </svg>
                        Switch Portal
                      </button>

                      {(authMode === 'RECOVERY_VERIFY' || authMode === 'RECOVERY_RESET') && (
                          <button onClick={() => { setAuthMode('LOGIN'); resetForm(); }} className="text-xs text-neutral-400 hover:text-white transition-colors">
                              Back to Login
                          </button>
                      )}
                  </div>

                  <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-display font-semibold text-white">
                            {renderHeader()}
                        </h2>
                        <div className="mt-2 text-neutral-500 uppercase tracking-wider text-sm font-bold">
                            {selectedRole} <span className="text-xs font-normal">PORTAL</span>
                        </div>
                    </div>
                    
                    {(authMode === 'LOGIN' || authMode === 'SIGNUP') && selectedRole !== UserRole.ADMIN && (
                        <div className="flex bg-neutral-900 rounded-full p-1 border border-white/10">
                        <button
                            onClick={() => { setAuthMode('LOGIN'); setError(''); setSuccessMsg(''); }}
                            className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-300 ${authMode === 'LOGIN' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
                        >
                            Login
                        </button>
                        <button
                            onClick={() => { setAuthMode('SIGNUP'); setError(''); setSuccessMsg(''); }}
                            className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-300 ${authMode === 'SIGNUP' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
                        >
                            Sign Up
                        </button>
                        </div>
                    )}
                  </div>

                  {/* Forms */}
                  {authMode === 'RECOVERY_VERIFY' && (
                      <form onSubmit={handleRecoveryVerify} className="space-y-5 animate-in fade-in duration-300">
                          <p className="text-sm text-neutral-400">To reset your password, please verify your identity using your registered details.</p>
                          <div>
                            <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Registered Email</label>
                            <input type="email" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition" placeholder="name@lallanshop.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Phone Number</label>
                                  <input type="tel" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition" placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
                              </div>
                              <div>
                                  <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Date of Birth</label>
                                  <input type="date" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition [color-scheme:dark]" value={dob} onChange={(e) => setDob(e.target.value)} />
                              </div>
                          </div>
                          {error && <p className="text-red-400 text-xs text-center py-2 bg-red-900/10 border border-red-500/20 rounded-lg">{error}</p>}
                          <button type="submit" className="w-full py-4 bg-white text-black font-bold font-display rounded-xl hover:bg-neutral-200 transition-all transform active:scale-[0.99] tracking-wide">Verify Identity</button>
                      </form>
                  )}

                  {authMode === 'RECOVERY_RESET' && (
                      <form onSubmit={handlePasswordReset} className="space-y-5 animate-in fade-in duration-300">
                          <div className="p-4 bg-emerald-900/10 border border-emerald-500/20 rounded-xl mb-4"><p className="text-emerald-400 text-xs text-center">{successMsg}</p></div>
                          <div>
                              <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">New Password</label>
                              <input type="password" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                              <div className="mt-3"><PasswordStrength password={newPassword} onValidationChange={setIsPasswordValid} /></div>
                          </div>
                          <div>
                              <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Confirm New Password</label>
                              <input type="password" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition" placeholder="••••••••" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
                          </div>
                          {error && <p className="text-red-400 text-xs text-center py-2 bg-red-900/10 border border-red-500/20 rounded-lg">{error}</p>}
                          <button type="submit" className="w-full py-4 bg-white text-black font-bold font-display rounded-xl hover:bg-neutral-200 transition-all transform active:scale-[0.99] tracking-wide">Reset Password</button>
                      </form>
                  )}

                  {(authMode === 'LOGIN' || authMode === 'SIGNUP') && (
                      <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-300">
                        {authMode === 'SIGNUP' && (
                          <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
                            <div>
                              <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Full Name</label>
                              <input type="text" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition placeholder-neutral-600" placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Phone</label>
                                    <input type="tel" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition placeholder-neutral-600" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                 </div>
                                 <div>
                                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Date of Birth</label>
                                    <input type="date" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition [color-scheme:dark]" value={dob} onChange={(e) => setDob(e.target.value)} />
                                 </div>
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Email Address</label>
                          <input type="email" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition placeholder-neutral-600" placeholder="name@lallanshop.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Password</label>
                          <input type="password" required className="w-full px-4 py-3 bg-neutral-900/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition placeholder-neutral-600" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                          {authMode === 'SIGNUP' ? (
                            <div className="mt-3"><PasswordStrength password={password} onValidationChange={setIsPasswordValid} /></div>
                          ) : (
                              <div className="flex justify-end mt-2">
                                  <button type="button" onClick={() => { setAuthMode('RECOVERY_VERIFY'); setError(''); setSuccessMsg(''); }} className="text-xs text-neutral-500 hover:text-white transition-colors">Forgot Password?</button>
                              </div>
                          )}
                        </div>
                        {error && (
                            <div className="py-3 bg-red-900/20 border border-red-500/20 rounded-lg text-center">
                                 <p className="text-red-400 text-xs">{error}</p>
                                 {rejectionReason && (
                                     <p className="text-red-300 text-[10px] mt-1 italic">"{rejectionReason}"</p>
                                 )}
                            </div>
                        )}
                        {successMsg && <p className="text-emerald-400 text-xs text-center py-2 bg-emerald-900/10 border border-emerald-500/20 rounded-lg">{successMsg}</p>}
                        <button type="submit" className="w-full py-4 bg-white text-black font-bold font-display rounded-xl hover:bg-neutral-200 transition-all transform active:scale-[0.99] tracking-wide">
                          {authMode === 'LOGIN' ? `Enter ${selectedRole} Portal` : 'Create Account'}
                        </button>
                      </form>
                  )}
                </div>
              )}
            </div>
         </div>

         {/* Footer Admin Link (Mobile Fallback if needed inside card) is handled. 
             This is the global footer */}
         <div className="mt-8 text-center text-xs text-neutral-600 hidden md:block absolute bottom-4">
             By accessing Lallan Shop, you agree to our Terms of Service.
         </div>
      </main>

      {/* --- Website Footer --- */}
      <footer className="w-full border-t border-white/5 bg-neutral-950/80 backdrop-blur-sm relative z-20">
          <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-neutral-500">
             <div className="flex items-center gap-4">
                 <span>© 2024 Lallan Shop. All rights reserved.</span>
                 <span className="hidden md:inline">•</span>
                 <button onClick={() => handleInfoClick('privacy')} className="hover:text-white transition-colors">Privacy</button>
                 <button onClick={() => handleInfoClick('terms')} className="hover:text-white transition-colors">Terms</button>
             </div>
             <div className="flex items-center gap-2">
                 <span>English (UK)</span>
             </div>
          </div>
      </footer>

      {/* MOBILE MENU DRAWER */}
      {isMobileMenuOpen && (
         <div className="fixed inset-0 z-[60] flex justify-end">
             {/* Backdrop */}
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsMobileMenuOpen(false)}></div>
             
             {/* Drawer */}
             <div className="relative w-72 h-full bg-neutral-900 border-l border-white/10 shadow-2xl p-6 flex flex-col animate-in slide-in-from-right duration-300">
                 <div className="flex justify-end mb-8">
                     <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-neutral-500 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                 </div>

                 <div className="flex flex-col gap-6 text-lg font-display font-medium text-neutral-300">
                     <button onClick={() => { handleInfoClick('how'); setIsMobileMenuOpen(false); }} className="text-left hover:text-white transition-colors">How it works</button>
                     <button onClick={() => { handleInfoClick('story'); setIsMobileMenuOpen(false); }} className="text-left hover:text-white transition-colors">Our Story</button>
                     <button onClick={() => { handleInfoClick('support'); setIsMobileMenuOpen(false); }} className="text-left hover:text-white transition-colors">Support</button>
                     <div className="h-px bg-white/10 my-2"></div>
                     <button onClick={() => { handleInfoClick('privacy'); setIsMobileMenuOpen(false); }} className="text-left text-sm text-neutral-500 hover:text-white transition-colors">Privacy Policy</button>
                     <button onClick={() => { handleInfoClick('terms'); setIsMobileMenuOpen(false); }} className="text-left text-sm text-neutral-500 hover:text-white transition-colors">Terms of Service</button>
                 </div>

                 {/* Rotating System Messages in Drawer */}
                 {systemMessages.length > 0 && (
                     <div className="mt-auto pt-8 border-t border-white/10">
                        <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-3 font-bold">Announcements</p>
                        <div className="min-h-[60px] flex items-center bg-black/30 p-4 rounded-xl border border-white/5">
                             <p className="text-sm text-white italic animate-in fade-in" key={activeMsgIndex}>
                                "{systemMessages[activeMsgIndex]}"
                             </p>
                        </div>
                        <div className="flex gap-2 mt-3 justify-center">
                             {systemMessages.map((_, idx) => (
                                 <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${idx === activeMsgIndex ? 'bg-white scale-125' : 'bg-neutral-700'}`} />
                             ))}
                        </div>
                     </div>
                 )}
             </div>
         </div>
      )}

      {/* INFO POPUP MODAL */}
      {activeInfoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
                <div className="p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <h2 className="text-lg font-display font-bold text-white uppercase tracking-wider">{activeInfoModal.title}</h2>
                    <button onClick={() => setActiveInfoModal(null)} className="text-neutral-500 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div 
                    className="p-8 overflow-y-auto bg-neutral-900/90 text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap rich-text-area"
                    dangerouslySetInnerHTML={{ __html: activeInfoModal.content }}
                />
                <style>{`
                    .rich-text-area img {
                        max-width: 100%;
                        border-radius: 8px;
                        margin: 15px 0;
                        border: 1px solid rgba(255,255,255,0.1);
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    }
                `}</style>
                <div className="p-6 border-t border-white/5 bg-neutral-900 flex justify-end">
                    <button onClick={() => setActiveInfoModal(null)} className="px-6 py-2 bg-white text-black text-sm font-bold rounded-xl hover:bg-neutral-200 transition-colors">Close</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Auth;