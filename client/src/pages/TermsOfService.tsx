import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Users, CreditCard, AlertTriangle, Scale } from "lucide-react";
import { SiX } from "react-icons/si";
import { Link } from "wouter";
import beartecLogo from "@assets/Screenshot_20250823-074823_1755931718570.png";
import beartecFooter from "@assets/Screenshot_20250823-075417_1755932088384.png";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-20 w-full overflow-hidden" style={{
            backgroundImage: `url(${beartecLogo})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Navigation Header */}
          <div className="flex items-center justify-between mb-6">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => window.location.href = '/'}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              Terms of Service
            </h1>
            <p className="text-muted-foreground mt-2">
              Terms and conditions for using our gas testing calculation service
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="space-y-6">
            {/* Service Description */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Service Description
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Our service provides gas purging calculations and testing tools based on industry standards. 
                  We offer multiple subscription tiers with varying features, from basic calculations to comprehensive 
                  branded reporting solutions for professional gas engineering requirements.
                </p>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800">Professional Use Notice</p>
                  <p className="text-xs text-amber-700 mt-1">
                    This service is designed for qualified gas engineers and professionals. Users are responsible 
                    for ensuring calculations meet local regulations and safety standards.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* User Responsibilities */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  User Responsibilities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Account Security</h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Maintain the confidentiality of your account credentials</li>
                    <li>• Notify us immediately of any unauthorized access</li>
                    <li>• Use accurate and current information in your account</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Professional Use</h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Ensure you have appropriate qualifications to perform gas testing work</li>
                    <li>• Verify calculations meet local regulations and safety requirements</li>
                    <li>• Use the service only for legitimate professional purposes</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Prohibited Activities</h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Reverse engineering or attempting to access source code</li>
                    <li>• Sharing account credentials with unauthorized parties</li>
                    <li>• Using the service for illegal or harmful purposes</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Subscription & Billing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                  Subscription & Billing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Subscription Tiers</h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• <strong>Free:</strong> Limited testing capabilities, no external reports</li>
                    <li>• <strong>Basic (£1/month):</strong> Full testing, external reports, no PDF certificates</li>
                    <li>• <strong>Premium (£2/month):</strong> All features including PDF certificates</li>
                    <li>• <strong>Professional (£5/month):</strong> Custom branding and white-label reports</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Billing Terms</h3>
                  <p className="text-sm text-muted-foreground">
                    Subscriptions are billed monthly in advance. You may cancel your subscription at any time, 
                    with access continuing until the end of your current billing period. Refunds are not provided 
                    for partial months.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Payment Processing</h3>
                  <p className="text-sm text-muted-foreground">
                    Payments are processed securely through Stripe. We do not store your payment card information 
                    on our servers. You agree to provide accurate payment information and authorize charges to your account.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Limitations & Disclaimers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Limitations & Disclaimers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800 mb-2">Important Safety Notice</p>
                  <p className="text-xs text-red-700">
                    Our calculations are based on industry standards and should be verified against applicable standards 
                    including IGE/UP/1. Users must ensure compliance with local regulations. We are not liable for incorrect 
                    use of calculations or failure to follow proper gas safety procedures.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Service Availability</h3>
                  <p className="text-sm text-muted-foreground">
                    We strive to provide continuous service availability but cannot guarantee 100% uptime. 
                    We are not liable for temporary service interruptions or their impact on your work.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Data Accuracy</h3>
                  <p className="text-sm text-muted-foreground">
                    Users are responsible for ensuring input data accuracy. We provide calculation tools 
                    but cannot guarantee the accuracy of results based on incorrect or incomplete input data.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Intellectual Property */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-indigo-600" />
                  Intellectual Property
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Service Content</h3>
                  <p className="text-sm text-muted-foreground">
                    All calculation algorithms, software, documentation, and service content remain our intellectual property. 
                    Users receive a license to use the service but not ownership of the underlying technology.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">User Content</h3>
                  <p className="text-sm text-muted-foreground">
                    You retain ownership of project data, company information, and branding materials you provide. 
                    We use this content solely to deliver our service to you.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Generated Reports</h3>
                  <p className="text-sm text-muted-foreground">
                    You own the gas testing reports and certificates generated through our service, including 
                    those customized with your company branding (Professional tier).
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Termination */}
            <Card>
              <CardHeader>
                <CardTitle>Account Termination</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">User Termination</h3>
                  <p className="text-sm text-muted-foreground">
                    You may terminate your account at any time through your account settings. 
                    Upon termination, your access will cease, and your data will be deleted according to our data retention policy.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Service Termination</h3>
                  <p className="text-sm text-muted-foreground">
                    We reserve the right to terminate accounts that violate these terms or engage in prohibited activities. 
                    We will provide reasonable notice when possible, except in cases of severe violations.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Contact & Updates */}
            <Card>
              <CardHeader>
                <CardTitle>Contact & Updates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Questions & Support</h3>
                  <p className="text-sm text-muted-foreground">
                    If you have questions about these Terms of Service, please contact us through 
                    the support channels available in your account dashboard.
                  </p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Terms Updates</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We may update these Terms from time to time. Material changes will be communicated 
                    via email or service notifications. Continued use of the service after changes 
                    constitutes acceptance of the updated terms.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-surface border-t border-border mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col items-center space-y-4">
            {/* Links Row */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              <Link href="/calculations">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Reference & Calculations
                </Button>
              </Link>
              <Link href="/privacy">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Privacy Policy
                </Button>
              </Link>
              <Link href="/terms">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Terms of Service
                </Button>
              </Link>
              <a href="mailto:info@BearTec.uk" className="text-primary hover:underline">Support</a>
            </div>
            
            {/* Copyright Text */}
            <div className="text-sm text-muted-foreground text-center">
              © 2024 Professional Gas Testing Calculator. For use by qualified Gas Safe registered engineers only.
            </div>
            
            {/* Version */}
            <div className="text-sm text-muted-foreground text-center">
              Version 2.1.0
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-background border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="w-full overflow-hidden" style={{
            backgroundImage: `url(${beartecFooter})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            height: '120px'
          }}>
          </div>
          
          {/* X Social Link */}
          <div className="flex justify-center py-4">
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
      </footer>
    </div>
  );
}