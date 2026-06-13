import { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDateString } from './dateUtils'

export interface AssignTherapistParams {
  supabase: SupabaseClient
  startTime: string // ISO 8601 포맷 날짜 스트링 (예: 2026-06-07T12:00:00Z)
  endTime: string   // ISO 8601 포맷 날짜 스트링 (예: 2026-06-07T13:00:00Z)
  price: number
  therapistId?: number // 수동 지정 시 전달
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
  therapistId
}: AssignTherapistParams): Promise<AssignTherapistResult> {
  try {
    // 1. 활성화 상태인 모든 마사지사 목록 조회
    const { data: therapists, error: therapistsError } = await supabase
      .from('therapists')
      .select('id, name, is_premium_target')
      .eq('is_active', true)

    if (therapistsError || !therapists) {
      console.error('Therapists fetch error:', therapistsError)
      return { success: false, error: '마사지사 목록을 불러오는 데 실패했습니다.' }
    }

    if (therapists.length === 0) {
      return { success: false, error: '예약 불가: 현재 근무 중(활성 상태)인 마사지사가 없습니다.' }
    }

    // 2. 예약 날짜 및 시/분 추출 (로컬 타임 기준 분 단위 계산)
    const startDate = new Date(startTime)
    const endDate = new Date(endTime)
    const bookingDateStr = toLocalDateString(startDate)

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

    // 5. 예약하려는 시간대(startTime ~ endTime)와 겹치며 확정(confirmed)된 기존 예약 목록 조회
    const { data: overlappingReservations, error: reservationsError } = await supabase
      .from('reservations')
      .select('therapist_id')
      .eq('status', 'confirmed')
      .lt('start_time', endTime)
      .gt('end_time', startTime)
      .not('therapist_id', 'is', null)

    if (reservationsError || !overlappingReservations) {
      console.error('Reservations fetch error:', reservationsError)
      return { success: false, error: '기존 예약 내역을 조회하는 데 실패했습니다.' }
    }

    const busyTherapistIds = new Set<number>(
      overlappingReservations.map((res: any) => res.therapist_id)
    )

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

    // [조건 A] 고급 마사지 (예약 금액 10만 원 이상)
    const isPremium = price >= 100000
    if (isPremium) {
      // 오늘 고급 마사지 타겟(is_premium_target = true)인 마사지사 중 예약 가능한 직원 확인
      const premiumTargets = availableTherapists.filter(t => t.is_premium_target)
      
      if (premiumTargets.length > 0) {
        // 가능한 고급 타겟 마사지사 중 무작위 배정
        const randomIndex = Math.floor(Math.random() * premiumTargets.length)
        const selected = premiumTargets[randomIndex]
        return {
          success: true,
          therapistId: selected.id,
          therapistName: selected.name
        }
      }
    }

    // [조건 B] 일반 배정
    // - 금액이 10만 원 미만이거나
    // - 10만 원 이상이지만 고급 마사지 타겟 직원들이 모두 예약이 차 있는 경우
    // 비어 있는 다른 마사지사 중 무작위 배정
    const randomIndex = Math.floor(Math.random() * availableTherapists.length)
    const selected = availableTherapists[randomIndex]
    
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
