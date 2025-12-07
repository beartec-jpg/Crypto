import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowLeft, FileText } from 'lucide-react';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';

export default function CryptoTerms() {
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
          <FileText className="w-8 h-8 text-[#00c4b4]" />
          <h1 className="text-3xl font-bold">Terms of Service</h1>
        </div>

        <p className="text-gray-400 text-sm mb-8">
          Last Updated: November 20, 2025
        </p>

        <div className="space-y-6">
          {/* Agreement */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Agreement to Terms</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                By accessing or using the BearTec cryptocurrency trading analysis platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use our Service.
              </p>
              <p className="text-yellow-400 text-sm font-semibold">
                IMPORTANT: This Service is for educational and informational purposes only. Cryptocurrency trading involves substantial risk of loss. BearTec does not provide financial advice.
              </p>
            </CardContent>
          </Card>

          {/* Service Description */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Service Description</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>BearTec provides:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Real-time cryptocurrency price charts and technical indicators</li>
                <li>Order flow analysis tools including CVD, Volume Profile, and POC/VAH/VAL</li>
                <li>Technical oscillators (RSI, MACD, OBV, MFI)</li>
                <li>Smart Money Concepts indicators (Order Blocks, FVGs, BOS/CHoCH)</li>
                <li>AI-powered trade alerts and market analysis (subscription tiers)</li>
                <li>Push notifications for trade setups (Pro and Elite tiers)</li>
                <li>Multi-exchange order flow data aggregation</li>
              </ul>
            </CardContent>
          </Card>

          {/* Account Responsibilities */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Account Responsibilities</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>When creating an account, you agree to:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and update your account information</li>
                <li>Keep your login credentials secure and confidential</li>
                <li>Be responsible for all activities under your account</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Be at least 18 years of age</li>
              </ul>
              <p className="text-sm mt-3">
                You may not share your account, transfer it to others, or use multiple accounts to circumvent subscription limits.
              </p>
            </CardContent>
          </Card>

          {/* Subscription Tiers */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Subscription Tiers and Billing</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Subscription Levels</h3>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li><strong>Free:</strong> Basic chart access and limited indicators</li>
                  <li><strong>Beginner ($10/month):</strong> AI market summaries, basic alerts</li>
                  <li><strong>Intermediate ($15/month):</strong> 50 monthly AI credits, advanced indicators</li>
                  <li><strong>Pro ($40/month):</strong> Unlimited AI credits, push notifications, all features</li>
                  <li><strong>Elite ($100/month):</strong> Priority AI processing, dedicated support</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Billing Terms</h3>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>Subscriptions are billed monthly in advance via Stripe</li>
                  <li>Automatic renewal unless cancelled before renewal date</li>
                  <li>No refunds for partial months or unused AI credits</li>
                  <li>Prices subject to change with 30 days notice</li>
                  <li>Payment failures may result in service suspension</li>
                  <li>AI credits reset monthly and do not roll over</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Cancellation</h3>
                <p className="text-sm">
                  You may cancel your subscription at any time. Access continues until the end of your billing period. No refunds for early cancellation.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Acceptable Use */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Acceptable Use Policy</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>You agree NOT to:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Violate any laws or regulations</li>
                <li>Reverse engineer, decompile, or hack the Service</li>
                <li>Use automated scripts or bots to scrape data</li>
                <li>Overload our servers or interfere with other users</li>
                <li>Share, resell, or distribute our proprietary analysis or alerts</li>
                <li>Manipulate or abuse AI credit systems</li>
                <li>Use the Service for market manipulation or fraud</li>
                <li>Impersonate others or create false accounts</li>
                <li>Upload malware, viruses, or harmful code</li>
              </ul>
              <p className="text-sm mt-3 text-yellow-400">
                Violations may result in immediate account termination without refund.
              </p>
            </CardContent>
          </Card>

          {/* Disclaimer of Warranties */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Disclaimer of Warranties</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p className="text-yellow-400 font-semibold">NOT FINANCIAL ADVICE</p>
              <p className="text-sm">
                BearTec provides technical analysis tools and educational content ONLY. We do not provide investment, financial, legal, or tax advice. All information is for educational purposes.
              </p>
              <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg mt-4">
                <h3 className="font-semibold text-white mb-2">Important Disclaimers:</h3>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>The Service is provided "AS IS" and "AS AVAILABLE" without warranties</li>
                  <li>We do not guarantee accuracy, completeness, or timeliness of data</li>
                  <li>Technical indicators and AI analysis may be inaccurate or delayed</li>
                  <li>Past performance does not indicate future results</li>
                  <li>Trading cryptocurrencies involves substantial risk of loss</li>
                  <li>You may lose all invested capital</li>
                  <li>We are not responsible for your trading decisions or losses</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Limitation of Liability */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p className="font-semibold">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, BEARTEC SHALL NOT BE LIABLE FOR:
              </p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Trading losses or financial damages resulting from use of the Service</li>
                <li>Errors, inaccuracies, or delays in data or analysis</li>
                <li>Service interruptions, downtime, or technical failures</li>
                <li>Third-party actions (exchange outages, API failures, etc.)</li>
                <li>Unauthorized access to your account</li>
                <li>Loss of data or AI credits</li>
                <li>Indirect, incidental, consequential, or punitive damages</li>
              </ul>
              <p className="text-sm mt-3">
                Our total liability is limited to the amount you paid for the Service in the past 12 months, or $100, whichever is less.
              </p>
            </CardContent>
          </Card>

          {/* Indemnification */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Indemnification</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                You agree to indemnify and hold harmless BearTec, its affiliates, and employees from any claims, damages, losses, or expenses (including legal fees) arising from:
              </p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Your use of the Service</li>
                <li>Your trading decisions and financial losses</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any laws or third-party rights</li>
              </ul>
            </CardContent>
          </Card>

          {/* Intellectual Property */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Intellectual Property</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                All content, software, algorithms, analysis, and materials provided by BearTec are our exclusive property and protected by copyright, trademark, and trade secret laws.
              </p>
              <p className="text-sm mt-2">
                You may not copy, modify, distribute, sell, or create derivative works from our proprietary content without written permission.
              </p>
            </CardContent>
          </Card>

          {/* Third-Party Services */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Third-Party Services</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>Our Service integrates with third-party providers:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong>Binance API:</strong> Market data (subject to Binance Terms)</li>
                <li><strong>xAI Grok:</strong> AI analysis (subject to xAI Terms)</li>
                <li><strong>Stripe:</strong> Payment processing (subject to Stripe Terms)</li>
                <li><strong>Google/Replit OAuth:</strong> Authentication</li>
              </ul>
              <p className="text-sm mt-3">
                We are not responsible for third-party service failures, changes, or discontinuation.
              </p>
            </CardContent>
          </Card>

          {/* Termination */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Termination</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>We may suspend or terminate your account at any time for:</p>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Violation of these Terms</li>
                <li>Fraudulent or illegal activity</li>
                <li>Abuse of the Service or AI credits</li>
                <li>Non-payment of subscription fees</li>
                <li>Any reason at our sole discretion</li>
              </ul>
              <p className="text-sm mt-3">
                Upon termination, your access ends immediately and no refunds are provided.
              </p>
            </CardContent>
          </Card>

          {/* Governing Law */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Governing Law and Disputes</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                These Terms are governed by the laws of the United Kingdom. Any disputes shall be resolved through binding arbitration in accordance with UK arbitration rules.
              </p>
              <p className="text-sm mt-2">
                You waive the right to participate in class action lawsuits.
              </p>
            </CardContent>
          </Card>

          {/* Changes to Terms */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Changes to Terms</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                We may modify these Terms at any time. Material changes will be communicated via email or prominent notice on the platform at least 30 days before taking effect.
              </p>
              <p className="text-sm mt-2">
                Continued use of the Service after changes constitutes acceptance of the new Terms.
              </p>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>For questions about these Terms, contact us:</p>
              <ul className="list-none space-y-2 text-sm">
                <li><strong>Email:</strong> info@BearTec.uk</li>
              </ul>
            </CardContent>
          </Card>

          {/* Severability */}
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CardHeader>
              <CardTitle className="text-xl text-white">Severability</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 space-y-3">
              <p>
                If any provision of these Terms is found unenforceable, the remaining provisions shall continue in full force and effect.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer Navigation */}
        <div className="border-t border-[#2a2e39] mt-8 pt-6">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <Link href="/cryptoprivacy">
              <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
                Privacy Policy
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
