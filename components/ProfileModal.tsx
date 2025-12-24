import React, { useState, useRef } from 'react';
import { User } from '../types';
import { saveUser, deleteUser } from '../services/storage';
import ImageCropper from './ImageCropper';

interface Props {
  user: User;
  onClose: () => void;
  onUpdate: (user: User) => void;
  onLogout: () => void;
}

const ProfileModal: React.FC<Props> = ({ user, onClose, onUpdate, onLogout }) => {
  const [formData, setFormData] = useState({
    name: user.name,
    dob: user.dob || '',
    phoneCode: user.phoneCode || '+1',
    phone: user.phone || '',
    profileImage: user.profileImage || '',
  });
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Image Upload State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedUser: User = {
      ...user,
      ...formData
    };
    saveUser(updatedUser);
    onUpdate(updatedUser);
    onClose();
  };

  const handleDeleteConfirm = () => {
    deleteUser(user.id);
    onLogout();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setSelectedImage(reader.result as string);
        setShowCropper(true);
        // Reset input so same file can be selected again if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (croppedImageBase64: string) => {
    setFormData({ ...formData, profileImage: croppedImageBase64 });
    setShowCropper(false);
    setSelectedImage(null);
  };

  return (
    <>
      {showCropper && selectedImage && (
        <ImageCropper 
          imageSrc={selectedImage}
          onCancel={() => { setShowCropper(false); setSelectedImage(null); }}
          onCropComplete={handleCropComplete}
        />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
        <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative">
          <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/5">
            <h2 className="text-lg font-display font-bold text-white">Profile Settings</h2>
            <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {/* Profile Image Section */}
            <div className="flex flex-col items-center mb-6">
               <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                 <div className="w-24 h-24 rounded-full border-2 border-white/20 overflow-hidden bg-neutral-800 flex items-center justify-center relative shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all group-hover:border-white group-hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                    {formData.profileImage ? (
                      <img src={formData.profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl font-display font-bold text-neutral-600 group-hover:text-white transition-colors">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-white">
                         <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                         <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                       </svg>
                    </div>
                 </div>
                 <p className="text-xs text-neutral-500 mt-3 text-center uppercase tracking-widest group-hover:text-white transition-colors">Change Portrait</p>
                 <input 
                   type="file" 
                   ref={fileInputRef} 
                   className="hidden" 
                   accept="image/*"
                   onChange={handleImageSelect}
                 />
               </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Full Name</label>
              <input
                type="text"
                required
                disabled={isDeleting}
                className="w-full px-4 py-3 bg-black/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition disabled:opacity-50"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Date of Birth</label>
              <input
                type="date"
                disabled={isDeleting}
                className="w-full px-4 py-3 bg-black/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition disabled:opacity-50 [color-scheme:dark]"
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">Contact</label>
              <div className="flex gap-2">
                <select 
                  disabled={isDeleting}
                  className="px-3 py-3 bg-black/50 border border-white/10 text-white rounded-xl focus:border-white/40 outline-none disabled:opacity-50"
                  value={formData.phoneCode}
                  onChange={(e) => setFormData({ ...formData, phoneCode: e.target.value })}
                >
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                  <option value="+91">+91</option>
                  <option value="+81">+81</option>
                  <option value="+86">+86</option>
                </select>
                <input
                  type="tel"
                  disabled={isDeleting}
                  placeholder="123 456 7890"
                  className="flex-1 px-4 py-3 bg-black/50 border border-white/10 text-white rounded-xl focus:border-white/40 focus:ring-0 outline-none transition disabled:opacity-50"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="pt-6 flex flex-col gap-3">
              {isDeleting ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 animate-in fade-in slide-in-from-bottom-2">
                  <p className="text-red-200 text-sm mb-4 font-medium text-center">
                    This action is irreversible. All data will be lost.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsDeleting(false)}
                      className="flex-1 px-4 py-3 text-sm font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteConfirm}
                      className="flex-1 px-4 py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="submit"
                    className="w-full px-4 py-3 text-sm font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDeleting(true)}
                    className="w-full px-4 py-3 text-sm font-medium text-red-400 bg-transparent border border-red-500/20 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                    Delete Account
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default ProfileModal;