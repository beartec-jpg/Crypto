import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building, Settings, Shield, FileText, Phone, Mail } from "lucide-react";
import { SiX } from "react-icons/si";
import { Link } from "wouter";
import beartecLogo from "@assets/Screenshot_20250823-074823_1755931718570.png";
import beartecFooter from "@assets/Screenshot_20250823-075417_1755932088384.png";

export default function ConsultancyServices() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-20 w-full flex items-center justify-center">
            <img 
              src={beartecLogo} 
              alt="Beartec Engineering Limited - Professional Gas Testing Services" 
              className="h-full max-w-full object-contain"
            />
          </div>
        </div>
      </header>
      <div className="container mx-auto px-4 py-8" id="main-content">
        <div className="max-w-6xl mx-auto">
          {/* Navigation Header */}
          <div className="flex items-center justify-between mb-6">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => window.location.href = '/'}
              className="flex items-center gap-2"
              data-testid="button-try-calculator"
            >
              <ArrowLeft className="w-4 h-4" />
              Try our Calculator
            </Button>
          </div>

          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4 text-[#4cd3eb] bg-[#e7f9fd]">
              BearTec Consultancy Services
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Your trusted partner in gas safety and efficiency. Specializing in gas pipework, combustion and control consultancy.
            </p>
          </div>

          {/* Main Content */}
          <div className="grid gap-8 mb-12">
            {/* About Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Building className="w-6 h-6 text-primary" aria-label="Building Services Icon" />
                  About BearTec
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-lg leading-relaxed">
                  Welcome to BearTec, your trusted partner in gas safety and efficiency. We deliver innovative 
                  solutions to ensure your systems operate at peak performance. As the creators of the 
                  <strong> BearTec Test & Purge Calculator</strong>, we're revolutionizing the industry by 
                  simplifying and enhancing the safety of gas system testing and purging.
                </p>
              </CardContent>
            </Card>

            {/* Services Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Comprehensive Reports */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-600" aria-label="Reports Icon" />
                    Comprehensive Site Reports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Our detailed site reports provide comprehensive insights into your gas infrastructure, 
                    identifying potential risks and ensuring compliance with the latest industry standards.
                  </p>
                </CardContent>
              </Card>

              {/* Safety Standards */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" aria-label="Safety Standards Icon" />
                    Safety Standards Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    We offer expert advice on achieving and maintaining current safety standards, 
                    ensuring your gas systems meet all regulatory requirements and industry best practices.
                  </p>
                </CardContent>
              </Card>

              {/* Maintenance Schedules */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-orange-600" aria-label="Maintenance Icon" />
                    Tailored Maintenance Schedules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Custom maintenance schedules designed to prolong system longevity, 
                    reduce downtime, and ensure optimal performance of your gas infrastructure.
                  </p>
                </CardContent>
              </Card>

              {/* Strategic Upgrades */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="w-5 h-5 text-purple-600" aria-label="Upgrades Icon" />
                    Strategic System Upgrades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Strategic recommendations for system upgrades to optimize efficiency and performance, 
                    helping you stay ahead of industry developments and regulatory changes.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Expertise Section */}
            <Card className="bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-2xl text-center bg-[#e7f9fd]">Our Expertise</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6 text-center">
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Gas Pipework</h3>
                    <p className="text-sm text-muted-foreground">
                      Design, installation, and maintenance of gas distribution systems
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Combustion Systems</h3>
                    <p className="text-sm text-muted-foreground">
                      Optimization and safety analysis of combustion equipment
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Control Systems</h3>
                    <p className="text-sm text-muted-foreground">
                      Advanced control solutions for gas system automation
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Call to Action */}
            <Card className="bg-primary text-primary-foreground">
              <CardHeader>
                <CardTitle className="text-2xl text-center bg-[#e7f9fd]">
                  Ready to Elevate Your Gas Systems?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-lg">
                  At BearTec, we're committed to excellence, combining cutting-edge technology with 
                  deep industry expertise to keep your operations safe, compliant, and efficient.
                </p>
                <p className="text-lg font-semibold">
                  Contact us today to learn how BearTec can support your business with customized gas safety solutions.
                </p>
                <div className="flex justify-center items-center mt-6">
                  <Button 
                    variant="secondary" 
                    size="lg" 
                    className="gap-2 bg-[#e7f9fd] text-secondary-foreground hover:bg-secondary/80"
                    onClick={() => window.location.href = 'mailto:info@BearTec.uk'}
                    data-testid="button-contact-email"
                  >
                    <Mail className="w-5 h-5" />
                    Send Enquiry
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="text-center py-8 border-t border-border">
            <div className="h-16 w-full flex items-center justify-center mb-4">
              <img 
                src={beartecFooter} 
                alt="Beartec Engineering Limited Footer Logo" 
                className="h-full max-w-full object-contain"
              />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              #GasSafety #BearTec
            </p>
            
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