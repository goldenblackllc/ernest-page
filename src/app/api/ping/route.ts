import { NextResponse } from 'next/server';

// Lightweight 1x1 tracking pixel for static pages (like apply.html)
// that don't appear in Vercel function logs.
// Each request to this endpoint = one page view, visible in Vercel logs.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || 'unknown';

  // Log it (appears in Vercel function logs)
  console.log(`[PAGE VIEW] ${page} — ${new Date().toISOString()}`);

  // Return 1x1 transparent GIF
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  return new NextResponse(pixel, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
