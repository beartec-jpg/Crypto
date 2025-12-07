// Clerk authentication UI components
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';

export function AuthButtons() {
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
