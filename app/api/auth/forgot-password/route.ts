import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Simple in-module rate limit: max 3 requests per 15 minutes per IP
const forgotPasswordAttempts = new Map<string, { count: number; resetAt: number }>()

function checkForgotPasswordRateLimit(ip: string): boolean {
  const now = Date.now()
  const window = 15 * 60 * 1000 // 15 minutes
  const entry = forgotPasswordAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    forgotPasswordAttempts.set(ip, { count: 1, resetAt: now + window })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  if (!checkForgotPasswordRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Intenta en 15 minutos.' },
      { status: 429 }
    )
  }

  let email: string
  try {
    const body = await request.json()
    email = body.email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Email invalido' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Request invalido' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?type=recovery`,
  })

  if (error) {
    console.error('[forgot-password] error:', error.message)
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({ success: true })
}
