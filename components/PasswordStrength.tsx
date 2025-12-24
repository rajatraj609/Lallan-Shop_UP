import React, { useEffect, useState } from 'react';

interface Props {
  password: string;
  onValidationChange: (isValid: boolean) => void;
}

const PasswordStrength: React.FC<Props> = ({ password, onValidationChange }) => {
  const [strength, setStrength] = useState(0);

  useEffect(() => {
    let score = 0;
    if (password.length > 6) score++;
    if (/[A-Za-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    let uiScore = 0;
    if (password.length > 0) uiScore = 1;
    if (password.length > 6 && score >= 3) uiScore = 2;
    if (password.length > 6 && score >= 4) uiScore = 3;

    setStrength(uiScore);
    onValidationChange(uiScore >= 1 && password.length > 6);
    
  }, [password, onValidationChange]);

  const getColor = (index: number) => {
    if (strength === 0) return 'bg-neutral-800';
    if (strength === 1) return index === 0 ? 'bg-red-500' : 'bg-neutral-800';
    if (strength === 2) return index <= 1 ? 'bg-amber-500' : 'bg-neutral-800';
    if (strength === 3) return 'bg-emerald-500';
    return 'bg-neutral-800';
  };

  const getLabel = () => {
    if (password.length === 0) return '';
    if (password.length <= 6) return 'Too short';
    if (strength === 1) return 'Weak';
    if (strength === 2) return 'Good';
    if (strength === 3) return 'Strong';
    return '';
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-1 h-1.5 flex-1">
            <div className={`flex-1 rounded-full transition-colors duration-300 ${getColor(0)}`}></div>
            <div className={`flex-1 rounded-full transition-colors duration-300 ${getColor(1)}`}></div>
            <div className={`flex-1 rounded-full transition-colors duration-300 ${getColor(2)}`}></div>
        </div>
        <span className="text-[10px] uppercase font-bold text-neutral-400 w-12 text-right">{getLabel()}</span>
      </div>
      <p className="text-[10px] text-neutral-600">
        Must contain 7+ chars with mixed types.
      </p>
    </div>
  );
};

export default PasswordStrength;