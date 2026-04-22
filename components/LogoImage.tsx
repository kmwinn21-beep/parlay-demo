'use client';
import { useLogoConfig } from '@/lib/useLogoConfig';

interface Props {
  variant: 'white' | 'dark' | 'sidebar';
  width?: number;
  height?: number;
  className?: string;
  alt?: string;
}

export function LogoImage({ variant, width = 160, height = 48, className = 'object-contain', alt = 'Logo' }: Props) {
  const { logoWhiteUrl, logoDarkUrl, logoSidebarUrl } = useLogoConfig();
  const src = variant === 'sidebar'
    ? (logoSidebarUrl || logoWhiteUrl)
    : variant === 'white' ? logoWhiteUrl : logoDarkUrl;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} className={className} />;
}
