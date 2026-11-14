/**
 * Next.js API route: /api/sky
 *
 * This file is intentionally kept in the repo for local development.
 * With output: 'export', Next.js excludes all /api routes from the static
 * build — this file is never compiled into out/.
 *
 * In production on Vercel (non-static deploy), api/sky.py handles requests.
 * Locally, this route proxies to scripts/sky_service.py via child_process.
 *
 * NEXT_PUBLIC_LIVE_SEARCH=1 must be set to surface the live search UI.
 */

import { NextRequest, NextResponse } from 'next/server'

// Acknowledge static export — this route is excluded from out/.
// In local dev it proxies to scripts/sky_service.py via child_process.
// On a Vercel serverless deploy (non-static), api/sky.py handles requests.
export const dynamic = 'force-static'

async function callPythonScript(params: Record<string, unknown>): Promise<unknown> {
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const { join } = await import('path')

  const execAsync = promisify(exec)
  const scriptPath = join(process.cwd(), 'scripts', 'sky_service.py')
  const paramsJson = JSON.stringify(params)
  const escapedJson = paramsJson.replace(/'/g, "'\\''")

  const { stdout } = await execAsync(
    `python3 "${scriptPath}" '${escapedJson}'`,
    {
      timeout: 50000,
      env: {
        ...process.env,
        PATH: `/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        HOME: '/home/ubuntu',
        PYTHONUSERBASE: '/home/ubuntu/.local',
        ASTROPY_CACHE_DIR: '/tmp/astropy',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    }
  )
  return JSON.parse(stdout)
}

export async function GET(request: NextRequest) {
  return handleRequest(request)
}

export async function POST(request: NextRequest) {
  return handleRequest(request)
}

async function handleRequest(request: NextRequest) {
  let params: Record<string, unknown>

  if (request.method === 'POST') {
    try {
      params = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  } else {
    const sp = new URL(request.url).searchParams
    params = Object.fromEntries(sp.entries())
  }

  if (!params.action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 })
  }

  try {
    const result = await callPythonScript(params)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/sky] Error:', message)
    return NextResponse.json(
      { error: 'Sky service unavailable', details: message },
      { status: 503 }
    )
  }
}
