// client/src/components/Security/SecurityEducationCenter.tsx
// Comprehensive security education hub

import { useState } from 'react';
import {
  Shield,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Key,
  Smartphone,
  Wifi,
  MessageSquare,
  Mail,
  ExternalLink,
  CheckCircle,
  XCircle,
  Info,
  HardDrive,
  Zap,
  Users,
  FileText,
  BookOpen,
  ChevronRight,
} from 'lucide-react';

type SecurityTopic = 
  | 'overview'
  | 'seed-phrase'
  | 'phishing'
  | 'social-engineering'
  | 'hardware-wallets'
  | 'passwords'
  | 'network-security'
  | 'best-practices'
  | 'red-flags';

interface SecurityArticle {
  id: SecurityTopic;
  title: string;
  icon: any;
  color: string;
  description: string;
}

const SECURITY_ARTICLES: SecurityArticle[] = [
  {
    id: 'seed-phrase',
    title: 'Seed Phrase Security',
    icon: Key,
    color: 'text-red-400',
    description: 'Your seed phrase is the master key to your wallet. Learn how to keep it safe.',
  },
  {
    id: 'phishing',
    title: 'Phishing & Scams',
    icon: AlertTriangle,
    color: 'text-yellow-400',
    description: 'Recognize and avoid phishing attacks, fake websites, and crypto scams.',
  },
  {
    id: 'social-engineering',
    title: 'Social Engineering',
    icon: Users,
    color: 'text-orange-400',
    description: 'Protect yourself from manipulation tactics used by attackers.',
  },
  {
    id: 'hardware-wallets',
    title: 'Hardware Wallets',
    icon: HardDrive,
    color: 'text-blue-400',
    description: 'Learn about hardware wallets and when you should use them.',
  },
  {
    id: 'passwords',
    title: 'Password Security',
    icon: Lock,
    color: 'text-green-400',
    description: 'Create strong passwords and use password managers effectively.',
  },
  {
    id: 'network-security',
    title: 'Network Security',
    icon: Wifi,
    color: 'text-purple-400',
    description: 'Stay safe on public Wi-Fi and protect your connection.',
  },
  {
    id: 'best-practices',
    title: 'Best Practices',
    icon: CheckCircle,
    color: 'text-cyan-400',
    description: 'Daily habits to keep your crypto safe and secure.',
  },
  {
    id: 'red-flags',
    title: 'Red Flags',
    icon: XCircle,
    color: 'text-red-400',
    description: 'Warning signs that indicate a potential scam or attack.',
  },
];

export default function SecurityEducationCenter() {
  const [selectedTopic, setSelectedTopic] = useState<SecurityTopic>('overview');

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-blue-500" />
            <h1 className="text-3xl font-bold">Security Education Center</h1>
          </div>
          <p className="text-gray-400">
            Learn how to protect your crypto assets and stay safe in Web3
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Sidebar - Topics */}
          <div className="md:col-span-1">
            <div className="bg-gray-800 rounded-lg p-4 sticky top-6">
              <h2 className="text-lg font-semibold mb-4">Topics</h2>
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedTopic('overview')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center justify-between ${
                    selectedTopic === 'overview'
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5" />
                    <span>Overview</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>

                {SECURITY_ARTICLES.map((article) => {
                  const Icon = article.icon;
                  return (
                    <button
                      key={article.id}
                      onClick={() => setSelectedTopic(article.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center justify-between ${
                        selectedTopic === article.id
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${selectedTopic === article.id ? 'text-white' : article.color}`} />
                        <span className="text-sm">{article.title}</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="md:col-span-2">
            <div className="bg-gray-800 rounded-lg p-6">
              {selectedTopic === 'overview' && <OverviewContent />}
              {selectedTopic === 'seed-phrase' && <SeedPhraseContent />}
              {selectedTopic === 'phishing' && <PhishingContent />}
              {selectedTopic === 'social-engineering' && <SocialEngineeringContent />}
              {selectedTopic === 'hardware-wallets' && <HardwareWalletsContent />}
              {selectedTopic === 'passwords' && <PasswordsContent />}
              {selectedTopic === 'network-security' && <NetworkSecurityContent />}
              {selectedTopic === 'best-practices' && <BestPracticesContent />}
              {selectedTopic === 'red-flags' && <RedFlagsContent />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CONTENT SECTIONS
// ============================================

function OverviewContent() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Shield className="w-7 h-7 text-blue-500" />
          Welcome to Security Education
        </h2>
        <p className="text-gray-300 leading-relaxed">
          Cryptocurrency security is YOUR responsibility. Unlike traditional banks, 
          there's no customer support to reverse fraudulent transactions or recover 
          lost funds. This education center will teach you how to protect yourself.
        </p>
      </div>

      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <h3 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Critical Security Facts
        </h3>
        <ul className="space-y-2 text-sm text-red-200">
          <li>• Your seed phrase = complete access to ALL your funds</li>
          <li>• Crypto transactions are irreversible - you can't dispute or reverse them</li>
          <li>• No one legitimate will EVER ask for your seed phrase or private keys</li>
          <li>• You are your own bank - no one can help if you lose your keys</li>
          <li>• Scammers are sophisticated and constantly evolving their tactics</li>
        </ul>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
          <h4 className="font-semibold text-green-400 mb-2 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            You're Safe If...
          </h4>
          <ul className="text-sm text-green-200 space-y-1">
            <li>✓ Your seed phrase is offline</li>
            <li>✓ You verify URLs before clicking</li>
            <li>✓ You use hardware wallets for large amounts</li>
            <li>✓ You never share private information</li>
            <li>✓ You're skeptical of "too good to be true" offers</li>
          </ul>
        </div>

        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
          <h4 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            You're At Risk If...
          </h4>
          <ul className="text-sm text-red-200 space-y-1">
            <li>✗ Your seed phrase is stored digitally</li>
            <li>✗ You click random links in DMs</li>
            <li>✗ You use public Wi-Fi for transactions</li>
            <li>✗ You share screen during support calls</li>
            <li>✗ You trust without verifying</li>
          </ul>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <h4 className="font-semibold text-blue-400 mb-2">📚 Start Learning</h4>
        <p className="text-sm text-blue-200">
          Choose a topic from the sidebar to learn about specific security threats 
          and how to protect yourself. We recommend starting with "Seed Phrase Security" 
          and "Phishing & Scams" as they're the most critical.
        </p>
      </div>
    </div>
  );
}

function SeedPhraseContent() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Key className="w-7 h-7 text-red-400" />
          Seed Phrase Security
        </h2>
        <p className="text-gray-300 leading-relaxed mb-4">
          Your seed phrase (also called recovery phrase or mnemonic) is a 12-24 word phrase 
          that gives COMPLETE access to your wallet. Anyone with your seed phrase can steal ALL your funds.
        </p>
      </div>

      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <h3 className="font-semibold text-red-400 mb-3">🚨 NEVER EVER:</h3>
        <ul className="space-y-2 text-sm text-red-200">
          <li className="flex items-start gap-2">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span><strong>Type it on any device</strong> - No cloud storage, no password managers, no phone notes, no screenshots</span>
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span><strong>Share it with anyone</strong> - Not support, not friends, not family, not developers. NO ONE.</span>
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span><strong>Take photos of it</strong> - Your phone can be hacked or backed up to cloud</span>
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span><strong>Email it to yourself</strong> - Email is notoriously insecure</span>
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span><strong>Store it on any internet-connected device</strong> - Computers can be infected with malware</span>
          </li>
        </ul>
      </div>

      <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
        <h3 className="font-semibold text-green-400 mb-3">✅ SAFE STORAGE METHODS:</h3>
        <ul className="space-y-3 text-sm text-green-200">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-1">Metal Backup Plates (BEST)</strong>
              <span className="text-gray-400">Engrave or stamp your seed phrase onto metal plates. Fireproof, waterproof, and indestructible.</span>
              <p className="text-xs text-gray-500 mt-1">Recommended: Cryptosteel, Billfodl, or DIY with metal stamps</p>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-1">Paper (Multiple Copies)</strong>
              <span className="text-gray-400">Write on acid-free paper, laminate, and store in waterproof bags. Keep 2-3 copies in separate secure locations.</span>
              <p className="text-xs text-gray-500 mt-1">Store in: fireproof safe, bank safety deposit box, trusted family member's safe</p>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-1">Split Storage (Advanced)</strong>
              <span className="text-gray-400">Use Shamir's Secret Sharing to split your seed into multiple parts. Requires N of M parts to recover.</span>
              <p className="text-xs text-gray-500 mt-1">Example: Split into 5 parts, require any 3 to recover</p>
            </div>
          </li>
        </ul>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-400 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Common Mistakes
        </h3>
        <ul className="space-y-2 text-sm text-yellow-200">
          <li>• Storing in Google Docs / iCloud Notes / Evernote (HACKABLE)</li>
          <li>• "Hiding" in a file named something else (still on your computer)</li>
          <li>• Texting/emailing it to yourself (insecure channels)</li>
          <li>• Keeping only one copy (what if it's destroyed?)</li>
          <li>• Writing it down and leaving it in plain sight</li>
        </ul>
      </div>

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <h3 className="font-semibold text-blue-400 mb-2">💡 Pro Tips</h3>
        <ul className="space-y-2 text-sm text-blue-200">
          <li>• Test your backup by recovering your wallet before storing large amounts</li>
          <li>• Use a hardware wallet for additional security (they store your seed phrase offline)</li>
          <li>• Consider using a passphrase (25th word) for extra protection</li>
          <li>• Never store your seed phrase in the same location as your wallet password</li>
          <li>• Plan for inheritance - your heirs need access if something happens to you</li>
        </ul>
      </div>
    </div>
  );
}

function PhishingContent() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-7 h-7 text-yellow-400" />
          Phishing & Scams
        </h2>
        <p className="text-gray-300 leading-relaxed">
          Phishing is when attackers impersonate legitimate services to steal your credentials, 
          seed phrases, or trick you into approving malicious transactions.
        </p>
      </div>

      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <h3 className="font-semibold text-red-400 mb-3">🎣 Common Phishing Tactics</h3>
        <div className="space-y-3 text-sm text-red-200">
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">Fake Websites</strong>
            <p className="text-gray-400">Attackers create websites that look identical to real ones but with slightly different URLs.</p>
            <p className="text-xs text-red-300 mt-1">Example: metamask.io → metamαsk.io (α is a Greek letter)</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">Discord/Telegram Scams</strong>
            <p className="text-gray-400">Fake "support" accounts DM you claiming there's a problem with your wallet.</p>
            <p className="text-xs text-red-300 mt-1">They'll ask you to "validate" or "resync" your wallet by entering your seed phrase</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">Email Phishing</strong>
            <p className="text-gray-400">Fake emails from "exchanges" or "wallets" saying you need to verify your account.</p>
            <p className="text-xs text-red-300 mt-1">Links go to fake login pages that steal your credentials</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">Malicious Smart Contracts</strong>
            <p className="text-gray-400">You approve a token transaction but it's actually draining your entire wallet.</p>
            <p className="text-xs text-red-300 mt-1">Always verify what you're signing in your wallet before approving</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">"Free Money" Scams</strong>
            <p className="text-gray-400">Airdrops, giveaways, or "you won X tokens!" messages that require you to connect your wallet.</p>
            <p className="text-xs text-red-300 mt-1">The connection drains your funds via malicious approval</p>
          </div>
        </div>
      </div>

      <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
        <h3 className="font-semibold text-green-400 mb-3">🛡️ How to Protect Yourself</h3>
        <ul className="space-y-2 text-sm text-green-200">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Bookmark legitimate sites</strong> - Always use your bookmarks, never click links from emails/DMs
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Verify URLs character by character</strong> - Look for typos, different TLDs (.com vs .co), or special characters
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Use hardware wallets for approvals</strong> - Physical confirmation adds another layer of security
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Never enter seed phrase on any website</strong> - Legitimate apps NEVER ask for your seed phrase
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Ignore all DMs claiming to be support</strong> - Real support uses official channels only
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Read transaction details before signing</strong> - Understand what you're approving
            </div>
          </li>
        </ul>
      </div>

      <div className="bg-orange-500/10 border border-orange-500 rounded-lg p-4">
        <h3 className="font-semibold text-orange-400 mb-2">🚩 Red Flags - It's a Scam If:</h3>
        <ul className="space-y-1 text-sm text-orange-200">
          <li>• They DM you first (official support never DMs first)</li>
          <li>• They ask for your seed phrase, private keys, or password</li>
          <li>• They create urgency ("Act now or lose access!")</li>
          <li>• The URL has typos or looks slightly off</li>
          <li>• They offer guaranteed returns or "free money"</li>
          <li>• They ask you to send crypto to "verify" or "unlock" funds</li>
          <li>• The email/message has poor grammar or looks unprofessional</li>
        </ul>
      </div>

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <h3 className="font-semibold text-blue-400 mb-2">💡 Real World Examples</h3>
        <div className="space-y-2 text-sm text-blue-200">
          <p><strong>Example 1:</strong> You get a Discord DM from "MetaMask Support" saying your account was flagged. They send a link to "verify". ❌ SCAM - MetaMask doesn't DM users.</p>
          <p><strong>Example 2:</strong> An email from "coinbase-security.com" says suspicious activity detected. ❌ SCAM - Real Coinbase is coinbase.com.</p>
          <p><strong>Example 3:</strong> A tweet says "Claim your airdrop!" with a link. You connect wallet and it asks to "approve". ❌ SCAM - It's draining approval.</p>
        </div>
      </div>

      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="font-semibold mb-2">📚 Useful Resources</h3>
        <ul className="space-y-2 text-sm text-gray-300">
          <li className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            <a href="https://www.phishing.org/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              Phishing.org - Learn about phishing
            </a>
          </li>
          <li className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            <a href="https://etherscan.io/address-checker" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              Etherscan Address Checker - Verify Ethereum addresses
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

function SocialEngineeringContent() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Users className="w-7 h-7 text-orange-400" />
          Social Engineering
        </h2>
        <p className="text-gray-300 leading-relaxed">
          Social engineering is psychological manipulation to trick you into revealing 
          confidential information or performing actions that compromise security.
        </p>
      </div>

      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <h3 className="font-semibold text-red-400 mb-3">🎭 Common Tactics</h3>
        <div className="space-y-3 text-sm text-red-200">
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">1. Authority Impersonation</strong>
            <p className="text-gray-400">Scammers pretend to be from support, government, or law enforcement.</p>
            <p className="text-xs text-red-300 mt-1">"This is the IRS. Your crypto assets are frozen. Verify your wallet now."</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">2. Urgency/Fear</strong>
            <p className="text-gray-400">Creating panic so you act without thinking.</p>
            <p className="text-xs text-red-300 mt-1">"Your wallet will be locked in 1 hour! Click here immediately!"</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">3. Reciprocity</strong>
            <p className="text-gray-400">Giving you something "free" to make you feel obligated.</p>
            <p className="text-xs text-red-300 mt-1">"We airdropped 100 tokens to you! Connect your wallet to claim."</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">4. Social Proof</strong>
            <p className="text-gray-400">Fake testimonials or "thousands of users" to make it seem legitimate.</p>
            <p className="text-xs text-red-300 mt-1">"10,000+ users already claimed! Don't miss out!"</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">5. Romance Scams</strong>
            <p className="text-gray-400">Building fake relationships to eventually ask for crypto.</p>
            <p className="text-xs text-red-300 mt-1">Weeks of chatting, then "I need help with this investment..."</p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <strong className="block mb-1">6. Job Offers</strong>
            <p className="text-gray-400">Fake job postings that require you to send crypto or share wallet info.</p>
            <p className="text-xs text-red-300 mt-1">"Test our platform by sending 0.1 ETH to this address..."</p>
          </div>
        </div>
      </div>

      <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
        <h3 className="font-semibold text-green-400 mb-3">🛡️ Defense Strategies</h3>
        <ul className="space-y-2 text-sm text-green-200">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Slow down and think</strong> - Urgency is a manipulation tactic. Take time to verify.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Verify independently</strong> - Don't use contact info they provide. Look it up yourself.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Question authority</strong> - Real support won't mind if you verify their identity first.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Be skeptical of "too good to be true"</strong> - If it sounds amazing, it's probably a scam.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Never screen share with strangers</strong> - They can see everything on your screen.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Talk to trusted friends/family</strong> - Get a second opinion before making decisions.
            </div>
          </li>
        </ul>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-400 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Real World Scenarios
        </h3>
        <div className="space-y-3 text-sm text-yellow-200">
          <div>
            <strong>Scenario 1: The "Support" Call</strong>
            <p className="text-gray-400 mt-1">Someone calls claiming to be from your wallet provider. They say your account is compromised and need you to "verify" by sharing your screen or seed phrase.</p>
            <p className="text-green-300 mt-1">✅ <strong>Response:</strong> Hang up. Real support never calls you and never asks for sensitive info.</p>
          </div>
          <div>
            <strong>Scenario 2: The Discord "Admin"</strong>
            <p className="text-gray-400 mt-1">An admin-looking profile DMs you saying you won a giveaway. They ask you to send 0.1 ETH for "gas fees" to claim your prize.</p>
            <p className="text-green-300 mt-1">✅ <strong>Response:</strong> Check if DMs are from real admins. Real giveaways never ask for payment.</p>
          </div>
          <div>
            <strong>Scenario 3: The Investment Guru</strong>
            <p className="text-gray-400 mt-1">Someone on Twitter shares "amazing returns" and offers to manage your crypto for guaranteed 50% monthly returns.</p>
            <p className="text-green-300 mt-1">✅ <strong>Response:</strong> Walk away. Guaranteed returns don't exist. It's likely a Ponzi scheme.</p>
          </div>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <h3 className="font-semibold text-blue-400 mb-2">💡 Remember</h3>
        <ul className="space-y-1 text-sm text-blue-200">
          <li>• Scammers are professionals - don't feel bad if you almost fell for it</li>
          <li>• Trust your gut - if something feels off, it probably is</li>
          <li>• It's okay to say no - real opportunities will still be there tomorrow</li>
          <li>• Ask questions - legitimate people won't mind answering</li>
          <li>• Report scams - help protect others by reporting to the platform</li>
        </ul>
      </div>
    </div>
  );
}

function HardwareWalletsContent() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <HardDrive className="w-7 h-7 text-blue-400" />
          Hardware Wallets
        </h2>
        <p className="text-gray-300 leading-relaxed">
          Hardware wallets are physical devices that store your private keys offline, 
          providing the highest level of security for your crypto assets.
        </p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <h3 className="font-semibold text-blue-400 mb-3">🔐 Why Hardware Wallets?</h3>
        <ul className="space-y-2 text-sm text-blue-200">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-400" />
            <div>
              <strong>Private keys never leave the device</strong> - Even if your computer is infected with malware, your keys are safe
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-400" />
            <div>
              <strong>Physical confirmation required</strong> - You must press a button on the device to approve transactions
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-400" />
            <div>
              <strong>Protection from phishing</strong> - You can verify transaction details on the device screen
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-400" />
            <div>
              <strong>PIN protection</strong> - Device is useless if stolen (wipes after wrong PIN attempts)
            </div>
          </li>
        </ul>
      </div>

      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="font-semibold mb-4">🏆 Recommended Hardware Wallets</h3>
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-lg">Ledger Nano X / S Plus</h4>
                <p className="text-sm text-gray-400">Most popular • Bluetooth (X only) • Large ecosystem</p>
              </div>
              <span className="text-blue-400 font-semibold">$79-$149</span>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              French company, excellent build quality, supports 5,500+ coins and tokens. 
              Ledger Live app makes it easy for beginners.
            </p>
            <div className="flex gap-2 text-xs">
              <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded">Beginner Friendly</span>
              <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">Mobile Support</span>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-lg">Trezor Model T / One</h4>
                <p className="text-sm text-gray-400">Open source • Touchscreen (T) • Privacy focused</p>
              </div>
              <span className="text-blue-400 font-semibold">$69-$219</span>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              Czech company, fully open-source firmware, great for Bitcoin maximalists. 
              Model T has touchscreen, One uses buttons.
            </p>
            <div className="flex gap-2 text-xs">
              <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded">Open Source</span>
              <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded">Bitcoin Focused</span>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-lg">BitBox02</h4>
                <p className="text-sm text-gray-400">Swiss made • Minimalist • Bitcoin-only option</p>
              </div>
              <span className="text-blue-400 font-semibold">$149</span>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              Swiss company, excellent security practices, simple and easy to use. 
              Available in Bitcoin-only and Multi-coin versions.
            </p>
            <div className="flex gap-2 text-xs">
              <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded">Swiss Security</span>
              <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded">Simple UX</span>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-lg">Coldcard Mk4</h4>
                <p className="text-sm text-gray-400">Bitcoin-only • Air-gapped • Advanced features</p>
              </div>
              <span className="text-blue-400 font-semibold">$147</span>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              Bitcoin-only wallet for advanced users. Can operate completely air-gapped (no USB connection). 
              MicroSD card and QR code support.
            </p>
            <div className="flex gap-2 text-xs">
              <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded">Bitcoin Only</span>
              <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded">Advanced</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-400 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Hardware Wallet Best Practices
        </h3>
        <ul className="space-y-2 text-sm text-yellow-200">
          <li className="flex items-start gap-2">
            <span className="font-bold">1.</span>
            <span><strong>Only buy from official sources</strong> - Never buy from Amazon, eBay, or third parties. Order from the manufacturer's website.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">2.</span>
            <span><strong>Check for tampering</strong> - Inspect packaging and device for signs of tampering when it arrives.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">3.</span>
            <span><strong>Generate your own seed phrase</strong> - Never use a pre-generated seed phrase. The device should generate it.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">4.</span>
            <span><strong>Write down seed phrase offline</strong> - Don't take photos or type it anywhere.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">5.</span>
            <span><strong>Test recovery before funding</strong> - Wipe device and recover from seed to ensure your backup works.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">6.</span>
            <span><strong>Keep firmware updated</strong> - Manufacturers release security updates regularly.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">7.</span>
            <span><strong>Use a passphrase (25th word)</strong> - Adds another layer of protection against physical theft.</span>
          </li>
        </ul>
      </div>

      <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
        <h3 className="font-semibold text-green-400 mb-2">💡 When Should You Use a Hardware Wallet?</h3>
        <ul className="space-y-1 text-sm text-green-200">
          <li>✅ Holding more than $1,000 in crypto</li>
          <li>✅ Long-term storage (HODLing)</li>
          <li>✅ Storing significant portion of your net worth</li>
          <li>✅ Interacting with DeFi protocols (protect from malicious contracts)</li>
          <li>✅ You're not tech-savvy but want maximum security</li>
        </ul>
      </div>

      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <h3 className="font-semibold text-red-400 mb-2">❌ Common Misconceptions</h3>
        <ul className="space-y-1 text-sm text-red-200">
          <li>• "Hardware wallets are unhackable" - They're very secure but not 100% invincible</li>
          <li>• "I can't lose funds if I have a hardware wallet" - You can still sign malicious transactions</li>
          <li>• "I don't need to backup my seed phrase" - Device can fail, get lost, or stolen</li>
          <li>• "Cheaper = same security" - Quality and security testing varies significantly</li>
        </ul>
      </div>
    </div>
  );
}

function PasswordsContent() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Lock className="w-7 h-7 text-green-400" />
          Password Security
        </h2>
        <p className="text-gray-300 leading-relaxed">
          Strong passwords protect your accounts from unauthorized access. In crypto, 
          a compromised password can mean permanent loss of funds.
        </p>
      </div>

      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <h3 className="font-semibold text-red-400 mb-3">❌ Weak Password Examples (NEVER USE)</h3>
        <div className="grid md:grid-cols-2 gap-3 text-sm text-red-200">
          <div className="bg-red-500/10 rounded p-2 font-mono">
            password123 ❌
          </div>
          <div className="bg-red-500/10 rounded p-2 font-mono">
            qwerty123 ❌
          </div>
          <div className="bg-red-500/10 rounded p-2 font-mono">
            JohnSmith1985 ❌
          </div>
          <div className="bg-red-500/10 rounded p-2 font-mono">
            crypto2024 ❌
          </div>
          <div className="bg-red-500/10 rounded p-2 font-mono">
            password ❌
          </div>
          <div className="bg-red-500/10 rounded p-2 font-mono">
            123456789 ❌
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          These can be cracked in seconds with modern tools. Never use dictionary words, 
          personal info, or simple patterns.
        </p>
      </div>

      <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
        <h3 className="font-semibold text-green-400 mb-3">✅ Strong Password Characteristics</h3>
        <ul className="space-y-2 text-sm text-green-200">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>At least 16 characters</strong> - Longer is exponentially harder to crack
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Mix of uppercase and lowercase</strong> - aA vs aa increases complexity
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Include numbers and symbols</strong> - !@#$%^&*()_+-={}[]|;:,.<>?
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Completely random or passphrase</strong> - No personal information or dictionary words
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Unique for each account</strong> - Never reuse passwords across services
            </div>
          </li>
        </ul>

        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-green-400">Good Example (Random):</p>
          <div className="bg-green-500/10 rounded p-2 font-mono text-sm">
            K8$mN#vP2qL!xR9wZ5@tJ
          </div>
          
          <p className="text-sm font-semibold text-green-400 mt-3">Good Example (Passphrase):</p>
          <div className="bg-green-500/10 rounded p-2 font-mono text-sm">
            Correct-Horse-Battery-Staple-7391!
          </div>
          <p className="text-xs text-gray-400">
            Passphrase method: 4+ random words + numbers + symbols. Easy to remember, hard to crack.
          </p>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <h3 className="font-semibold text-blue-400 mb-3">🔐 Password Managers (HIGHLY RECOMMENDED)</h3>
        <p className="text-sm text-blue-200 mb-3">
          Password managers generate and store strong, unique passwords for all your accounts. 
          You only need to remember one master password.
        </p>
        
        <div className="space-y-3">
          <div className="bg-gray-800 rounded p-3">
            <h4 className="font-semibold mb-1">1Password</h4>
            <p className="text-xs text-gray-400">Premium option • Family plans • Excellent UX</p>
            <p className="text-xs text-blue-300 mt-1">$2.99-7.99/month • bitwarden.com</p>
          </div>
          
          <div className="bg-gray-800 rounded p-3">
            <h4 className="font-semibold mb-1">Bitwarden</h4>
            <p className="text-xs text-gray-400">Open source • Free tier available • Self-hostable</p>
            <p className="text-xs text-blue-300 mt-1">Free or $10/year • bitwarden.com</p>
          </div>
          
          <div className="bg-gray-800 rounded p-3">
            <h4 className="font-semibold mb-1">KeePassXC</h4>
            <p className="text-xs text-gray-400">Completely offline • No cloud • Maximum privacy</p>
            <p className="text-xs text-blue-300 mt-1">Free • Open source • keepassxc.org</p>
          </div>
        </div>
      </div>

      <div className="bg-purple-500/10 border border-purple-500 rounded-lg p-4">
        <h3 className="font-semibold text-purple-400 mb-3">🔑 Two-Factor Authentication (2FA)</h3>
        <p className="text-sm text-purple-200 mb-3">
          Add a second layer of security beyond your password. Even if your password is compromised, 
          attackers can't access your account without the 2FA code.
        </p>
        
        <div className="space-y-2 text-sm text-purple-200">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-400" />
            <div>
              <strong>Authenticator Apps (BEST)</strong> - Google Authenticator, Authy, or 2FAS. Time-based codes that change every 30 seconds.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-400" />
            <div>
              <strong>Hardware Keys (MOST SECURE)</strong> - YubiKey, Titan Security Key. Physical USB/NFC devices you must have to login.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
            <div>
              <strong>SMS (AVOID IF POSSIBLE)</strong> - Phone numbers can be hijacked via SIM swapping. Use only if no other option.
            </div>
          </div>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 mt-3">
          <p className="text-xs text-yellow-200">
            ⚠️ <strong>CRITICAL:</strong> Save your 2FA backup codes in a safe place (not on your computer). 
            If you lose your 2FA device, you may lose access to your account permanently.
          </p>
        </div>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-400 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Common Password Mistakes
        </h3>
        <ul className="space-y-1 text-sm text-yellow-200">
          <li>• Using the same password for multiple accounts (one breach = all compromised)</li>
          <li>• Storing passwords in browser without master password</li>
          <li>• Writing passwords in plain text files on your computer</li>
          <li>• Sharing passwords via email, text, or messaging apps</li>
          <li>• Using personal info (birthdate, pet names, address)</li>
          <li>• Never changing passwords (rotate important passwords annually)</li>
        </ul>
      </div>

      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="font-semibold mb-2">💡 Pro Tips</h3>
        <ul className="space-y-1 text-sm text-gray-300">
          <li>• Use a different email for crypto accounts vs social media</li>
          <li>• Create a super-strong master password for your password manager</li>
          <li>• Enable 2FA on all crypto exchanges and wallets that support it</li>
          <li>• Check if your passwords were leaked: <a href="https://haveibeenpwned.com" target="_blank" className="text-blue-400 underline">haveibeenpwned.com</a></li>
          <li>• For critical accounts, change passwords every 6-12 months</li>
        </ul>
      </div>
    </div>
  );
}

// Placeholder functions for remaining content
function NetworkSecurityContent() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Network Security</h2>
      <p className="text-gray-300">Content about network security, VPNs, and public Wi-Fi protection coming soon...</p>
    </div>
  );
}

function BestPracticesContent() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Best Practices</h2>
      <p className="text-gray-300">Daily security habits and best practices coming soon...</p>
    </div>
  );
}

function RedFlagsContent() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Red Flags</h2>
      <p className="text-gray-300">Warning signs and red flags to watch out for coming soon...</p>
    </div>
  );
}
