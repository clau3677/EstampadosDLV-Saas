// Server-side layout for /mockup to set canonical tag
// The page.js inside this folder is a client component ('use client')
// and cannot export metadata. This server layout handles that.
export const metadata = {
  alternates: { canonical: 'https://estampadosdlv.com/mockup' },
};

export default function MockupLayout({ children }) {
  return children;
}
