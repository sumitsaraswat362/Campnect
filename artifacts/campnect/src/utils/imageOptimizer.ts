export interface ImageOptimizationOptions {
  width?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg';
}

export function getOptimizedImageUrl(src: string, options: ImageOptimizationOptions = {}): string {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src;
  const { width = 800, quality = 80, format = 'webp' } = options;
  if (src.includes('unsplash.com') || src.includes('cloudinary.com')) {
    const url = new URL(src);
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', String(quality));
    url.searchParams.set('fm', format);
    return url.toString();
  }
  return src;
}

export function generateSrcSet(src: string, widths = [320, 640, 960, 1280]): string {
  if (!src) return '';
  return widths.map((w) => `${getOptimizedImageUrl(src, { width: w })} ${w}w`).join(', ');
}
