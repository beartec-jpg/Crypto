import { Button } from '@/components/ui/button';
import { User, LogOut } from 'lucide-react';

const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

function ProductionAuthButtons() {
  const { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } = require('@clerk/clerk-react');
  
  return (
    <div className="flex items-center gap-2" data-testid="auth-buttons">
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="outline" size="sm" data-testid="button-sign-in">
            Sign In
          </Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button size="sm" data-testid="button-sign-up">
            Sign Up
          </Button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton 
          afterSignOutUrl="/" 
          appearance={{
            elements: {
              avatarBox: "w-8 h-8"
            }
          }}
        />
      </SignedIn>
    </div>
  );
}

function DevAuthButtons() {
  return (
    <div className="flex items-center gap-2" data-testid="auth-buttons">
      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
        <User className="w-4 h-4" />
        <span>Dev User (Elite)</span>
      </div>
    </div>
  );
}

export function AuthButtons() {
  if (isDevelopment) {
    return <DevAuthButtons />;
  }
  return <ProductionAuthButtons />;
}
