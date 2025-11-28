import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Eye, Database, Lock } from "lucide-react";
import { SiX } from "react-icons/si";
import { Link } from "wouter";
import beartecLogo from "@assets/Screenshot_20250823-074823_1755931718570.png";
import beartecFooter from "@assets/Screenshot_20250823-075417_1755932088384.png";

export default function PrivacyPolicy() {
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
              <Shield className="w-8 h-8 text-blue-600" />
              Privacy Policy
            </h1>
            <p className="text-muted-foreground mt-2">
              How we collect, use, and protect your information
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="space-y-6">
            {/* Information We Collect */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-600" />
                  Information We Collect
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Account Information</h3>
                  <p className="text-sm text-muted-foreground">
                    When you create an account, we collect your email address, name, and authentication credentials 
                    from supported providers (Google, Replit). This information is necessary to provide you with 
                    personalized access to our gas testing calculation service.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Usage Data</h3>
                  <p className="text-sm text-muted-foreground">
                    We collect information about your use of our service, including calculation parameters, 
                    project details, and subscription preferences. This helps us improve our service and provide 
                    accurate gas testing calculations based on industry standards.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Company Branding (Professional Users)</h3>
                  <p className="text-sm text-muted-foreground">
                    Professional subscribers may upload company logos and provide branding information. 
                    This data is used solely to customize reports and certificates according to your specifications.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* How We Use Your Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-green-600" />
                  How We Use Your Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-600 mt-2 flex-shrink-0"></span>
                    <span>Provide gas testing calculation services and generate professional reports</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-600 mt-2 flex-shrink-0"></span>
                    <span>Manage your account, subscription, and billing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-600 mt-2 flex-shrink-0"></span>
                    <span>Customize reports with your company branding (Professional tier)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-600 mt-2 flex-shrink-0"></span>
                    <span>Improve our service quality and user experience</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-600 mt-2 flex-shrink-0"></span>
                    <span>Communicate with you about service updates and support</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Data Protection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-purple-600" />
                  Data Protection & Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Security Measures</h3>
                  <p className="text-sm text-muted-foreground">
                    We implement industry-standard security measures to protect your personal information, 
                    including encrypted data transmission, secure authentication, and regular security assessments.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Data Retention</h3>
                  <p className="text-sm text-muted-foreground">
                    We retain your account information and calculation data for as long as your account remains active. 
                    You may request deletion of your account and associated data at any time by contacting us.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Third-Party Services</h3>
                  <p className="text-sm text-muted-foreground">
                    We use trusted third-party services for authentication (Google, Replit), payment processing (Stripe), 
                    and cloud storage. These services have their own privacy policies and security measures.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Your Rights */}
            <Card>
              <CardHeader>
                <CardTitle>Your Rights</CardTitle>
                <CardDescription>You have the following rights regarding your personal data</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• <strong>Access:</strong> Request a copy of the personal data we hold about you</li>
                  <li>• <strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
                  <li>• <strong>Deletion:</strong> Request deletion of your personal data and account</li>
                  <li>• <strong>Portability:</strong> Request your data in a structured, machine-readable format</li>
                  <li>• <strong>Objection:</strong> Object to certain processing of your personal data</li>
                </ul>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Us</CardTitle>
                <CardDescription>Questions about this privacy policy or your data</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  If you have any questions about this Privacy Policy or our data practices, 
                  please contact us through the support channels available in your account dashboard.
                </p>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Policy Updates</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We may update this Privacy Policy from time to time. We will notify you of any 
                    material changes by posting the new policy on this page and updating the "Last updated" date.
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