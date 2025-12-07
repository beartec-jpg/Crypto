import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowLeft, Shield } from 'lucide-react';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';

export default function CryptoPrivacy() {
  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white p-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        {/* BearTec Logo - Top Center */}
        <div className="flex justify-center mb-8">
          <img 
            src={bearTecLogoNew} 
            alt="BearTec Logo" 
            className="h-[140px] w-auto object-contain"
          />
        </div>

        {/* Back Button */}
        <Link href="/cryptoindicators">
          <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Indicators
          </Button>
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-[#00c4b4]" />
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
        </div>

        <p className="text-gray-400 text-sm mb-8">
          Last Updated: November 20, 2025
        </p>

        <div className="space-y-6">
          {/* Introduction */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Introduction</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                BearTec ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our cryptocurrency trading analysis platform and services.
              </p>
              <p>
                By using our services, you agree to the collection and use of information in accordance with this policy.
              </p>
            </CardContent>
          </Card>

          {/* Information We Collect */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Information We Collect</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Personal Information</h3>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>Email address (for account creation and authentication)</li>
                  <li>Name and profile information (if provided via OAuth providers like Google or Replit)</li>
                  <li>Payment information (processed securely through Stripe)</li>
                  <li>Subscription tier and billing information</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Usage Data</h3>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>Trading symbols and timeframes you analyze</li>
                  <li>Technical indicator preferences and settings</li>
                  <li>AI analysis requests and credit usage</li>
                  <li>Alert preferences and notification settings</li>
                  <li>Device information, IP address, and browser type</li>
                  <li>Access times and referring URLs</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Automatically Collected Data</h3>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>Session data and authentication tokens</li>
                  <li>Performance metrics and error logs</li>
                  <li>Cookie data for session management</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* How We Use Your Information */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">How We Use Your Information</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Provide and maintain our trading analysis services</li>
                <li>Process your subscription payments and manage your account</li>
                <li>Generate AI-powered trade alerts and market analysis</li>
                <li>Send you technical updates, security alerts, and support messages</li>
                <li>Improve our services, features, and user experience</li>
                <li>Monitor and analyze usage patterns and trends</li>
                <li>Detect, prevent, and address technical issues or fraud</li>
                <li>Send push notifications for trade alerts (with your consent)</li>
                <li>Comply with legal obligations and enforce our terms</li>
              </ul>
            </CardContent>
          </Card>

          {/* Data Sharing and Disclosure */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Data Sharing and Disclosure</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-4">
              <p>We do not sell your personal information. We may share your information with:</p>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Service Providers</h3>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li><strong>Stripe:</strong> Payment processing and subscription management</li>
                  <li><strong>Replit/Google OAuth:</strong> Authentication services</li>
                  <li><strong>xAI (Grok):</strong> AI-powered market analysis</li>
                  <li><strong>Neon Database:</strong> Secure data storage</li>
                  <li><strong>Binance/Exchange APIs:</strong> Real-time market data</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Legal Requirements</h3>
                <p className="text-sm">
                  We may disclose your information if required by law, court order, or government regulation, or to protect our rights, property, or safety.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Security */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Data Security</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>We implement industry-standard security measures to protect your data:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Encrypted data transmission (HTTPS/TLS)</li>
                <li>Secure session management with encrypted cookies</li>
                <li>OAuth 2.0 authentication protocols</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication requirements</li>
              </ul>
              <p className="text-sm text-yellow-400 mt-4">
                However, no method of transmission over the internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.
              </p>
            </CardContent>
          </Card>

          {/* Data Retention */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Data Retention</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>We retain your personal information for as long as necessary to:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Provide our services and maintain your account</li>
                <li>Comply with legal, tax, or accounting requirements</li>
                <li>Resolve disputes and enforce our agreements</li>
              </ul>
              <p className="text-sm mt-3">
                When you delete your account, we will delete or anonymize your personal information within 30 days, except where retention is required by law.
              </p>
            </CardContent>
          </Card>

          {/* Your Rights */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Your Privacy Rights</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>Depending on your location, you may have the following rights:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal data</li>
                <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
                <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
                <li><strong>Withdraw consent:</strong> Revoke consent for data processing</li>
              </ul>
              <p className="text-sm mt-3">
                To exercise these rights, contact us at info@BearTec.uk
              </p>
            </CardContent>
          </Card>

          {/* Cookies and Tracking */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Cookies and Tracking Technologies</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>We use cookies and similar technologies to:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Maintain your login session</li>
                <li>Remember your preferences and settings</li>
                <li>Analyze usage patterns and improve our services</li>
              </ul>
              <p className="text-sm mt-3">
                You can control cookies through your browser settings, but disabling cookies may affect your ability to use certain features.
              </p>
            </CardContent>
          </Card>

          {/* Third-Party Services */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Third-Party Services</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>Our platform integrates with third-party services that have their own privacy policies:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong>Stripe:</strong> stripe.com/privacy</li>
                <li><strong>Google:</strong> policies.google.com/privacy</li>
                <li><strong>Replit:</strong> replit.com/site/privacy</li>
                <li><strong>xAI:</strong> x.ai/legal/privacy-policy</li>
              </ul>
              <p className="text-sm mt-3">
                We are not responsible for the privacy practices of these third-party services.
              </p>
            </CardContent>
          </Card>

          {/* Children's Privacy */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Children's Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                Our services are not intended for users under 18 years of age. We do not knowingly collect personal information from children. If you become aware that a child has provided us with personal data, please contact us immediately.
              </p>
            </CardContent>
          </Card>

          {/* Changes to This Policy */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Changes to This Privacy Policy</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last Updated" date.
              </p>
              <p>
                Significant changes will be communicated via email or prominent notice on our platform.
              </p>
            </CardContent>
          </Card>

          {/* Contact Us */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>If you have questions about this Privacy Policy or our data practices, contact us:</p>
              <ul className="list-none space-y-2 text-sm">
                <li><strong>Email:</strong> info@BearTec.uk</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Footer Navigation */}
        <div className="border-t border-[#2a2e39] mt-8 pt-6">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <Link href="/cryptoterms">
              <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
                Terms of Service
              </Button>
            </Link>
            <Link href="/cryptosubscribe">
              <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
                Subscriptions
              </Button>
            </Link>
            <Link href="/crypto/training">
              <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
                Trading Education
              </Button>
            </Link>
            <a href="mailto:info@BearTec.uk" className="text-gray-400 hover:text-white">
              Contact Support
            </a>
          </div>
          <div className="text-center text-sm text-gray-500 mt-4">
            © 2025 BearTec. For educational and informational purposes only.
          </div>
        </div>
      </div>
    </div>
  );
}
