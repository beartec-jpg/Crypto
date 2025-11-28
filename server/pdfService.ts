import puppeteer from 'puppeteer';

// Generate PDF from HTML content using Puppeteer
export async function generatePDFFromHTML(html: string): Promise<Buffer> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF with professional settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '15mm',
        right: '15mm',
        bottom: '15mm',
        left: '15mm'
      },
      displayHeaderFooter: false
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Helper function to generate common styles for all certificates
function generateCommonStyles(primaryColor: string, secondaryColor: string): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fira+Code:wght@500&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #1f2937;
      background: white;
    }
    
    .certificate-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      background: white;
    }
    
    /* Header Section */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 12px;
      margin-bottom: 12px;
      border-bottom: 3px solid ${primaryColor};
    }
    
    .logo-section {
      flex: 0 0 auto;
    }
    
    .logo {
      max-width: 150px;
      max-height: 60px;
      object-fit: contain;
    }
    
    .company-info {
      margin-left: 30px;
      flex: 1;
    }
    
    .company-name {
      font-size: 14pt;
      font-weight: 700;
      color: ${secondaryColor};
      margin-bottom: 4px;
    }
    
    .company-address {
      font-size: 9pt;
      color: #6b7280;
      margin-bottom: 6px;
    }
    
    .company-contact {
      font-size: 8pt;
      color: #6b7280;
    }
    
    .contact-item {
      display: inline-block;
      margin-right: 15px;
    }
    
    .cert-info {
      text-align: right;
      flex: 0 0 auto;
    }
    
    .cert-number {
      font-family: 'Fira Code', monospace;
      font-size: 11pt;
      font-weight: 600;
      color: ${primaryColor};
      margin-bottom: 4px;
    }
    
    .cert-date {
      font-size: 9pt;
      color: #6b7280;
    }
    
    /* Title Section */
    .title-section {
      text-align: center;
      margin-bottom: 15px;
    }
    
    .main-title {
      background: ${primaryColor};
      color: white;
      padding: 8px;
      border-radius: 6px;
      margin-bottom: 6px;
    }
    
    .main-title h1 {
      font-size: 16pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }
    
    .standard-ref {
      font-size: 11pt;
      color: ${secondaryColor};
      font-weight: 600;
    }
    
    /* Section Styling */
    .section {
      margin-bottom: 6px;
      border: 1.5px solid ${primaryColor};
      border-radius: 6px;
      overflow: hidden;
    }
    
    .section-header {
      background: ${secondaryColor};
      color: white;
      padding: 4px 8px;
      font-size: 9pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    
    .section-content {
      padding: 6px;
      background: #fafbfc;
    }
    
    /* Info Grid */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
    
    .info-item {
      display: flex;
      align-items: baseline;
      gap: 4px;
    }
    
    .info-label {
      font-weight: 600;
      color: ${secondaryColor};
      font-size: 9pt;
      text-transform: uppercase;
      min-width: 100px;
      flex-shrink: 0;
    }
    
    .info-value {
      flex: 1;
      border-bottom: 1px dotted #cbd5e1;
      padding-bottom: 2px;
      font-size: 10pt;
      color: #1f2937;
      min-height: 20px;
    }
    
    /* Table Styling */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    
    .data-table th {
      background: ${secondaryColor}80;
      color: white;
      padding: 8px;
      text-align: left;
      font-size: 9pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .data-table td {
      padding: 8px;
      border: 1px solid #e5e7eb;
      background: white;
    }
    
    /* Result Badge */
    .result-container {
      text-align: center;
      margin-top: 6px;
    }
    
    .result-badge {
      display: inline-block;
      padding: 4px 16px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 10pt;
      min-width: 80px;
    }
    
    .result-pass {
      background: #10b981;
      color: white;
    }
    
    .result-fail {
      background: #ef4444;
      color: white;
    }
    
    .result-pending {
      background: #6b7280;
      color: white;
    }
    
    /* Signature Section */
    .signature-section {
      margin-top: 15px;
      border: 2px solid ${primaryColor};
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .signature-header {
      background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);
      padding: 8px 0;
      text-align: center;
    }
    
    .sig-title {
      color: white;
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      background: white;
      min-height: 80px;
    }
    
    .sig-column {
      padding: 15px 12px;
      border-right: 1px solid #e5e7eb;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    
    .sig-column:last-child {
      border-right: none;
    }
    
    .sig-label-line {
      font-size: 9pt;
      color: ${secondaryColor};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      line-height: 1.2;
      margin-bottom: 10px;
      display: block;
    }
    
    .sig-image-container {
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
    }
    
    .signature-image {
      max-height: 30px;
      max-width: 150px;
      object-fit: contain;
    }
    
    .sig-line-container {
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
    }
    
    .signature-line {
      width: 150px;
      height: 2px;
      background: ${secondaryColor};
      border-radius: 1px;
    }
    
    .sig-name-text {
      font-size: 9pt;
      color: #1f2937;
      font-weight: 600;
    }
    
    .sig-date-text {
      font-size: 9pt;
      color: #1f2937;
      font-weight: 600;
      margin-top: 8px;
    }
    
    /* Footer */
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 8pt;
      color: #6b7280;
    }
    
    /* Back button styling */
    .back-button-container {
      text-align: center;
      margin-top: 30px;
      padding: 20px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    
    .back-button {
      background: ${primaryColor};
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .back-button:hover {
      opacity: 0.9;
    }
    
    /* Print styles */
    @media print {
      .back-button-container {
        display: none !important;
      }
      
      body {
        transform: scale(0.85);
        transform-origin: top left;
        margin: 0;
        padding: 0;
      }
      
      .certificate-container {
        page-break-inside: avoid;
        margin: 0;
        padding: 0;
        width: 100%;
      }
      
      .section {
        margin-bottom: 4px;
        page-break-inside: avoid;
      }
      
      .signature-section {
        margin-top: 8px;
        page-break-inside: avoid;
      }
      
      .footer {
        margin-top: 8px;
        font-size: 6pt;
        page-break-inside: avoid;
      }
    }
  `;
}

// Helper function to generate pipe configuration rows
function generatePipeRows(pipeConfigs: any[]): string {
  if (pipeConfigs && Array.isArray(pipeConfigs) && pipeConfigs.length > 0) {
    return pipeConfigs.map((pipe: any) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #e5e7eb; background: white;">${pipe.nominalSize || ''}</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb; background: white;">${pipe.length || ''} m</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb; background: white;">${pipe.calculatedVolume || '0.000'} m³</td>
      </tr>
    `).join('');
  }
  
  // Empty rows for blank certificates
  return Array(3).fill(0).map(() => `
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; background: white; height: 32px;">&nbsp;</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb; background: white;">&nbsp;</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb; background: white;">&nbsp;</td>
    </tr>
  `).join('');
}

// 1. Generate Commercial New Installation Certificate (with Strength Test)
export function generateCommercialNewCertificateHTML(companyBranding: any, testData: any): string {
  const primaryColor = companyBranding?.primaryColor || '#FF6B35';
  const secondaryColor = companyBranding?.secondaryColor || '#2C3E50';
  const logoUrl = companyBranding?.logoUrl;
  
  // Generate certificate number with proper format
  const now = new Date();
  const timeDigits = String(now.getHours()).padStart(2, '0') + 
                    String(now.getMinutes()).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0') + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getFullYear());
  const certNumber = testData?.jobNumber ? `${testData.jobNumber}${timeDigits}` : `CERT${timeDigits}`;
  const issueDate = now.toLocaleDateString('en-GB');
  const assessmentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const pipeRows = generatePipeRows(testData?.pipeConfigs);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Commercial Test and Purge Certificate - IGE/UP/1A</title>
  <style>
    ${generateCommonStyles(primaryColor, secondaryColor)}
  </style>
</head>
<body>
  <div class="certificate-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${logoUrl ? `<img src="${logoUrl}" alt="Company Logo" class="logo" />` : '<div style="width: 120px; height: 50px;"></div>'}
      </div>
      ${companyBranding?.companyName ? `
      <div class="company-info">
        <div class="company-name">${companyBranding.companyName}</div>
        ${companyBranding.companyAddress ? `<div class="company-address">${companyBranding.companyAddress}</div>` : ''}
        <div class="company-contact">
          ${companyBranding.companyPhone ? `<span class="contact-item">📞 ${companyBranding.companyPhone}</span>` : ''}
          ${companyBranding.companyEmail ? `<span class="contact-item">✉️ ${companyBranding.companyEmail}</span>` : ''}
          ${companyBranding.companyWebsite ? `<span class="contact-item">🌐 ${companyBranding.companyWebsite}</span>` : ''}
        </div>
      </div>
      ` : '<div class="company-info"></div>'}
      <div class="cert-info">
        <div class="cert-number">Certificate No: ${certNumber}</div>
        <div class="cert-date">Issue Date: ${issueDate}</div>
      </div>
    </div>

    <!-- Title -->
    <div class="title-section">
      <div class="main-title">
        <h1>Commercial Test and Purge Certificate</h1>
      </div>
      <div class="standard-ref">Compliance Standard: IGE/UP/1A - New Installation</div>
    </div>

    <!-- Section 1: Job Details -->
    <div class="section">
      <div class="section-header">Section 1: Job Details</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Job Reference:</span>
            <span class="info-value">${testData?.jobNumber || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Assessment Date:</span>
            <span class="info-value">${issueDate} ${assessmentTime}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Customer Name:</span>
            <span class="info-value">${testData?.customerName || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Location:</span>
            <span class="info-value">${testData?.location || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Engineer:</span>
            <span class="info-value">${testData?.engineerName || companyBranding?.engineerName || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Gas Safe No:</span>
            <span class="info-value">${testData?.gasSafeNumber || companyBranding?.gasSafeNumber || ''}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: Pipework Configuration -->
    <div class="section">
      <div class="section-header">Section 2: Pipework Configuration</div>
      <div class="section-content">
        <div class="info-grid" style="margin-bottom: 16px;">
          <div class="info-item">
            <span class="info-label">Installation:</span>
            <span class="info-value">New Installation</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Medium:</span>
            <span class="info-value">${testData?.testMedium || 'Natural Gas'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Gauge:</span>
            <span class="info-value">Electronic GRM 0.5</span>
          </div>
          <div class="info-item">
            <span class="info-label">System Volume:</span>
            <span class="info-value">${testData?.totalSystemVolume || ''} m³</span>
          </div>
        </div>
        
        <h4 style="margin: 0 0 8px 0; font-size: 10pt; color: ${secondaryColor}; text-transform: uppercase;">Pipe Configuration:</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nominal Size</th>
              <th>Length</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            ${pipeRows}
          </tbody>
        </table>
        
        <div class="info-grid" style="margin-top: 12px;">
          <div class="info-item">
            <span class="info-label">Meter Config:</span>
            <span class="info-value">${testData?.meterType === 'none' ? 'No Meter' : (testData?.meterType || '')} (Qty: ${testData?.meterQuantity || ''})</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Strength Test -->
    <div class="section">
      <div class="section-header">Section 3: Strength Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Test Pressure:</span>
            <span class="info-value">${testData?.strengthTestPressure || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Duration:</span>
            <span class="info-value">5 minutes</span>
          </div>
          <div class="info-item">
            <span class="info-label">Pressure Drop:</span>
            <span class="info-value">${testData?.strengthActualPressureDrop || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Allowed:</span>
            <span class="info-value">20%</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.strengthTestResult === 'PASS' ? 'result-pass' : testData?.strengthTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.strengthTestResult === 'PASS' ? 'PASS' : testData?.strengthTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Section 4: Tightness Test -->
    <div class="section">
      <div class="section-header">Section 4: Tightness Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Test Pressure:</span>
            <span class="info-value">${testData?.tightnessTestPressure || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Stabilization:</span>
            <span class="info-value">${testData?.stabilizationTime || ''} minutes</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Duration:</span>
            <span class="info-value">${testData?.testDuration || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Pressure Drop:</span>
            <span class="info-value">${testData?.tightnessActualPressureDrop || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Allowed:</span>
            <span class="info-value">${testData?.tightnessMaxPressureDrop || ''} mbar</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.tightnessTestResult === 'PASS' ? 'result-pass' : testData?.tightnessTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.tightnessTestResult === 'PASS' ? 'PASS' : testData?.tightnessTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Section 5: Purge Test -->
    <div class="section">
      <div class="section-header">Section 5: Purge Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Required Volume:</span>
            <span class="info-value">${testData?.purgeVolume || ''} m³</span>
          </div>
          <div class="info-item">
            <span class="info-label">Flow Rate:</span>
            <span class="info-value">${testData?.minimumFlowRate || ''} m³/hr</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Time:</span>
            <span class="info-value">${testData?.maxPurgeTime || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Final Gas %:</span>
            <span class="info-value">${testData?.actualGasContent || ''}%</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.purgeTestResult === 'PASS' ? 'result-pass' : testData?.purgeTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.purgeTestResult === 'PASS' ? 'PASS' : testData?.purgeTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Signature Section -->
    <div class="signature-section">
      <div class="signature-header">
        <div class="sig-title">ENGINEER CERTIFICATION</div>
      </div>
      <div class="signature-grid">
        <div class="sig-column">
          <div class="sig-label-line">ENGINEERS NAME</div>
          <div class="sig-name-text">${testData?.engineerName || companyBranding?.engineerName || ''}</div>
        </div>
        <div class="sig-column">
          <div class="sig-label-line">SIGNATURE</div>
          ${companyBranding?.engineerSignatureUrl ? `
            <div class="sig-image-container">
              <img src="${companyBranding.engineerSignatureUrl}" alt="Engineer Signature" class="signature-image" />
            </div>
          ` : `
            <div class="sig-line-container">
              <div class="signature-line"></div>
            </div>
          `}
        </div>
        <div class="sig-column">
          <div class="sig-label-line">DATE & TIME</div>
          <div class="sig-date-text">${issueDate} ${assessmentTime}</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      Professional Gas Installation Test Certificate - Generated by IGE/UP/1A Calculator System<br/>
      This certificate confirms compliance with IGE/UP/1A standard requirements
    </div>
    
    <!-- Back to Calculator Button -->
    <div class="back-button-container">
      <button onclick="backToCalculator()" class="back-button">
        ← Back to Calculator
      </button>
    </div>
  </div>
  
  <script>
    function backToCalculator() {
      const returnUrl = sessionStorage.getItem('calculatorReturnUrl');
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        window.location.href = '/';
      }
    }
  </script>
</body>
</html>
  `;
}

// 2. Generate Commercial Existing Installation Certificate (with Let-by Test)
export function generateCommercialExistingCertificateHTML(companyBranding: any, testData: any): string {
  const primaryColor = companyBranding?.primaryColor || '#FF6B35';
  const secondaryColor = companyBranding?.secondaryColor || '#2C3E50';
  const logoUrl = companyBranding?.logoUrl;
  
  // Generate certificate number with proper format
  const now = new Date();
  const timeDigits = String(now.getHours()).padStart(2, '0') + 
                    String(now.getMinutes()).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0') + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getFullYear());
  const certNumber = testData?.jobNumber ? `${testData.jobNumber}${timeDigits}` : `CERT${timeDigits}`;
  const issueDate = now.toLocaleDateString('en-GB');
  const assessmentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const pipeRows = generatePipeRows(testData?.pipeConfigs);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Commercial Test and Purge Certificate - IGE/UP/1A</title>
  <style>
    ${generateCommonStyles(primaryColor, secondaryColor)}
  </style>
</head>
<body>
  <div class="certificate-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${logoUrl ? `<img src="${logoUrl}" alt="Company Logo" class="logo" />` : '<div style="width: 120px; height: 50px;"></div>'}
      </div>
      ${companyBranding?.companyName ? `
      <div class="company-info">
        <div class="company-name">${companyBranding.companyName}</div>
        ${companyBranding.companyAddress ? `<div class="company-address">${companyBranding.companyAddress}</div>` : ''}
        <div class="company-contact">
          ${companyBranding.companyPhone ? `<span class="contact-item">📞 ${companyBranding.companyPhone}</span>` : ''}
          ${companyBranding.companyEmail ? `<span class="contact-item">✉️ ${companyBranding.companyEmail}</span>` : ''}
          ${companyBranding.companyWebsite ? `<span class="contact-item">🌐 ${companyBranding.companyWebsite}</span>` : ''}
        </div>
      </div>
      ` : '<div class="company-info"></div>'}
      <div class="cert-info">
        <div class="cert-number">Certificate No: ${certNumber}</div>
        <div class="cert-date">Issue Date: ${issueDate}</div>
      </div>
    </div>

    <!-- Title -->
    <div class="title-section">
      <div class="main-title">
        <h1>Commercial Test and Purge Certificate</h1>
      </div>
      <div class="standard-ref">Compliance Standard: IGE/UP/1A - Existing Installation</div>
    </div>

    <!-- Section 1: Job Details -->
    <div class="section">
      <div class="section-header">Section 1: Job Details</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Job Reference:</span>
            <span class="info-value">${testData?.jobNumber || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Assessment Date:</span>
            <span class="info-value">${issueDate} ${assessmentTime}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Customer Name:</span>
            <span class="info-value">${testData?.customerName || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Location:</span>
            <span class="info-value">${testData?.location || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Engineer:</span>
            <span class="info-value">${testData?.engineerName || companyBranding?.engineerName || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Gas Safe No:</span>
            <span class="info-value">${testData?.gasSafeNumber || companyBranding?.gasSafeNumber || ''}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: Pipework Configuration -->
    <div class="section">
      <div class="section-header">Section 2: Pipework Configuration</div>
      <div class="section-content">
        <div class="info-grid" style="margin-bottom: 16px;">
          <div class="info-item">
            <span class="info-label">Installation:</span>
            <span class="info-value">Existing Installation</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Medium:</span>
            <span class="info-value">${testData?.testMedium || 'Natural Gas'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Gauge:</span>
            <span class="info-value">Electronic GRM 0.5</span>
          </div>
          <div class="info-item">
            <span class="info-label">System Volume:</span>
            <span class="info-value">${testData?.totalSystemVolume || ''} m³</span>
          </div>
        </div>
        
        <h4 style="margin: 0 0 8px 0; font-size: 10pt; color: ${secondaryColor}; text-transform: uppercase;">Pipe Configuration:</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nominal Size</th>
              <th>Length</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            ${pipeRows}
          </tbody>
        </table>
        
        <div class="info-grid" style="margin-top: 12px;">
          <div class="info-item">
            <span class="info-label">Meter Config:</span>
            <span class="info-value">${testData?.meterType === 'none' ? 'No Meter' : (testData?.meterType || '')} (Qty: ${testData?.meterQuantity || ''})</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Let-by Test -->
    <div class="section">
      <div class="section-header">Section 3: Let-by Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Test Pressure:</span>
            <span class="info-value">${testData?.letByTestPressure || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Duration:</span>
            <span class="info-value">${testData?.testDuration || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Pressure Rise:</span>
            <span class="info-value">${testData?.letByActualPressureDrop || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Allowed:</span>
            <span class="info-value">zero rise</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.letByTestResult === 'PASS' ? 'result-pass' : testData?.letByTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.letByTestResult === 'PASS' ? 'PASS' : testData?.letByTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Section 4: Tightness Test -->
    <div class="section">
      <div class="section-header">Section 4: Tightness Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Test Pressure:</span>
            <span class="info-value">${testData?.tightnessTestPressure || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Stabilization:</span>
            <span class="info-value">${testData?.stabilizationTime || ''} minutes</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Duration:</span>
            <span class="info-value">${testData?.testDuration || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Pressure Drop:</span>
            <span class="info-value">${testData?.tightnessActualPressureDrop || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Allowed:</span>
            <span class="info-value">${testData?.tightnessMaxPressureDrop || ''} mbar</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.tightnessTestResult === 'PASS' ? 'result-pass' : testData?.tightnessTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.tightnessTestResult === 'PASS' ? 'PASS' : testData?.tightnessTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Section 5: Purge Test -->
    <div class="section">
      <div class="section-header">Section 5: Purge Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Required Volume:</span>
            <span class="info-value">${testData?.purgeVolume || ''} m³</span>
          </div>
          <div class="info-item">
            <span class="info-label">Flow Rate:</span>
            <span class="info-value">${testData?.minimumFlowRate || ''} m³/hr</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Time:</span>
            <span class="info-value">${testData?.maxPurgeTime || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Final Gas %:</span>
            <span class="info-value">${testData?.actualGasContent || ''}%</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.purgeTestResult === 'PASS' ? 'result-pass' : testData?.purgeTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.purgeTestResult === 'PASS' ? 'PASS' : testData?.purgeTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Signature Section -->
    <div class="signature-section">
      <div class="signature-header">
        <div class="sig-title">ENGINEER CERTIFICATION</div>
      </div>
      <div class="signature-grid">
        <div class="sig-column">
          <div class="sig-label-line">ENGINEERS NAME</div>
          <div class="sig-name-text">${testData?.engineerName || companyBranding?.engineerName || ''}</div>
        </div>
        <div class="sig-column">
          <div class="sig-label-line">SIGNATURE</div>
          ${companyBranding?.engineerSignatureUrl ? `
            <div class="sig-image-container">
              <img src="${companyBranding.engineerSignatureUrl}" alt="Engineer Signature" class="signature-image" />
            </div>
          ` : `
            <div class="sig-line-container">
              <div class="signature-line"></div>
            </div>
          `}
        </div>
        <div class="sig-column">
          <div class="sig-label-line">DATE & TIME</div>
          <div class="sig-date-text">${issueDate} ${assessmentTime}</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      Professional Gas Installation Test Certificate - Generated by IGE/UP/1A Calculator System<br/>
      This certificate confirms compliance with IGE/UP/1A standard requirements
    </div>
    
    <!-- Back to Calculator Button -->
    <div class="back-button-container">
      <button onclick="backToCalculator()" class="back-button">
        ← Back to Calculator
      </button>
    </div>
  </div>
  
  <script>
    function backToCalculator() {
      const returnUrl = sessionStorage.getItem('calculatorReturnUrl');
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        window.location.href = '/';
      }
    }
  </script>
</body>
</html>
  `;
}

// 3. Generate Industrial New Installation Certificate (with Strength Test)
export function generateIndustrialNewCertificateHTML(companyBranding: any, testData: any): string {
  const primaryColor = companyBranding?.primaryColor || '#FF6B35';
  const secondaryColor = companyBranding?.secondaryColor || '#2C3E50';
  const logoUrl = companyBranding?.logoUrl;
  
  // Generate certificate number with proper format
  const now = new Date();
  const timeDigits = String(now.getHours()).padStart(2, '0') + 
                    String(now.getMinutes()).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0') + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getFullYear());
  const certNumber = testData?.jobNumber ? `${testData.jobNumber}${timeDigits}` : `CERT${timeDigits}`;
  const issueDate = now.toLocaleDateString('en-GB');
  const assessmentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const pipeRows = generatePipeRows(testData?.pipeConfigs);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Industrial Test and Purge Certificate - IGE/UP/1</title>
  <style>
    ${generateCommonStyles(primaryColor, secondaryColor)}
  </style>
</head>
<body>
  <div class="certificate-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${logoUrl ? `<img src="${logoUrl}" alt="Company Logo" class="logo" />` : '<div style="width: 120px; height: 50px;"></div>'}
      </div>
      ${companyBranding?.companyName ? `
      <div class="company-info">
        <div class="company-name">${companyBranding.companyName}</div>
        ${companyBranding.companyAddress ? `<div class="company-address">${companyBranding.companyAddress}</div>` : ''}
        <div class="company-contact">
          ${companyBranding.companyPhone ? `<span class="contact-item">📞 ${companyBranding.companyPhone}</span>` : ''}
          ${companyBranding.companyEmail ? `<span class="contact-item">✉️ ${companyBranding.companyEmail}</span>` : ''}
          ${companyBranding.companyWebsite ? `<span class="contact-item">🌐 ${companyBranding.companyWebsite}</span>` : ''}
        </div>
      </div>
      ` : '<div class="company-info"></div>'}
      <div class="cert-info">
        <div class="cert-number">Certificate No: ${certNumber}</div>
        <div class="cert-date">Issue Date: ${issueDate}</div>
      </div>
    </div>

    <!-- Title -->
    <div class="title-section">
      <div class="main-title">
        <h1>Industrial Test and Purge Certificate</h1>
      </div>
      <div class="standard-ref">Compliance Standard: IGE/UP/1 - New Installation</div>
    </div>

    <!-- Section 1: Job Details -->
    <div class="section">
      <div class="section-header">Section 1: Job Details</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Job Reference:</span>
            <span class="info-value">${testData?.jobNumber || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Assessment Date:</span>
            <span class="info-value">${issueDate} ${assessmentTime}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Customer Name:</span>
            <span class="info-value">${testData?.customerName || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Location:</span>
            <span class="info-value">${testData?.location || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Engineer:</span>
            <span class="info-value">${testData?.engineerName || companyBranding?.engineerName || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Gas Safe No:</span>
            <span class="info-value">${testData?.gasSafeNumber || companyBranding?.gasSafeNumber || ''}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: System Configuration -->
    <div class="section">
      <div class="section-header">Section 2: System Configuration</div>
      <div class="section-content">
        <div class="info-grid" style="margin-bottom: 16px;">
          <div class="info-item">
            <span class="info-label">Zone Type:</span>
            <span class="info-value">${testData?.zoneType || 'Type A'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Installation:</span>
            <span class="info-value">New Installation</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Medium:</span>
            <span class="info-value">${testData?.testMedium || 'Natural Gas'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">System Volume:</span>
            <span class="info-value">${testData?.totalSystemVolume || ''} m³</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Gauge:</span>
            <span class="info-value">${testData?.gaugeType || 'Electronic GRM 0.5'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">MOP:</span>
            <span class="info-value">${testData?.maximumOperatingPressure || ''} mbar</span>
          </div>
        </div>
        
        <h4 style="margin: 0 0 8px 0; font-size: 10pt; color: ${secondaryColor}; text-transform: uppercase;">Pipe Configuration:</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nominal Size</th>
              <th>Length</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            ${pipeRows}
          </tbody>
        </table>
        
        <div class="info-grid" style="margin-top: 12px;">
          <div class="info-item">
            <span class="info-label">Meter Config:</span>
            <span class="info-value">${testData?.meterType === 'none' ? 'No Meter' : (testData?.meterType || '')} (Qty: ${testData?.meterQuantity ?? ''})</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Strength Test -->
    <div class="section">
      <div class="section-header">Section 3: Strength Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Test Pressure:</span>
            <span class="info-value">${testData?.strengthTestPressure || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Duration:</span>
            <span class="info-value">${testData?.strengthTestDuration || '10'} minutes</span>
          </div>
          <div class="info-item">
            <span class="info-label">Pressure Drop:</span>
            <span class="info-value">${testData?.strengthActualPressureDrop || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Allowed:</span>
            <span class="info-value">${testData?.strengthMaxPressureDrop || ''} mbar</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.strengthTestResult === 'PASS' ? 'result-pass' : testData?.strengthTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.strengthTestResult === 'PASS' ? 'PASS' : testData?.strengthTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Section 4: Tightness Test -->
    <div class="section">
      <div class="section-header">Section 4: Tightness Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Test Pressure:</span>
            <span class="info-value">${testData?.tightnessTestPressure || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Stabilization:</span>
            <span class="info-value">${testData?.stabilizationTime || ''} minutes</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Duration:</span>
            <span class="info-value">${testData?.testDuration || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Pressure Drop:</span>
            <span class="info-value">${testData?.tightnessActualPressureDrop || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Allowed:</span>
            <span class="info-value">${testData?.tightnessMaxPressureDrop || ''} mbar</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.tightnessTestResult === 'PASS' ? 'result-pass' : testData?.tightnessTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.tightnessTestResult === 'PASS' ? 'PASS' : testData?.tightnessTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Section 5: Purge Test -->
    <div class="section">
      <div class="section-header">Section 5: Purge Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Required Volume:</span>
            <span class="info-value">${testData?.purgeVolume || ''} m³</span>
          </div>
          <div class="info-item">
            <span class="info-label">Flow Rate:</span>
            <span class="info-value">${testData?.minimumFlowRate || ''} m³/hr</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Time:</span>
            <span class="info-value">${testData?.maxPurgeTime || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Final Gas %:</span>
            <span class="info-value">${testData?.actualGasContent || ''}%</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.purgeTestResult === 'PASS' ? 'result-pass' : testData?.purgeTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.purgeTestResult === 'PASS' ? 'PASS' : testData?.purgeTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Signature Section -->
    <div class="signature-section">
      <div class="signature-header">
        <div class="sig-title">ENGINEER CERTIFICATION</div>
      </div>
      <div class="signature-grid">
        <div class="sig-column">
          <div class="sig-label-line">ENGINEERS NAME</div>
          <div class="sig-name-text">${testData?.engineerName || companyBranding?.engineerName || ''}</div>
        </div>
        <div class="sig-column">
          <div class="sig-label-line">SIGNATURE</div>
          ${companyBranding?.engineerSignatureUrl ? `
            <div class="sig-image-container">
              <img src="${companyBranding.engineerSignatureUrl}" alt="Engineer Signature" class="signature-image" />
            </div>
          ` : `
            <div class="sig-line-container">
              <div class="signature-line"></div>
            </div>
          `}
        </div>
        <div class="sig-column">
          <div class="sig-label-line">DATE & TIME</div>
          <div class="sig-date-text">${issueDate} ${assessmentTime}</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      Professional Gas Installation Test Certificate - Generated by IGE/UP/1 Calculator System<br/>
      This certificate confirms compliance with IGE/UP/1 standard requirements
    </div>
    
    <!-- Back to Calculator Button -->
    <div class="back-button-container">
      <button onclick="backToCalculator()" class="back-button">
        ← Back to Calculator
      </button>
    </div>
  </div>
  
  <script>
    function backToCalculator() {
      const returnUrl = sessionStorage.getItem('calculatorReturnUrl');
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        window.location.href = '/';
      }
    }
  </script>
</body>
</html>
  `;
}

// 4. Generate Industrial Existing Installation Certificate (with Let-by Test)
export function generateIndustrialExistingCertificateHTML(companyBranding: any, testData: any): string {
  const primaryColor = companyBranding?.primaryColor || '#FF6B35';
  const secondaryColor = companyBranding?.secondaryColor || '#2C3E50';
  const logoUrl = companyBranding?.logoUrl;
  
  // Generate certificate number with proper format
  const now = new Date();
  const timeDigits = String(now.getHours()).padStart(2, '0') + 
                    String(now.getMinutes()).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0') + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getFullYear());
  const certNumber = testData?.jobNumber ? `${testData.jobNumber}${timeDigits}` : `CERT${timeDigits}`;
  const issueDate = now.toLocaleDateString('en-GB');
  const assessmentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const pipeRows = generatePipeRows(testData?.pipeConfigs);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Industrial Test and Purge Certificate - IGE/UP/1</title>
  <style>
    ${generateCommonStyles(primaryColor, secondaryColor)}
  </style>
</head>
<body>
  <div class="certificate-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${logoUrl ? `<img src="${logoUrl}" alt="Company Logo" class="logo" />` : '<div style="width: 120px; height: 50px;"></div>'}
      </div>
      ${companyBranding?.companyName ? `
      <div class="company-info">
        <div class="company-name">${companyBranding.companyName}</div>
        ${companyBranding.companyAddress ? `<div class="company-address">${companyBranding.companyAddress}</div>` : ''}
        <div class="company-contact">
          ${companyBranding.companyPhone ? `<span class="contact-item">📞 ${companyBranding.companyPhone}</span>` : ''}
          ${companyBranding.companyEmail ? `<span class="contact-item">✉️ ${companyBranding.companyEmail}</span>` : ''}
          ${companyBranding.companyWebsite ? `<span class="contact-item">🌐 ${companyBranding.companyWebsite}</span>` : ''}
        </div>
      </div>
      ` : '<div class="company-info"></div>'}
      <div class="cert-info">
        <div class="cert-number">Certificate No: ${certNumber}</div>
        <div class="cert-date">Issue Date: ${issueDate}</div>
      </div>
    </div>

    <!-- Title -->
    <div class="title-section">
      <div class="main-title">
        <h1>Industrial Test and Purge Certificate</h1>
      </div>
      <div class="standard-ref">Compliance Standard: IGE/UP/1 - Existing Installation</div>
    </div>

    <!-- Section 1: Job Details -->
    <div class="section">
      <div class="section-header">Section 1: Job Details</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Job Reference:</span>
            <span class="info-value">${testData?.jobNumber || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Assessment Date:</span>
            <span class="info-value">${issueDate} ${assessmentTime}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Customer Name:</span>
            <span class="info-value">${testData?.customerName || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Location:</span>
            <span class="info-value">${testData?.location || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Engineer:</span>
            <span class="info-value">${testData?.engineerName || companyBranding?.engineerName || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Gas Safe No:</span>
            <span class="info-value">${testData?.gasSafeNumber || companyBranding?.gasSafeNumber || ''}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: System Configuration -->
    <div class="section">
      <div class="section-header">Section 2: System Configuration</div>
      <div class="section-content">
        <div class="info-grid" style="margin-bottom: 16px;">
          <div class="info-item">
            <span class="info-label">Zone Type:</span>
            <span class="info-value">${testData?.zoneType || 'Type A'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Installation:</span>
            <span class="info-value">Existing Installation</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Medium:</span>
            <span class="info-value">${testData?.testMedium || 'Natural Gas'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">System Volume:</span>
            <span class="info-value">${testData?.totalSystemVolume || ''} m³</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Gauge:</span>
            <span class="info-value">${testData?.gaugeType || 'Electronic GRM 0.5'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">MOP:</span>
            <span class="info-value">${testData?.maximumOperatingPressure || ''} mbar</span>
          </div>
        </div>
        
        <h4 style="margin: 0 0 8px 0; font-size: 10pt; color: ${secondaryColor}; text-transform: uppercase;">Pipe Configuration:</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nominal Size</th>
              <th>Length</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            ${pipeRows}
          </tbody>
        </table>
        
        <div class="info-grid" style="margin-top: 12px;">
          <div class="info-item">
            <span class="info-label">Meter Config:</span>
            <span class="info-value">${testData?.meterType === 'none' ? 'No Meter' : (testData?.meterType || '')} (Qty: ${testData?.meterQuantity ?? ''})</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Let-by Test -->
    <div class="section">
      <div class="section-header">Section 3: Let-by Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Test Pressure:</span>
            <span class="info-value">${testData?.letByTestPressure || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Duration:</span>
            <span class="info-value">${testData?.testDuration || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Pressure Rise:</span>
            <span class="info-value">${testData?.letByActualPressureDrop || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Allowed:</span>
            <span class="info-value">zero rise</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.letByTestResult === 'PASS' ? 'result-pass' : testData?.letByTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.letByTestResult === 'PASS' ? 'PASS' : testData?.letByTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Section 4: Tightness Test -->
    <div class="section">
      <div class="section-header">Section 4: Tightness Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Test Pressure:</span>
            <span class="info-value">${testData?.tightnessTestPressure || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Stabilization:</span>
            <span class="info-value">${testData?.stabilizationTime || ''} minutes</span>
          </div>
          <div class="info-item">
            <span class="info-label">Test Duration:</span>
            <span class="info-value">${testData?.testDuration || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Pressure Drop:</span>
            <span class="info-value">${testData?.tightnessActualPressureDrop || ''} mbar</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Allowed:</span>
            <span class="info-value">${testData?.tightnessMaxPressureDrop || ''} mbar</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.tightnessTestResult === 'PASS' ? 'result-pass' : testData?.tightnessTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.tightnessTestResult === 'PASS' ? 'PASS' : testData?.tightnessTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Section 5: Purge Test -->
    <div class="section">
      <div class="section-header">Section 5: Purge Test</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Required Volume:</span>
            <span class="info-value">${testData?.purgeVolume || ''} m³</span>
          </div>
          <div class="info-item">
            <span class="info-label">Flow Rate:</span>
            <span class="info-value">${testData?.minimumFlowRate || ''} m³/hr</span>
          </div>
          <div class="info-item">
            <span class="info-label">Max Time:</span>
            <span class="info-value">${testData?.maxPurgeTime || ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Final Gas %:</span>
            <span class="info-value">${testData?.actualGasContent || ''}%</span>
          </div>
        </div>
        <div class="result-container">
          <span class="result-badge ${testData?.purgeTestResult === 'PASS' ? 'result-pass' : testData?.purgeTestResult === 'FAIL' ? 'result-fail' : 'result-pending'}">
            ${testData?.purgeTestResult === 'PASS' ? 'PASS' : testData?.purgeTestResult === 'FAIL' ? 'FAIL' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <!-- Signature Section -->
    <div class="signature-section">
      <div class="signature-header">
        <div class="sig-title">ENGINEER CERTIFICATION</div>
      </div>
      <div class="signature-grid">
        <div class="sig-column">
          <div class="sig-label-line">ENGINEERS NAME</div>
          <div class="sig-name-text">${testData?.engineerName || companyBranding?.engineerName || ''}</div>
        </div>
        <div class="sig-column">
          <div class="sig-label-line">SIGNATURE</div>
          ${companyBranding?.engineerSignatureUrl ? `
            <div class="sig-image-container">
              <img src="${companyBranding.engineerSignatureUrl}" alt="Engineer Signature" class="signature-image" />
            </div>
          ` : `
            <div class="sig-line-container">
              <div class="signature-line"></div>
            </div>
          `}
        </div>
        <div class="sig-column">
          <div class="sig-label-line">DATE & TIME</div>
          <div class="sig-date-text">${issueDate} ${assessmentTime}</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      Professional Gas Installation Test Certificate - Generated by IGE/UP/1 Calculator System<br/>
      This certificate confirms compliance with IGE/UP/1 standard requirements
    </div>
    
    <!-- Back to Calculator Button -->
    <div class="back-button-container">
      <button onclick="backToCalculator()" class="back-button">
        ← Back to Calculator
      </button>
    </div>
  </div>
  
  <script>
    function backToCalculator() {
      const returnUrl = sessionStorage.getItem('calculatorReturnUrl');
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        window.location.href = '/';
      }
    }
  </script>
</body>
</html>
  `;
}