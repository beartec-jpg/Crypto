import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home as HomeIcon, Building, Factory, Lock } from "lucide-react";
import { SiX } from "react-icons/si";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { UserHeader } from "@/components/UserHeader";

export default function CalculatorSelection() {
  const { user: _user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <UserHeader />
      
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Select Your Calculator Type
          </h1>
          <p className="text-xl text-muted-foreground">
            Choose the appropriate calculator for your gas testing requirements
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Domestic Calculator */}
          <Card className="relative hover:shadow-lg transition-shadow cursor-pointer opacity-60 ring-2 ring-blue-500 h-full flex flex-col">
            <CardHeader className="text-center pb-4">
              <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                <HomeIcon className="w-10 h-10 text-blue-600" />
              </div>
              <CardTitle className="text-2xl">Domestic</CardTitle>
              <CardDescription className="mt-2 h-12 flex items-center justify-center">
                For residential and small domestic installations
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-3 text-sm text-muted-foreground flex-1">
                <p>• Residential properties</p>
                <p>• Small pipework systems</p>
                <p>• Standard domestic meters</p>
                <p>• Basic testing requirements</p>
              </div>
              <div className="mt-6">
                <Button className="w-full" disabled>
                  <Lock className="w-4 h-4 mr-2" />
                  Coming Soon
                </Button>
              </div>
              <p className="text-xs text-center text-muted-foreground mt-4">
                Based on industry standards for domestic installations
              </p>
            </CardContent>
          </Card>

          {/* Commercial Calculator */}
          <Card className="relative hover:shadow-lg transition-shadow cursor-pointer ring-2 ring-rose-800 h-full flex flex-col">
            <CardHeader className="text-center pb-4">
              <div className="w-20 h-20 mx-auto mb-4 bg-rose-100 rounded-full flex items-center justify-center">
                <Building className="w-10 h-10 text-rose-800" />
              </div>
              <CardTitle className="text-2xl">Commercial</CardTitle>
              <CardDescription className="mt-2 h-12 flex items-center justify-center">
                For small commercial and light industrial installations
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-3 text-sm text-muted-foreground flex-1">
                <p>• Small shops and offices</p>
                <p>• Light commercial premises</p>
                <p>• Up to 6" pipework</p>
                <p>• Simplified testing procedures</p>
              </div>
              <div className="mt-6">
                <Link href="/commercial">
                  <Button className="w-full bg-rose-800 hover:bg-rose-900">
                    Start Commercial
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-center text-muted-foreground mt-4">
                Based on standards for small commercial installations
              </p>
            </CardContent>
          </Card>

          {/* Industrial Calculator */}
          <Card className="relative hover:shadow-lg transition-shadow cursor-pointer ring-2 ring-green-500 h-full flex flex-col">
            <CardHeader className="text-center pb-4">
              <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <Factory className="w-10 h-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl">Industrial</CardTitle>
              <CardDescription className="mt-2 h-12 flex items-center justify-center">
                For industrial and large commercial installations
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-3 text-sm text-muted-foreground flex-1">
                <p>• Industrial facilities</p>
                <p>• Large commercial buildings</p>
                <p>• All pipe sizes supported</p>
                <p>• Comprehensive testing & purging</p>
              </div>
              <div className="mt-6">
                <Link href="/industrial">
                  <Button className="w-full bg-green-600 hover:bg-green-700">
                    Start Industrial
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-center text-muted-foreground mt-4">
                Based on full industrial gas testing standards
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            All calculators provide professional-grade calculations based on industry standards.
            Results should be verified against applicable regulations including IGE/UP standards.
          </p>
          <div className="mt-6">
            <Link href="/consultancy">
              <Button variant="outline" className="gap-2" data-testid="link-consultancy-services">
                <Building className="w-4 h-4" />
                Learn about our Consultancy Services
              </Button>
            </Link>
          </div>
          <div className="mt-6 pt-4 border-t border-border">
            {/* Footer Links */}
            <div className="flex justify-center items-center gap-6 mb-4">
              <Link 
                href="/privacy"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-privacy"
              >
                Privacy Policy
              </Link>
              <span className="text-muted-foreground">•</span>
              <Link 
                href="/terms"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-terms"
              >
                Terms of Service
              </Link>
              <span className="text-muted-foreground">•</span>
              <a 
                href="mailto:info@BearTec.uk"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-contact"
              >
                Contact
              </a>
            </div>
            
            {/* X Social Link */}
            <div className="flex justify-center">
              <a 
                href="https://x.com/beartecuk?t=z-LarE7LCa4ArrQmXfNzug&s=09" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-x-profile"
                aria-label="Follow BearTec on X"
              >
                <SiX className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}