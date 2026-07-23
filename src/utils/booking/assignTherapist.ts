import { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDateString } from './dateUtils'

export interface AssignTherapistParams {
  supabase: SupabaseClient
  startTime: string // ISO 8601 포맷 날짜 스트링 (예: 2026-06-07T12:00:00Z)
  endTime: string   // ISO 8601 포맷 날짜 스트링 (예: 2026-06-07T13:00:00Z)
  price: number
  therapistId?: number // 수동 지정 시 전달
  excludeReservationId?: number // 수정 시 본인 예약 제외용
  category?: 'dry' | 'wet' | 'combo' | string // 서비스 종류 (필터용)
  excludeTherapistIds?: number[] // 콤보 배정 시 겹침 방지용
}

export interface AssignTherapistResult {
  success: boolean
  therapistId?: number
  therapistName?: string
  error?: string
}

/**
 * 새로운 예약 등록 시 마사지 직원을 자동 배정하거나 수동 지정을 확인하는 알고리즘 함수
 */
export async function assignTherapist({
  supabase,
  startTime,
  endTime,
  price,
  therapistId,
  excludeReservationId,
  category,
  excludeTherapistIds = []
}: AssignTherapistParams): Promise<AssignTherapistResult> {
  try {
    // 1. 활성화 상태인 모든 마사지사 목록 조회
    const { data: therapists, error: therapistsError } = await supabase
      .from('therapists')
      .select('id, name, is_premium_target, massage_type')
      .eq('is_active', true)

    if (therapistsError || !therapists) {
      console.error('Therapists fetch error:', therapistsError)
      return { success: false, error: '마사지사 목록을 불러오는 데 실패했습니다.' }
    }

    if (therapists.length === 0) {
      return { success: false, error: '예약 불가: 현재 근무 중(활성 상태)인 마사지사가 없습니다.' }
    }

    // 2. 예약 날짜 및 시/분 추출 (UTC 기준 분 단위 계산 - 브라우저 로컬 시차 오차 배제)
    const startDate = new Date(startTime)
    const endDate = new Date(endTime)
    
    // startTime은 YYYY-MM-DDTHH:mm:00.000Z 형식으로 구성되어 있으므로 안전하게 날짜 직접 분할
    const bookingDateStr = startTime.split('T')[0]

    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes()
    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes()

    // 3. 해당 날짜의 마사지사 근무 일정 조회
    const { data: schedules, error: schedulesError } = await supabase
      .from('therapist_schedule')
      .select('therapist_id, availability_type')
      .eq('date', bookingDateStr)

    if (schedulesError) {
      console.error('Schedules fetch error:', schedulesError)
      return { success: false, error: '마사지사 근무 일정을 불러오는 데 실패했습니다.' }
    }

    const scheduleMap = new Map<number, string>()
    if (schedules) {
      schedules.forEach((s: any) => {
        if (s.availability_type) {
          scheduleMap.set(s.therapist_id, s.availability_type)
        }
      })
    }

    // 4. 활성 마사지사 중 해당 예약 시간대에 근무 가능한 마사지사 필터링
    const activeAndAvailableTherapists = therapists.filter(t => {
      // 콤보 배정 등에서 겹침 방지 제외 대상
      if (excludeTherapistIds.includes(t.id)) {
        return false
      }

      // 서비스 종류에 맞는 마사지사 타입 필터링
      if (category === 'dry') {
        if (t.massage_type !== 'dry' && t.massage_type !== 'both') return false
      } else if (category === 'wet') {
        if (t.massage_type !== 'wet' && t.massage_type !== 'both') return false
      }

      const type = scheduleMap.get(t.id)

      // 'full' (근무): 무조건 근무 가능 (09:00 ~ 24:00)
      if (type === 'full') {
        return true
      }

      // 'am_half' (오전반차): 16:30(990분) 이후 예약만 가능 (오후 근무)
      if (type === 'am_half') {
        return startMinutes >= 990
      }

      // 'pm_half' (오후반차): 16:30(990분) 이전 예약만 가능 (오전 근무)
      if (type === 'pm_half') {
        return endMinutes <= 990
      }

      // 'off' (휴무) 및 미설정(undecided = null): 가용 불가
      return false
    })

    // 전체 요금제 정보 조회 (겹침 세그먼트 분석을 위해 위로 호이스팅)
    const { data: plans, error: plansError } = await supabase
      .from('pricing_plans')
      .select('id, category, weight, massage_weight, bath_weight, duration_minutes, bath_duration_minutes, massage_duration_minutes')

    if (plansError || !plans) {
      console.error('Pricing plans fetch error in assignTherapist:', plansError)
      return { success: false, error: '요금제 정보를 불러오는 데 실패했습니다.' }
    }

    // 5. 예약하려는 시간대(startTime ~ endTime)와 겹치며 확정(confirmed)된 기존 예약 목록 조회 (건식 및 습식 동시 대조)
    let overlappingQuery = supabase
      .from('reservations')
      .select('therapist_id, secondary_therapist_id, start_time, end_time, pricing_plan_id')
      .eq('status', 'confirmed')
      .lt('start_time', endTime)
      .gt('end_time', startTime)

    if (excludeReservationId !== undefined && excludeReservationId !== null) {
      overlappingQuery = overlappingQuery.neq('id', excludeReservationId)
    }

    const { data: overlappingReservations, error: reservationsError } = await overlappingQuery

    if (reservationsError || !overlappingReservations) {
      console.error('Reservations fetch error:', reservationsError)
      return { success: false, error: '기존 예약 내역을 조회하는 데 실패했습니다.' }
    }

    const busyTherapistIds = new Set<number>()
    const testStartMs = new Date(startTime).getTime()
    const testEndMs = new Date(endTime).getTime()

    overlappingReservations.forEach((res: any) => {
      const plan = res.pricing_plan_id ? plans.find(p => p.id === res.pricing_plan_id) : null
      const isCombo = plan?.category === 'combo'

      const resStartMs = new Date(res.start_time).getTime()
      const resEndMs = new Date(res.end_time).getTime()

      if (isCombo && plan) {
        const resBathDur = plan.bath_duration_minutes || 60
        // A. 습식 담당자 겹침 대조: resStartMs ~ resStartMs + bathDur
        const wetStartMs = resStartMs
        const wetEndMs = resStartMs + resBathDur * 60000
        if (wetStartMs < testEndMs && wetEndMs > testStartMs) {
          if (res.secondary_therapist_id) busyTherapistIds.add(Number(res.secondary_therapist_id))
        }

        // B. 건식 담당자 겹침 대조: resStartMs + bathDur + 30 ~ resEndMs
        const dryStartMs = resStartMs + (resBathDur + 30) * 60000
        const dryEndMs = resEndMs
        if (dryStartMs < testEndMs && dryEndMs > testStartMs) {
          if (res.therapist_id) busyTherapistIds.add(Number(res.therapist_id))
        }
      } else {
        // 단일 요금제는 전체 예약 범위 대조
        if (resStartMs < testEndMs && resEndMs > testStartMs) {
          if (res.therapist_id) busyTherapistIds.add(Number(res.therapist_id))
          if (res.secondary_therapist_id) busyTherapistIds.add(Number(res.secondary_therapist_id))
        }
      }
    })

    // 6. 프론트 직원이 마사지사를 수동으로 지정한 경우
    if (therapistId !== undefined && therapistId !== null) {
      const targetTherapist = activeAndAvailableTherapists.find(t => t.id === therapistId)
      
      if (!targetTherapist) {
        const hasTherapist = therapists.find(t => t.id === therapistId)
        if (!hasTherapist) {
          return { success: false, error: '선택하신 마사지사는 현재 비활성화 상태이거나 존재하지 않습니다.' }
        }
        return { success: false, error: '선택하신 마사지사는 해당 날짜/시간대에 근무하지 않습니다 (휴무/반차/미정).' }
      }
      
      if (busyTherapistIds.has(therapistId)) {
        return { success: false, error: '선택하신 마사지사는 해당 시간대에 이미 다른 예약이 있습니다.' }
      }
      
      return {
        success: true,
        therapistId: targetTherapist.id,
        therapistName: targetTherapist.name
      }
    }

    // 7. 마사지사를 지정하지 않은 경우 (자동 배정)
    // 해당 시간대에 비어 있는 근무 가능 마사지사 필터링
    const availableTherapists = activeAndAvailableTherapists.filter(t => !busyTherapistIds.has(t.id))

    // 모든 마사지사가 예약이 가득 찬 경우
    if (availableTherapists.length === 0) {
      return { success: false, error: '예약 불가: 해당 시간대에 배정 가능한 마사지사가 없습니다.' }
    }

    // A. 요일 구하기 (로컬 요일 적용 - 브라우저 로컬 시차 오차 배제): 0(월요일) ~ 6(일요일)
    const jsDay = startDate.getDay()
    const dbDayOfWeek = jsDay === 0 ? 6 : jsDay - 1

    // B. 가용 마사지사들의 일별 포인트 실시간 계산 (가중치 자체 카운트 방식)
    const tzo = -new Date().getTimezoneOffset()
    const dif = tzo >= 0 ? '+' : '-'
    const pad = (num: number) => String(Math.floor(Math.abs(num))).padStart(2, '0')
    const offset = `${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`

    const startOfDay = `${bookingDateStr}T00:00:00${offset}`
    const endOfDay = `${bookingDateStr}T23:59:59${offset}`
    const therapistIds = availableTherapists.map(t => t.id)

    // 해당 날짜의 확정된 전체 예약 목록 조회
    const { data: dayReservations, error: dayResError } = await supabase
      .from('reservations')
      .select('id, therapist_id, secondary_therapist_id, pricing_plan_id, status')
      .eq('status', 'confirmed')
      .gte('start_time', startOfDay)
      .lte('start_time', endOfDay)

    if (dayResError) {
      console.error('Reservations fetch error in assignTherapist points calculation:', dayResError)
    }



    const pointsMap = new Map<number, number>()
    
    // 가용 마사지사들의 ID로 0점 기본값 초기화
    therapistIds.forEach(id => pointsMap.set(id, 0))

    if (dayReservations && plans) {
      dayReservations.forEach((res: any) => {
        const plan = plans.find(p => p.id === res.pricing_plan_id)
        if (!plan) return

        // 콤보 요금제 분기
        if (plan.category === 'combo') {
          if (res.therapist_id && pointsMap.has(res.therapist_id)) {
            const current = pointsMap.get(res.therapist_id) || 0
            pointsMap.set(res.therapist_id, current + (plan.massage_weight || 1.0))
          }
          if (res.secondary_therapist_id && pointsMap.has(res.secondary_therapist_id)) {
            const current = pointsMap.get(res.secondary_therapist_id) || 0
            pointsMap.set(res.secondary_therapist_id, current + (plan.bath_weight || 1.0))
          }
        } else {
          // 단일 요금제 분기
          if (res.therapist_id && pointsMap.has(res.therapist_id)) {
            const current = pointsMap.get(res.therapist_id) || 0
            pointsMap.set(res.therapist_id, current + (plan.weight || 1.0))
          }
        }
      })
    }

    // C. 가용 마사지사들의 요일별 우선순위 조회
    const serviceType = category === 'wet' ? 'wet' : 'dry'
    const { data: priorities, error: prioritiesError } = await supabase
      .from('therapist_priorities')
      .select('therapist_id, priority_val')
      .eq('day_of_week', dbDayOfWeek)
      .eq('service_type', serviceType)
      .in('therapist_id', therapistIds)

    if (prioritiesError) {
      console.error('Priorities fetch error in assignTherapist:', prioritiesError)
    }

    const priorityMap = new Map<number, number>()
    if (priorities) {
      priorities.forEach((p: any) => {
        const val = p.priority_val
        const parsed = parseInt(val, 10)
        if (!isNaN(parsed)) {
          priorityMap.set(p.therapist_id, parsed)
        } else {
          priorityMap.set(p.therapist_id, Infinity)
        }
      })
    }

    // D. 정렬 수행: 1순위 포인트 오름차순(낮은 순), 2순위 우선순위 오름차순(높은 순)
    availableTherapists.sort((a, b) => {
      const ptA = pointsMap.get(a.id) || 0
      const ptB = pointsMap.get(b.id) || 0
      if (ptA !== ptB) {
        return ptA - ptB
      }

      const prA = priorityMap.get(a.id) ?? Infinity
      const prB = priorityMap.get(b.id) ?? Infinity
      return prA - prB
    })

    const selected = availableTherapists[0]
    
    return {
      success: true,
      therapistId: selected.id,
      therapistName: selected.name
    }

  } catch (err) {
    console.error('Unexpected assignTherapist error:', err)
    return { success: false, error: '배정 중 예기치 못한 시스템 오류가 발생했습니다.' }
  }
}
