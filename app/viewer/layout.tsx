import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Viewer',
  description: 'Blink real NASA SPHEREx infrared images of five fast-moving and variable objects, see what changed, and read their spectra.',
}

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  return children
}
