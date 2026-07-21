import { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDateString } from './dateUtils'

/**
 * 마사지사 요일별 우선순위(therapist_priorities) 마스터 데이터를 기반으로
 * 오늘부터 4주간(28일간)의 근무일정을 생성하되,
 * [중요] 이미 생성되어 있는 기존 일자는 절대로 덮어쓰지 않고(보존),
 * 아직 생성되지 않은 신규 날짜에 대해서만 마스터 기준 일정을 자동 생성합니다.
 */
export async function sync4WeeksScheduleFromPriorities(
  supabase: SupabaseClient,
  startDate?: Date
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // 1. 모든 마사지사 로드
    const { data: therapists, error: thErr } = await supabase
      .from('therapists')
      .select('id')
      .eq('is_active', true)

    if (thErr) throw thErr
    if (!therapists || therapists.length === 0) {
      return { success: true, count: 0 }
    }

    // 2. 마사지사 우선순위 마스터 데이터 로드
    const { data: priorities, error: pErr } = await supabase
      .from('therapist_priorities')
      .select('therapist_id, day_of_week, priority_val')

    if (pErr) throw pErr

    // Map 구조로 보관: `${therapist_id}_${day_of_week}` -> priority_val
    const priorityMap = new Map<string, string>()
    if (priorities) {
      priorities.forEach((p: any) => {
        priorityMap.set(`${p.therapist_id}_${p.day_of_week}`, p.priority_val)
      })
    }

    // 3. 오늘부터 28일 범위 내 이미 존재하는 therapist_schedule 조회하여 기존 수정 내역 보호
    const baseDate = startDate ? new Date(startDate) : new Date()
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 27)

    const baseDateStr = toLocalDateString(baseDate)
    const endDateStr = toLocalDateString(endDate)

    const { data: existingSchedules, error: sErr } = await supabase
      .from('therapist_schedule')
      .select('therapist_id, date')
      .gte('date', baseDateStr)
      .lte('date', endDateStr)

    if (sErr) throw sErr

    // 이미 등록된 레코드 집합 (therapist_id_date)
    const existingSet = new Set<string>()
    if (existingSchedules) {
      existingSchedules.forEach((s: any) => {
        existingSet.add(`${s.therapist_id}_${s.date}`)
      })
    }

    // 4. 레코드가 존재하지 않는 신규 날짜에만 마스터 기준 생성 레코드 추가
    const recordsToInsert: { therapist_id: number; date: string; availability_type: 'full' | 'off' }[] = []

    for (let i = 0; i < 28; i++) {
      const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + i)
      const dateStr = toLocalDateString(targetDate)

      // JavaScript getDay(): 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
      // DB day_of_week: 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri, 5: Sat, 6: Sun
      const jsDay = targetDate.getDay()
      const dbDayOfWeek = jsDay === 0 ? 6 : jsDay - 1

      therapists.forEach((t: any) => {
        const key = `${t.id}_${dateStr}`
        // 이미 기 생성된 일정이 있다면 건드리지 않고 스킵 (기존 개별 변경 내역 보존)
        if (existingSet.has(key)) {
          return
        }

        const priorityVal = priorityMap.get(`${t.id}_${dbDayOfWeek}`)
        const isOff = !priorityVal || priorityVal.toLowerCase() === 'x'

        recordsToInsert.push({
          therapist_id: t.id,
          date: dateStr,
          availability_type: isOff ? 'off' : 'full'
        })
      })
    }

    // 5. 신규 날짜 레코드만 insert (ignoreDuplicates: true)
    if (recordsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('therapist_schedule')
        .upsert(recordsToInsert, { onConflict: 'therapist_id,date', ignoreDuplicates: true })

      if (insertErr) throw insertErr
    }

    return { success: true, count: recordsToInsert.length }
  } catch (err: any) {
    console.error('Failed to sync 4-weeks schedule from priorities:', err)
    return { success: false, count: 0, error: err.message || 'Error syncing schedule' }
  }
}

/**
 * [4주 뒤 일주일치 전용 생성]
 * 이번 주 월요일 기준 4주 뒤 월요일 ~ 일요일(7일간)의 근무일정을
 * 마스터 데이터(therapist_priorities) 기준으로 신규 생성합니다. (기존 데이터 보존)
 */
export async function generate4thWeekScheduleFromPriorities(
  supabase: SupabaseClient
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { data: therapists, error: thErr } = await supabase
      .from('therapists')
      .select('id')
      .eq('is_active', true)

    if (thErr) throw thErr
    if (!therapists || therapists.length === 0) return { success: true, count: 0 }

    const { data: priorities, error: pErr } = await supabase
      .from('therapist_priorities')
      .select('therapist_id, day_of_week, priority_val')

    if (pErr) throw pErr

    const priorityMap = new Map<string, string>()
    if (priorities) {
      priorities.forEach((p: any) => {
        priorityMap.set(`${p.therapist_id}_${p.day_of_week}`, p.priority_val)
      })
    }

    // 이번 주 월요일 계산
    const now = new Date()
    const jsDay = now.getDay()
    const diffToMon = jsDay === 0 ? -6 : 1 - jsDay
    const currMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon)

    // 4주 뒤 월요일 (+28일) 및 일요일 (+34일)
    const targetMon = new Date(currMon.getFullYear(), currMon.getMonth(), currMon.getDate() + 28)
    const targetSun = new Date(currMon.getFullYear(), currMon.getMonth(), currMon.getDate() + 34)

    const targetMonStr = toLocalDateString(targetMon)
    const targetSunStr = toLocalDateString(targetSun)

    // 이미 존재하는 레코드 확인
    const { data: existingSchedules, error: sErr } = await supabase
      .from('therapist_schedule')
      .select('therapist_id, date')
      .gte('date', targetMonStr)
      .lte('date', targetSunStr)

    if (sErr) throw sErr

    const existingSet = new Set<string>()
    if (existingSchedules) {
      existingSchedules.forEach((s: any) => {
        existingSet.add(`${s.therapist_id}_${s.date}`)
      })
    }

    const recordsToInsert: { therapist_id: number; date: string; availability_type: 'full' | 'off' }[] = []

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(targetMon.getFullYear(), targetMon.getMonth(), targetMon.getDate() + i)
      const dateStr = toLocalDateString(targetDate)
      const dayIdx = i // 0: 월 ~ 6: 일

      therapists.forEach((t: any) => {
        const key = `${t.id}_${dateStr}`
        if (existingSet.has(key)) return

        const priorityVal = priorityMap.get(`${t.id}_${dayIdx}`)
        const isOff = !priorityVal || priorityVal.toLowerCase() === 'x'

        recordsToInsert.push({
          therapist_id: t.id,
          date: dateStr,
          availability_type: isOff ? 'off' : 'full'
        })
      })
    }

    if (recordsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('therapist_schedule')
        .upsert(recordsToInsert, { onConflict: 'therapist_id,date', ignoreDuplicates: true })

      if (insertErr) throw insertErr
    }

    return { success: true, count: recordsToInsert.length }
  } catch (err: any) {
    console.error('Failed to generate 4th week schedule:', err)
    return { success: false, count: 0, error: err.message || 'Error generating 4th week schedule' }
  }
}
