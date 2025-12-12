// SMS Notification Service using Twilio Integration
import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export interface SMSAlertOptions {
  to: string;
  symbol: string;
  alertType: string;
  price: number;
  message?: string;
}

export async function sendSMSAlert(options: SMSAlertOptions): Promise<boolean> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    if (!fromNumber) {
      console.error('No Twilio phone number configured');
      return false;
    }

    const body = options.message || 
      `🔔 ${options.symbol} Alert: ${options.alertType} at $${options.price.toFixed(options.price > 100 ? 2 : 4)}`;

    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: options.to
    });

    console.log(`✅ SMS sent successfully: ${message.sid}`);
    return true;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    return false;
  }
}

export async function sendBulkSMSAlerts(
  phoneNumbers: string[],
  symbol: string,
  alertType: string,
  price: number,
  customMessage?: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const to of phoneNumbers) {
    const success = await sendSMSAlert({
      to,
      symbol,
      alertType,
      price,
      message: customMessage
    });
    
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

export async function testSMSConnection(toNumber: string): Promise<boolean> {
  try {
    const result = await sendSMSAlert({
      to: toNumber,
      symbol: 'TEST',
      alertType: 'Connection Test',
      price: 0,
      message: '✅ BearTec SMS alerts are now connected! You will receive trading alerts via SMS.'
    });
    return result;
  } catch (error) {
    console.error('SMS connection test failed:', error);
    return false;
  }
}
