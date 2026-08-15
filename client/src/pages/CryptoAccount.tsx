import { Helmet } from 'react-helmet-async';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { useCryptoAuth, isDevelopment, setDevAdminMode, ADMIN_EMAIL } from '@/hooks/useCryptoAuth';
import { useQuery } from '@tanstack/react-query';
import { Crown, Sparkles, Info, CreditCard, Bot, Shield, LogIn, LogOut, User, ShieldCheck, UserCircle, BarChart3, Camera, Key, Edit3, Save, X, Users } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser, useClerk, SignInButton, SignOutButton } from '@clerk/clerk-react';
import { useState, useRef } from 'react';

function useClerkHooks() {
  // In development, skip Clerk hooks entirely to avoid ClerkProvider requirement
  if (isDevelopment) {
    const isAdminMode = typeof window !== 'undefined' && localStorage.getItem('dev-admin-mode') === 'true';
    return {
      isSignedIn: true,
      isLoaded: true,
      user: isAdminMode 
        ? { firstName: 'BearTec', lastName: 'Admin', primaryEmailAddress: { emailAddress: ADMIN_EMAIL }, imageUrl: null }
        : { firstName: 'Dev', lastName: 'User', primaryEmailAddress: { emailAddress: 'dev@open.access' }, imageUrl: null },
      openUserProfile: () => {},
    };
  }
  
  // In production, use real Clerk hooks
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const auth = useAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user } = useUser();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const clerk = useClerk();
  
  return { ...auth, user, openUserProfile: () => clerk.openUserProfile() };
}

function ClerkSignInButton({ children, mode }: { children: React.ReactNode; mode?: string }) {
  if (isDevelopment) {
    return <>{children}</>;
  }
  return <SignInButton mode={mode as any}>{children}</SignInButton>;
}

function ClerkSignOutButton({ children }: { children: React.ReactNode }) {
  if (isDevelopment) {
    return <>{children}</>;
  }
  return <SignOutButton>{children}</SignOutButton>;
}

interface SubscriptionData {
  tier: string;
  hasElliottAddon: boolean;
  canUseAI: boolean;
  hasUnlimitedAI: boolean;
  aiCredits: number;
  status: string;
  monthlyUsage?: {
    aiCredits: number;
    aiLimit: number;
  };
}

export default function CryptoAccount() {
  const { tier: localTier, subscription: authSubscription, isAdmin } = useCryptoAuth();
  const { isSignedIn, isLoaded, user, openUserProfile } = useClerkHooks();
  
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  const { data: apiSubscription } = useQuery<SubscriptionData>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isDevelopment || isSignedIn === true,
  });

  const { toast } = useToast();

  // Admin users get the overridden subscription from useCryptoAuth
  const subscription = isAdmin ? (authSubscription as unknown as SubscriptionData) : apiSubscription;
  const tier = isAdmin ? 'elite' : (subscription?.tier || localTier || 'free');

  const handleSaveName = async () => {
    if (!user || isDevelopment) return;
    setSavingName(true);
    try {
      await (user as any).update({ firstName: firstName.trim(), lastName: lastName.trim() });
      setEditingName(false);
      toast({ title: 'Name updated', description: 'Your display name has been saved.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update name.', variant: 'destructive' });
    } finally {
      setSavingName(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || isDevelopment) return;
    setUploadingPhoto(true);
    try {
      await (user as any).setProfileImage({ file });
      toast({ title: 'Photo updated', description: 'Your profile picture has been saved.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to upload photo.', variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
    }
  };
  
  const getTierColor = (t: string) => {
    switch (t.toLowerCase()) {
      case 'elite': return 'from-purple-600 to-pink-600';
      case 'pro': return 'from-yellow-600 to-orange-600';
      case 'intermediate': return 'from-blue-600 to-cyan-600';
      case 'beginner': return 'from-green-600 to-emerald-600';
      default: return 'from-slate-600 to-slate-700';
    }
  };

  const getTierBadgeColor = (t: string) => {
    switch (t.toLowerCase()) {
      case 'elite': return 'bg-purple-900/50 text-purple-300 border-purple-500';
      case 'pro': return 'bg-yellow-900/50 text-yellow-300 border-yellow-500';
      case 'intermediate': return 'bg-blue-900/50 text-blue-300 border-blue-500';
      case 'beginner': return 'bg-green-900/50 text-green-300 border-green-500';
      default: return 'bg-slate-800 text-slate-300 border-slate-500';
    }
  };

  const authLoading = !isLoaded && !isDevelopment;
  const showContent = isDevelopment || isSignedIn;

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      <Helmet>
        <title>Account | BearTec Crypto</title>
        <meta name="description" content="Manage your BearTec Crypto account and subscription" />
      </Helmet>
      
      <CryptoNavigation />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">My Account</h1>
        
        {authLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
          </div>
        ) : !showContent ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center">
            <LogIn className="w-12 h-12 text-cyan-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
            <p className="text-gray-400 mb-6">Please sign in to view your account</p>
            <ClerkSignInButton mode="modal">
              <Button className="bg-cyan-600 hover:bg-cyan-700">
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Button>
            </ClerkSignInButton>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Personal Details Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                Personal Details
              </h3>

              {/* Profile picture */}
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  {user?.imageUrl ? (
                    <img src={user.imageUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center">
                      <User className="w-10 h-10 text-gray-500" />
                    </div>
                  )}
                  {!isDevelopment && (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-cyan-600 hover:bg-cyan-700 flex items-center justify-center transition-colors"
                      title="Change profile picture"
                    >
                      {uploadingPhoto ? (
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>
                <div className="text-sm text-gray-400">
                  <p className="font-medium text-white mb-0.5">Profile Photo</p>
                  <p>Shown on the message board</p>
                  {isDevelopment && <p className="text-yellow-500">Dev mode — photo upload disabled</p>}
                </div>
              </div>

              {/* Name */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      className="bg-slate-800 border-slate-700 text-white max-w-[140px]"
                    />
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      className="bg-slate-800 border-slate-700 text-white max-w-[140px]"
                    />
                    <Button size="sm" onClick={handleSaveName} disabled={savingName} className="bg-cyan-600 hover:bg-cyan-700">
                      {savingName ? <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">
                      {isAdmin ? 'BearTec Admin' : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || '—'}
                    </span>
                    {!isDevelopment && (
                      <button
                        onClick={() => {
                          setFirstName(user?.firstName ?? '');
                          setLastName(user?.lastName ?? '');
                          setEditingName(true);
                        }}
                        className="text-gray-500 hover:text-cyan-400 transition-colors"
                        title="Edit name"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-1">Email Address</label>
                <p className="text-white">{user?.primaryEmailAddress?.emailAddress ?? '—'}</p>
              </div>

              {/* Sign out / dev buttons */}
              {isDevelopment ? (
                <div className="flex gap-2">
                  {isAdmin ? (
                    <Button 
                      variant="outline" 
                      className="border-orange-500 text-orange-400 hover:bg-orange-500/10"
                      onClick={() => setDevAdminMode(false)}
                      data-testid="button-switch-to-dev-user"
                    >
                      <UserCircle className="w-4 h-4 mr-2" />
                      Switch to Dev User
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
                      onClick={() => setDevAdminMode(true)}
                      data-testid="button-login-as-admin"
                    >
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Login as Admin
                    </Button>
                  )}
                </div>
              ) : (
                <ClerkSignOutButton>
                  <Button variant="outline" className="border-slate-700 text-gray-300">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </ClerkSignOutButton>
              )}
            </div>

            {/* Security Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                Security
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Manage your password, two-factor authentication, and connected accounts via the Clerk security center.
              </p>
              {isDevelopment ? (
                <p className="text-sm text-yellow-500">Dev mode — security settings managed via Clerk in production.</p>
              ) : (
                <Button
                  variant="outline"
                  className="border-slate-700 text-gray-300 hover:bg-slate-800"
                  onClick={openUserProfile}
                >
                  <Key className="w-4 h-4 mr-2" />
                  Manage Password & Security
                </Button>
              )}
            </div>

            {/* Subscription Card */}
            <div className={`bg-gradient-to-r ${getTierColor(tier)} p-1 rounded-lg`}>
              <div className="bg-slate-900 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Crown className="w-6 h-6 text-yellow-400" />
                    <h3 className="text-lg font-bold">Subscription</h3>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getTierBadgeColor(tier)}`}>
                    {tier.charAt(0).toUpperCase() + tier.slice(1)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <Bot className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">AI tokens used</p>
                    <p className="text-lg font-bold">
                      {isAdmin ? '∞' : subscription?.monthlyUsage ? (
                        `${subscription.monthlyUsage.aiCredits}/${subscription.monthlyUsage.aiLimit}`
                      ) : '0/0'}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <Sparkles className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">AI Analysis</p>
                    <p className="text-lg font-bold">
                      {subscription?.canUseAI ? 'Active' : 'Locked'}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <Shield className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Status</p>
                    <p className="text-lg font-bold capitalize">
                      {subscription?.status || 'Active'}
                    </p>
                  </div>
                </div>

                <Link href="/cryptosubscribe">
                  <Button className="w-full bg-cyan-600 hover:bg-cyan-700">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Manage Subscription
                  </Button>
                </Link>
              </div>
            </div>

            {/* Admin Panel - Only visible to admin */}
            {isAdmin && (
              <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 border border-purple-500/50 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck className="w-6 h-6 text-purple-400" />
                  <h3 className="text-lg font-bold text-purple-300">Admin Panel</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/admin">
                    <Button className="bg-purple-600 hover:bg-purple-700" data-testid="button-dev-analytics">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Analytics Dashboard
                    </Button>
                  </Link>
                  <Link href="/admin/users">
                    <Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="button-admin-users">
                      <Users className="w-4 h-4 mr-2" />
                      User Management
                    </Button>
                  </Link>
                  <Link href="/dev/sandbox">
                    <Button className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700" data-testid="button-dev-sandbox">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Sandbox Chart
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-cyan-400 mt-0.5" />
                <div className="text-sm text-gray-400">
                  <p className="mb-1">
                    Your subscription renews automatically each month. You can cancel anytime from the subscription management page.
                  </p>
                  <p>
                    Need help? Contact support at <a href="mailto:beartec@beartec.uk" className="text-cyan-400 hover:underline">beartec@beartec.uk</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
