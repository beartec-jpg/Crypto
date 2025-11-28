import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, FileText, Clock, Zap, Crown, CheckCircle, Building } from "lucide-react";
import { SiX } from "react-icons/si";
import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            BearTec Gas Calculator
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Professional gas testing and purge calculator - IGE UP1 compliant
          </p>
          <p className="text-lg text-gray-600 mb-8">
            Professional strength and tightness test calculator built for UK Gas Safe registered engineers. Our IGE UP1 calculator handles <strong>strength tests</strong>, <strong>tightness tests</strong>, and <strong>gas purging requirements</strong>. 
            Fully compliant with IGE/UP/1 standards for commercial and industrial installations.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            <Badge variant="outline" className="bg-blue-50 text-blue-700">IGE/UP/1 Standards</Badge>
            <Badge variant="outline" className="bg-green-50 text-green-700">Gas Safe Registered</Badge>
            <Badge variant="outline" className="bg-purple-50 text-purple-700">UK Engineers</Badge>
            <Badge variant="outline" className="bg-orange-50 text-orange-700">Professional Tools</Badge>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              asChild
              size="lg" 
              data-testid="button-google-login"
              className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              <a href="/api/auth/google">
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </a>
            </Button>
            <Button 
              asChild
              size="lg" 
              variant="outline"
              data-testid="button-replit-login" 
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <a href="/api/login">
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.041 9.128l2.13-1.231a1.24 1.24 0 011.24 0l2.131 1.231c.384.222.62.632.62 1.074v2.462c0 .442-.236.852-.62 1.074l-2.131 1.231a1.24 1.24 0 01-1.24 0l-2.13-1.231a1.242 1.242 0 01-.62-1.074v-2.462c0-.442.236-.852.62-1.074z"/>
                </svg>
                Continue with Replit
              </a>
            </Button>
          </div>
          
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader className="text-center">
              <Calculator className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <CardTitle>Strength, Tightness & Purge Calculations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Our strength and tightness test calculator provides accurate calculations for natural gas and LPG installations. 
                This test and purge calculator includes purge volume calculations and TTD (Test to Destruction) timings.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <FileText className="w-8 h-8 mx-auto mb-2 text-green-600" />
              <CardTitle>Professional Gas Safe Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Generate compliant PDF test certificates with company branding. Perfect for Gas Safe registered engineers 
                working on commercial kitchens, industrial boilers, and multi-occupancy buildings.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 text-purple-600" />
              <CardTitle>Eliminate Manual Calculations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Stop using spreadsheets and manual formulas. Our calculator handles complex pipe networks, 
                meter configurations, and pressure drop calculations automatically.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* SEO Content Section */}
        <div className="bg-white rounded-lg p-8 mb-12 shadow-sm">
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">
            Why UK Gas Safe Engineers Choose Our Gas Testing Calculator
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-3 text-blue-700">IGE UP1 Calculator for Commercial Gas Testing</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Calculate strength tests for new installations (21 mbar minimum)</li>
                <li>• Tightness testing with automatic pressure drop calculations</li>
                <li>• Purge volume calculations for safe commissioning</li>
                <li>• Support for pipe sizes from 15mm to 150mm</li>
                <li>• Compatible with U16, U25, U40, U65 meter types</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3 text-green-700">Industrial Gas Testing Solutions</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Large pipe network calculations up to 300mm</li>
                <li>• Zone A, B, and C pressure testing requirements</li>
                <li>• Electronic and mechanical gauge calculations</li>
                <li>• Test medium selection (air, nitrogen, CO2)</li>
                <li>• Professional documentation for compliance audits</li>
              </ul>
            </div>
          </div>
          <div className="text-center mt-6">
            <p className="text-gray-500 italic">
              "Essential tool for any Gas Safe registered engineer working on commercial or industrial gas installations" 
              - Trusted by engineers across the UK
            </p>
          </div>
        </div>

        {/* Pricing */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">Simple, Fair Pricing</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {/* Free */}
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Free</CardTitle>
                <div className="text-3xl font-bold">£0</div>
                <CardDescription>Try it out</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Up to 1" pipe testing
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Basic calculations
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    PDF certificates
                  </li>
                </ul>
                <div className="mt-4">
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Navigate to home without authentication  
                      window.location.href = '/home';
                    }}
                    data-testid="button-try-free"
                  >
                    Try Free
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Basic */}
            <Card className="ring-2 ring-blue-500 relative cursor-pointer hover:shadow-lg transition-shadow">
              <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                Popular
              </Badge>
              <CardHeader className="text-center">
                <CardTitle className="text-xl flex items-center justify-center gap-2">
                  <Zap className="w-5 h-5" />
                  Basic
                </CardTitle>
                <div className="text-3xl font-bold">
                  £1<span className="text-lg font-normal">/month</span>
                </div>
                <CardDescription>Full testing capabilities</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    All pipe sizes
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Unlimited testing
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Advanced calculations
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    PDF certificates
                  </li>
                </ul>
                <div className="mt-4">
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      sessionStorage.setItem('pendingTier', 'basic');
                      window.location.href = '/api/auth/google';
                    }}
                    data-testid="button-start-basic"
                  >
                    Start Basic
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Premium */}
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <CardTitle className="text-xl flex items-center justify-center gap-2">
                  <Crown className="w-5 h-5" />
                  Premium
                </CardTitle>
                <div className="text-3xl font-bold">
                  £2<span className="text-lg font-normal">/month</span>
                </div>
                <CardDescription>Complete solution</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    All Basic features
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Purge calculations
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Advanced features
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Priority support
                  </li>
                </ul>
                <div className="mt-4">
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      sessionStorage.setItem('pendingTier', 'premium');
                      window.location.href = '/api/auth/google';
                    }}
                    data-testid="button-start-premium"
                  >
                    Start Premium
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Professional */}
            <Card className="ring-2 ring-yellow-500 relative cursor-pointer hover:shadow-lg transition-shadow">
              <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-yellow-500">
                White Label
              </Badge>
              <CardHeader className="text-center">
                <CardTitle className="text-xl flex items-center justify-center gap-2">
                  <Building className="w-5 h-5" />
                  Professional
                </CardTitle>
                <div className="text-3xl font-bold">
                  £5<span className="text-lg font-normal">/month</span>
                </div>
                <CardDescription>Custom branded reports</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    All Premium features
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Custom company branding
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Your logo on reports
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Custom colors & styling
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    White-label certificates
                  </li>
                </ul>
                <div className="mt-4">
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      sessionStorage.setItem('pendingTier', 'professional');
                      window.location.href = '/api/auth/google';
                    }}
                    data-testid="button-start-professional"
                  >
                    Start Professional
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-4">Ready to streamline your gas testing?</h3>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => window.location.href = "/api/auth/google"}
              data-testid="button-google-cta"
              className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Start with Google
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-replit-cta"
            >
              Start with Replit
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-8 border-t border-gray-200 mt-12">
          <p className="text-sm text-gray-500 mb-4">
            Professional gas testing solutions for UK engineers
          </p>
          
          {/* Footer Links */}
          <div className="flex justify-center items-center gap-6 mb-4">
            <Link 
              href="/privacy"
              className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
              data-testid="link-privacy"
            >
              Privacy Policy
            </Link>
            <span className="text-gray-300">•</span>
            <Link 
              href="/terms"
              className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
              data-testid="link-terms"
            >
              Terms of Service
            </Link>
            <span className="text-gray-300">•</span>
            <a 
              href="mailto:info@BearTec.uk"
              className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
              data-testid="link-contact"
            >
              Contact
            </a>
            <span className="text-gray-300">•</span>
            <Link 
              href="/consultancy"
              className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
              data-testid="link-consultancy"
            >
              Consultancy Services
            </Link>
          </div>
          
          {/* X Social Link */}
          <div className="flex justify-center">
            <a 
              href="https://x.com/beartecuk?t=z-LarE7LCa4ArrQmXfNzug&s=09" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              data-testid="link-x-profile"
              aria-label="Follow BearTec on X"
            >
              <SiX className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}