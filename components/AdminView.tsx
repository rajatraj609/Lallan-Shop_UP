import React, { useState, useEffect } from 'react';
import { User, UserRole, ProductUnit } from '../types';
import { getUsers, toggleUserBan, approveUser, rejectUser, getGlobalSettings, saveGlobalSettings, getProductUnits } from '../services/storage';
import RichTextEditor from './RichTextEditor';

interface Props {
  user: User;
}

const AdminView: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'config'>('users');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Config State
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [systemMessages, setSystemMessages] = useState<string[]>(['', '', '']);
  
  // Web Content State
  const [contentHowItWorks, setContentHowItWorks] = useState('');
  const [contentOurStory, setContentOurStory] = useState('');
  const [contentSupport, setContentSupport] = useState('');
  const [contentPrivacy, setContentPrivacy] = useState('');
  const [contentTerms, setContentTerms] = useState('');

  const [allUnits, setAllUnits] = useState<ProductUnit[]>([]);

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  const refreshData = () => {
    setAllUsers(getUsers().filter(u => u.role !== UserRole.ADMIN));
    setAllUnits(getProductUnits());
    
    const settings = getGlobalSettings();
    setRangeStart(settings.serialRangeStart);
    setRangeEnd(settings.serialRangeEnd);
    setSystemMessages(settings.systemMessages || ['', '', '']);
    
    setContentHowItWorks(settings.contentHowItWorks || '');
    setContentOurStory(settings.contentOurStory || '');
    setContentSupport(settings.contentSupport || '');
    setContentPrivacy(settings.contentPrivacy || '');
    setContentTerms(settings.contentTerms || '');
  };

  const handleBanToggle = (userId: string) => {
      toggleUserBan(userId);
      refreshData();
  };

  const handleApprove = (userId: string) => {
      approveUser(userId);
      refreshData();
      alert("User approved successfully. They can now login.");
  };

  const handleRejectClick = (userId: string) => {
      setRejectId(userId);
      setRejectReason('');
  };

  const confirmReject = () => {
      if (rejectId && rejectReason.trim()) {
          rejectUser(rejectId, rejectReason);
          setRejectId(null);
          setRejectReason('');
          refreshData();
      } else {
          alert("Please provide a reason for rejection.");
      }
  };

  const handleSaveSettings = () => {
      if (rangeEnd <= rangeStart) {
          alert("End range must be greater than start range.");
          return;
      }
      
      const settings = getGlobalSettings();
      saveGlobalSettings({
          ...settings,
          serialRangeStart: rangeStart,
          serialRangeEnd: rangeEnd,
          systemMessages: systemMessages,
          contentHowItWorks: contentHowItWorks,
          contentOurStory: contentOurStory,
          contentSupport: contentSupport,
          contentPrivacy: contentPrivacy,
          contentTerms: contentTerms
      });
      alert("Configuration Saved.");
      refreshData();
  };

  const handleMessageChange = (index: number, val: string) => {
      const updated = [...systemMessages];
      updated[index] = val;
      setSystemMessages(updated);
  };

  // Calculations for Progress Bar
  const numericUnits = allUnits.filter(u => !isNaN(parseInt(u.serialNumber)));
  const totalCapacity = rangeEnd - rangeStart + 1;
  const usedCount = numericUnits.length; // Approximate, or we could filter purely within range
  const percentage = Math.min(100, Math.max(0, (usedCount / totalCapacity) * 100));

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
       <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white text-center md:text-left">Central Command</h1>
          
          {/* Navigation - Optimized for Mobile */}
          <div className="bg-neutral-900 border border-white/10 p-1 rounded-full flex w-full md:w-auto overflow-x-auto no-scrollbar justify-center">
              <button 
                onClick={() => setActiveTab('users')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-full text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'users' ? 'bg-white text-black shadow-md' : 'text-neutral-400 hover:text-white'}`}
              >
                  User Management
              </button>
              <button 
                onClick={() => setActiveTab('config')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-full text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'config' ? 'bg-white text-black shadow-md' : 'text-neutral-400 hover:text-white'}`}
              >
                  System Config
              </button>
          </div>
       </div>

       {activeTab === 'users' && (
           <div className="bg-neutral-900/50 border border-white/5 rounded-3xl overflow-hidden">
               <div className="overflow-x-auto">
                   <table className="w-full text-left text-sm text-neutral-400">
                       <thead className="bg-white/5 text-neutral-200 uppercase text-xs font-bold tracking-wider">
                           <tr>
                               <th className="px-6 py-4">User</th>
                               <th className="px-6 py-4">Role</th>
                               <th className="px-6 py-4">Status</th>
                               <th className="px-6 py-4">Ban State</th>
                               <th className="px-6 py-4 text-right">Actions</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-white/5">
                           {allUsers.map(u => (
                               <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                   <td className="px-6 py-4">
                                       <div className="flex items-center gap-3">
                                           <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-white font-bold">
                                               {u.name.charAt(0)}
                                           </div>
                                           <div>
                                               <p className="text-white font-medium">{u.name}</p>
                                               <p className="text-xs">{u.email}</p>
                                           </div>
                                       </div>
                                   </td>
                                   <td className="px-6 py-4">
                                       <span className="bg-neutral-800 border border-white/10 px-2 py-1 rounded text-xs">
                                           {u.role}
                                       </span>
                                   </td>
                                   <td className="px-6 py-4">
                                       <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wide border ${
                                           u.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                           u.status === 'Rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                           'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                       }`}>
                                           {u.status || 'Pending'}
                                       </span>
                                   </td>
                                   <td className="px-6 py-4">
                                       {u.isBanned ? (
                                           <span className="text-red-500 font-bold flex items-center gap-1">
                                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                               BANNED
                                           </span>
                                       ) : (
                                           <span className="text-emerald-500 text-xs">Active</span>
                                       )}
                                   </td>
                                   <td className="px-6 py-4 text-right">
                                       <div className="flex justify-end gap-2">
                                           {u.status !== 'Approved' && (
                                               <>
                                                  <button onClick={() => handleApprove(u.id)} className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30" title="Approve">
                                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                  </button>
                                                  <button onClick={() => handleRejectClick(u.id)} className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30" title="Reject">
                                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                  </button>
                                               </>
                                           )}
                                           <button 
                                              onClick={() => handleBanToggle(u.id)} 
                                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${u.isBanned ? 'bg-white text-black hover:bg-neutral-200' : 'bg-red-600 text-white hover:bg-red-500'}`}
                                           >
                                               {u.isBanned ? 'Unban' : 'Ban User'}
                                           </button>
                                       </div>
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               </div>
           </div>
       )}

       {activeTab === 'config' && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-right-8 duration-500">
               {/* Serial Config */}
               <div className="bg-neutral-900 border border-white/5 p-8 rounded-3xl">
                   <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                       <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                       Global Serial Range
                   </h2>
                   
                   <div className="grid grid-cols-2 gap-4 mb-8">
                       <div className="space-y-2">
                           <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold">Start Value</label>
                           <input 
                             type="number" 
                             className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-lg focus:border-white/40 outline-none transition"
                             value={rangeStart}
                             onChange={(e) => setRangeStart(parseInt(e.target.value) || 0)}
                           />
                       </div>
                       <div className="space-y-2">
                           <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold">End Value</label>
                           <input 
                             type="number" 
                             className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-lg focus:border-white/40 outline-none transition"
                             value={rangeEnd}
                             onChange={(e) => setRangeEnd(parseInt(e.target.value) || 0)}
                           />
                       </div>
                   </div>

                   {/* Usage Visualization */}
                   <div className="bg-black/40 rounded-xl p-6 border border-white/5 mb-8">
                       <div className="flex justify-between items-end mb-2">
                           <span className="text-sm text-neutral-400">Range Utilization</span>
                           <span className="text-xs font-mono text-neutral-500">
                               {usedCount} / {totalCapacity} Units
                           </span>
                       </div>
                       <div className="h-4 bg-neutral-800 rounded-full overflow-hidden">
                           <div 
                             className={`h-full transition-all duration-1000 ease-out ${percentage > 90 ? 'bg-red-500' : 'bg-emerald-500'}`}
                             style={{ width: `${percentage}%` }}
                           ></div>
                       </div>
                       <div className="mt-2 text-right">
                           <span className={`text-xs font-bold ${percentage > 90 ? 'text-red-400' : 'text-emerald-400'}`}>
                               {percentage.toFixed(1)}% Used
                           </span>
                       </div>
                   </div>
               </div>

               {/* System Announcements */}
               <div className="bg-neutral-900 border border-white/5 p-8 rounded-3xl">
                   <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                       <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                       Home Page Announcements
                   </h2>
                   <p className="text-xs text-neutral-500 mb-4">Set up to 3 messages to display on the login screen. Leave empty to hide.</p>

                   <div className="space-y-4 mb-8">
                       {systemMessages.map((msg, idx) => (
                           <div key={idx} className="space-y-1">
                               <label className="text-[10px] uppercase text-neutral-600 font-bold">Message {idx + 1}</label>
                               <input 
                                  type="text"
                                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-white/40 outline-none transition placeholder-neutral-700"
                                  placeholder={`Enter announcement ${idx + 1}...`}
                                  value={msg}
                                  onChange={(e) => handleMessageChange(idx, e.target.value)}
                                  maxLength={60}
                               />
                           </div>
                       ))}
                   </div>
               </div>

               {/* Website Content Section */}
               <div className="col-span-full bg-neutral-900 border border-white/5 p-8 rounded-3xl">
                   <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                       <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                       Website Content Pages
                   </h2>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <RichTextEditor 
                          label="How it Works"
                          content={contentHowItWorks}
                          onChange={setContentHowItWorks}
                       />
                       <RichTextEditor 
                          label="Our Story"
                          content={contentOurStory}
                          onChange={setContentOurStory}
                       />
                       <RichTextEditor 
                          label="Support Details"
                          content={contentSupport}
                          onChange={setContentSupport}
                       />
                       <RichTextEditor 
                          label="Privacy Policy"
                          content={contentPrivacy}
                          onChange={setContentPrivacy}
                       />
                       <RichTextEditor 
                          label="Terms of Service"
                          content={contentTerms}
                          onChange={setContentTerms}
                       />
                   </div>
               </div>
               
               <div className="col-span-full">
                   <button 
                     onClick={handleSaveSettings}
                     className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors shadow-lg"
                   >
                       Save All Configuration
                   </button>
               </div>
           </div>
       )}

       {/* Reject Modal */}
       {rejectId && (
           <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
               <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md">
                   <h3 className="text-white font-bold mb-4">Reject Application</h3>
                   <textarea 
                      className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:outline-none mb-4"
                      rows={4}
                      placeholder="Reason for rejection (will be shown to user)..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                   />
                   <div className="flex gap-3">
                       <button onClick={() => setRejectId(null)} className="flex-1 py-2 text-neutral-400 hover:text-white">Cancel</button>
                       <button onClick={confirmReject} className="flex-1 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-500">Confirm Reject</button>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};

export default AdminView;