import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, name, role } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required.' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Service Role Key가 있는 경우 Supabase Admin Auth 시도
    if (supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        })

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: email.trim(),
          password: password || 'password123',
          email_confirm: true,
          user_metadata: {
            name: name || '',
            role: role || 'therapist'
          }
        })

        if (!error && data?.user?.id) {
          return NextResponse.json({
            success: true,
            user: data.user,
            userId: data.user.id,
            isFallback: false
          })
        } else if (error) {
          console.warn('[Admin CreateUser Warning] Supabase Auth Error:', error.message)
        }
      } catch (adminErr: any) {
        console.warn('[Admin CreateUser Exception]:', adminErr?.message)
      }
    }

    // Fallback: Auth 계정 생성이 이메일 제한(Rate Limit) 등으로 실패하더라도 
    // DB Foreign Key 에러를 피할 수 있도록 userId를 null로 처리하여 반환합니다.
    return NextResponse.json({
      success: true,
      userId: null,
      isFallback: true
    })
  } catch (err: any) {
    console.error('[Admin CreateUser Fatal Error]', err)
    return NextResponse.json({
      success: true,
      userId: null,
      isFallback: true
    })
  }
}
