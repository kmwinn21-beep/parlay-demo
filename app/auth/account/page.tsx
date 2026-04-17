'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useUser } from '@/components/UserContext';
import { BackButton } from '@/components/BackButton';

export default function AccountPage() {
  const { user, refresh } = useUser();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to change password.');
        return;
      }
      toast.success('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Network error.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/auth/login';
    } catch {
      toast.error('Logout failed.');
      setLoggingOut(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">My Account</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile and security settings.</p>
      </div>

      {/* Profile info */}
      <div className="card">
        <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-4">Profile</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</p>
            <p className="text-sm text-gray-800 mt-0.5">{user.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</p>
            <span className={`inline-flex mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              user.role === 'administrator'
                ? 'bg-procare-dark-blue text-white'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {user.role === 'administrator' ? 'Administrator' : 'Standard User'}
            </span>
          </div>
          {!user.emailVerified && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-800 font-medium">
                ⚠️ Email not verified. Check your inbox for a verification link.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Change password */}
      <div className="card">
        <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="label text-xs">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Your current password"
              className="input-field"
            />
          </div>
          <div>
            <label className="label text-xs">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              className="input-field"
            />
          </div>
          <div>
            <label className="label text-xs">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Repeat new password"
              className="input-field"
            />
          </div>
          <button
            type="submit"
            disabled={changingPassword}
            className="btn-primary text-sm"
          >
            {changingPassword ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Sign out */}
      <div className="card">
        <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-3">Session</h2>
        <p className="text-sm text-gray-500 mb-4">Sign out of {process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub'} on this device.</p>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="btn-danger text-sm"
        >
          {loggingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
