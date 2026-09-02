import { Helmet } from 'react-helmet-async';
import { MarketingPageFrame } from '@/components/marketing/MarketingPageFrame';

export default function CryptoContact() {
  return (
    <MarketingPageFrame>
      <Helmet>
        <title>Contact — BearTec</title>
      </Helmet>
      <h1 className="text-4xl font-semibold tracking-tight">Contact</h1>
      <p className="mt-6 text-zinc-400">
        Email{' '}
        <a className="text-[#00c4b4] hover:underline" href="mailto:beartec@beartec.uk">
          beartec@beartec.uk
        </a>
      </p>
    </MarketingPageFrame>
  );
}
