import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  // Stateless client to avoid cookie manipulation on the server side during setup
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  })

  try {
    const logs: string[] = []

    // Helper: Register user via signUp
    const getOrCreateUser = async (email: string, pass: string, name: string) => {
      logs.push(`Registering/Checking Auth account: ${email}`)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: { name }
        }
      })

      if (authError) {
        // If user already exists, we will try to find them by mapping or reset password
        logs.push(`Auth signup error/already exists for ${email}: ${authError.message}`)
        
        // Let's attempt to sign in to see if it exists, or just query profiles
        // We will return null if we can't get user, but we will proceed
      }
      
      return authData?.user || null
    }

    // 1. Register Manager
    const mgrUser = await getOrCreateUser('manager@spa.com', '12345!', '관리자(홍길동)')
    if (mgrUser) {
      logs.push(`Manager registered: ${mgrUser.id}`)
      
      // Update DB mapping
      // We check if old manager exists and update references
      const oldMgrId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      // Temporarily set references to NULL
      await supabase.from('reservations').update({ created_by: null }).eq('created_by', oldMgrId)
      await supabase.from('reservation_logs').update({ performed_by: null }).eq('performed_by', oldMgrId)
      
      // Delete old manager profile if exists
      await supabase.from('employee').delete().eq('id', oldMgrId)
      
      // Upsert new manager profile
      const { error: dbErr } = await supabase.from('employee').upsert({
        id: mgrUser.id,
        name: '관리자(홍길동)',
        role: 'manager',
        email: 'manager@spa.com'
      })
      if (dbErr) logs.push(`Error upserting manager profile: ${dbErr.message}`)
      else logs.push(`Manager profile successfully linked.`)
    }

    // 2. Register Staff 1
    const staff1User = await getOrCreateUser('staff1@spa.com', '123456', '직원A(이순신)')
    if (staff1User) {
      logs.push(`Staff 1 registered: ${staff1User.id}`)
      const oldStaff1Id = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12'
      
      // Temporarily set references to NULL
      await supabase.from('reservations').update({ created_by: null }).eq('created_by', oldStaff1Id)
      await supabase.from('reservation_logs').update({ performed_by: null }).eq('performed_by', oldStaff1Id)
      await supabase.from('employee').delete().eq('id', oldStaff1Id)
      
      // Upsert new staff 1
      const { error: dbErr } = await supabase.from('employee').upsert({
        id: staff1User.id,
        name: '직원A(이순신)',
        role: 'staff',
        email: 'staff1@spa.com'
      })
      if (dbErr) logs.push(`Error upserting staff 1 profile: ${dbErr.message}`)
      else {
        logs.push(`Staff 1 profile linked. Re-assigning references to new ID.`)
        await supabase.from('reservations').update({ created_by: staff1User.id }).is('created_by', null)
        await supabase.from('reservation_logs').update({ performed_by: staff1User.id }).is('performed_by', null)
      }
    }

    // 3. Register Staff 2
    const staff2User = await getOrCreateUser('staff2@spa.com', '123456', '직원B(강감찬)')
    if (staff2User) {
      logs.push(`Staff 2 registered: ${staff2User.id}`)
      const oldStaff2Id = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13'
      
      await supabase.from('employee').delete().eq('id', oldStaff2Id)
      
      const { error: dbErr } = await supabase.from('employee').upsert({
        id: staff2User.id,
        name: '직원B(강감찬)',
        role: 'staff',
        email: 'staff2@spa.com'
      })
      if (dbErr) logs.push(`Error upserting staff 2 profile: ${dbErr.message}`)
      else logs.push(`Staff 2 profile linked.`)
    }

    // 4. Register 5 Therapists
    const therapistsList = [
      { id: 1, name: '김테라', email: 'massage1@spa.com' },
      { id: 2, name: '이마사', email: 'massage2@spa.com' },
      { id: 3, name: '박안마', email: 'massage3@spa.com' },
      { id: 4, name: '최힐러', email: 'massage4@spa.com' },
      { id: 5, name: '정케어', email: 'massage5@spa.com' }
    ]

    for (const th of therapistsList) {
      const thUser = await getOrCreateUser(th.email, '123456', th.name)
      if (thUser) {
        logs.push(`Therapist ${th.name} registered: ${thUser.id}`)
        const { error: dbErr } = await supabase
          .from('therapists')
          .update({
            user_id: thUser.id,
            email: th.email,
            is_active: true
          })
          .eq('id', th.id)
        
        if (dbErr) logs.push(`Error updating therapist ${th.name}: ${dbErr.message}`)
        else logs.push(`Therapist ${th.name} profile successfully updated with user_id and email.`)
      }
    }

    // 5. Deactivate therapists 6 to 10
    logs.push('Deactivating therapists 6 to 10...')
    const { error: deacErr } = await supabase
      .from('therapists')
      .update({
        is_active: false,
        user_id: null,
        email: null
      })
      .in('id', [6, 7, 8, 9, 10])
    
    if (deacErr) logs.push(`Error deactivating therapists: ${deacErr.message}`)
    else logs.push('Therapists 6 to 10 deactivated successfully.')

    return NextResponse.json({
      success: true,
      message: '사용자 데이터 및 로그인 계정 셋업 완료',
      logs
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 })
  }
}
