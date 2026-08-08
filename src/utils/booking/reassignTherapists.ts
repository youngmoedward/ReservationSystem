import { SupabaseClient } from '@supabase/supabase-js'

export interface ReassignResult {
  success: boolean
  error?: string
  updatedCount?: number
}

/**
 * 특정 날짜의 예약 정보가 변경되었을 때, 변경건의 시작시간 이후에 시작하는 자동 배정/미확정 파트들을 실시간으로 재배정합니다.
 * 
 * @param supabase Supabase 클라이언트 객체
 * @param actionDate 대상 날짜 (YYYY-MM-DD)
 * @param triggerStartTime 기준 예약 시작 시간 (ISO 8601 포맷)
 */
export async function reassignTherapists(
  supabase: SupabaseClient,
  actionDate: string,
  triggerStartTime: string,
  language: string = 'ko'
): Promise<ReassignResult> {
  try {
    const triggerTimeMs = new Date(triggerStartTime).getTime()

    // 1. 활성 마사지사 목록 조회
    const { data: therapists, error: therapistsError } = await supabase
      .from('therapists')
      .select('id, name, is_premium_target, massage_type')
      .eq('is_active', true)

    if (therapistsError || !therapists) {
      console.error('Reassign fetch therapists error:', therapistsError)
      return { success: false, error: '마사지사 목록 조회 실패' }
    }

    if (therapists.length === 0) {
      return { success: false, error: '활성화된 마사지사가 없습니다.' }
    }

    // 2. 마사지사 당일 일정 조회
    const { data: schedules, error: schedulesError } = await supabase
      .from('therapist_schedule')
      .select('therapist_id, availability_type')
      .eq('date', actionDate)

    if (schedulesError) {
      console.error('Reassign fetch schedules error:', schedulesError)
      return { success: false, error: '마사지사 근무 일정 조회 실패' }
    }

    const scheduleMap = new Map<number, string>()
    if (schedules) {
      schedules.forEach((s: any) => {
        if (s.availability_type) {
          scheduleMap.set(s.therapist_id, s.availability_type)
        }
      })
    }

    // 3. 요금제 정보 조회
    const { data: plans, error: plansError } = await supabase
      .from('pricing_plans')
      .select('id, category, weight, massage_weight, bath_weight, duration_minutes, bath_duration_minutes, massage_duration_minutes, bath_price, massage_price')

    if (plansError || !plans) {
      console.error('Reassign fetch pricing plans error:', plansError)
      return { success: false, error: '요금제 정보 조회 실패' }
    }

    // 4. 당일 전체 예약 목록 조회 (취소되지 않은 건들만)
    const tzo = -new Date().getTimezoneOffset()
    const dif = tzo >= 0 ? '+' : '-'
    const pad = (num: number) => String(Math.floor(Math.abs(num))).padStart(2, '0')
    const offset = `${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`
    
    const startOfDay = `${actionDate}T00:00:00${offset}`
    const endOfDay = `${actionDate}T23:59:59${offset}`

    const { data: dayReservations, error: dayResError } = await supabase
      .from('reservations')
      .select('*')
      .in('status', ['confirmed', 'assigned'])
      .gte('start_time', startOfDay)
      .lte('start_time', endOfDay)

    if (dayResError || !dayReservations) {
      console.error('Reassign fetch reservations error:', dayResError)
      return { success: false, error: '예약 내역 조회 실패' }
    }

    // 5. 요일 계산 (요일별 우선순위 조회용: 0 = 월요일, ..., 6 = 일요일)
    const startDateObj = new Date(triggerStartTime)
    const jsDay = startDateObj.getDay()
    const dbDayOfWeek = jsDay === 0 ? 6 : jsDay - 1

    const therapistIds = therapists.map(t => t.id)

    // 요일별/서비스타입별 우선순위 조회
    const { data: priorities, error: prioritiesError } = await supabase
      .from('therapist_priorities')
      .select('therapist_id, service_type, priority_val')
      .eq('day_of_week', dbDayOfWeek)
      .in('therapist_id', therapistIds)

    if (prioritiesError) {
      console.error('Reassign fetch priorities error:', prioritiesError)
    }

    // priorityMap: therapistId -> serviceType ('wet' | 'dry') -> priorityValue
    const priorityMap = new Map<number, Map<string, number>>()
    therapistIds.forEach(id => priorityMap.set(id, new Map<string, number>()))
    
    if (priorities) {
      priorities.forEach((p: any) => {
        const val = parseInt(p.priority_val, 10)
        const subMap = priorityMap.get(p.therapist_id)
        if (subMap) {
          subMap.set(p.service_type, isNaN(val) ? Infinity : val)
        }
      })
    }

    // 6. 마사지사 시간대별 가용성 및 포인트 계산용 데이터 준비
    interface Task {
      reservationId: number
      part: 'primary' | 'secondary' // primary=건식/단일, secondary=습식
      startTime: string
      endTime: string
      startTimeMs: number
      endTimeMs: number
      price: number
      category: 'wet' | 'dry'
      weight: number
      originalTherapistId: number | null
      excludeTherapistId: number | null // 콤보 시 상대 파트에 이미 배정된 마사지사
    }

    const fixedReservations: any[] = []
    const targetTasks: Task[] = []

    dayReservations.forEach((res: any) => {
      const plan = plans.find(p => p.id === res.pricing_plan_id)
      if (!plan) return

      const isCombo = plan.category === 'combo'
      const startMs = new Date(res.start_time).getTime()

      if (isCombo) {
        const bathDur = plan.bath_duration_minutes || 60
        const massageDur = plan.massage_duration_minutes || 60
        const delayMin = res.delay_minutes ?? 30

        const wetStartISO = res.start_time
        const wetStartMs = startMs
        const wetEndMs = startMs + bathDur * 60000
        const wetEndISO = new Date(wetEndMs).toISOString()

        const dryStartMs = wetEndMs + delayMin * 60000
        const dryStartISO = new Date(dryStartMs).toISOString()
        const dryEndMs = dryStartMs + massageDur * 60000
        const dryEndISO = new Date(dryEndMs).toISOString()

        // 습식 파트 (secondary)
        const isWetTarget = 
          wetStartMs >= triggerTimeMs && 
          !res.is_secondary_assigned && 
          !res.is_requested_secondary

        if (isWetTarget) {
          targetTasks.push({
            reservationId: res.id,
            part: 'secondary',
            startTime: wetStartISO,
            endTime: wetEndISO,
            startTimeMs: wetStartMs,
            endTimeMs: wetEndMs,
            price: plan.bath_price || 0,
            category: 'wet',
            weight: plan.bath_weight || 1.0,
            originalTherapistId: res.secondary_therapist_id,
            excludeTherapistId: res.therapist_id // 상대 파트의 마사지사 제외용
          })
        } else {
          fixedReservations.push({
            therapist_id: res.secondary_therapist_id,
            start_time_ms: wetStartMs,
            end_time_ms: wetEndMs,
            weight: plan.bath_weight || 1.0
          })
        }

        // 건식 파트 (primary)
        const isDryTarget = 
          dryStartMs >= triggerTimeMs && 
          !res.is_primary_assigned && 
          !res.is_requested

        if (isDryTarget) {
          targetTasks.push({
            reservationId: res.id,
            part: 'primary',
            startTime: dryStartISO,
            endTime: dryEndISO,
            startTimeMs: dryStartMs,
            endTimeMs: dryEndMs,
            price: plan.massage_price || 0,
            category: 'dry',
            weight: plan.massage_weight || 1.0,
            originalTherapistId: res.therapist_id,
            excludeTherapistId: res.secondary_therapist_id // 상대 파트의 마사지사 제외용
          })
        } else {
          fixedReservations.push({
            therapist_id: res.therapist_id,
            start_time_ms: dryStartMs,
            end_time_ms: dryEndMs,
            weight: plan.massage_weight || 1.0
          })
        }
      } else {
        // 단일 요금제
        const endMs = new Date(res.end_time).getTime()
        const isTarget = 
          startMs >= triggerTimeMs && 
          !res.is_primary_assigned && 
          !res.is_requested &&
          res.status !== 'assigned'

        if (isTarget) {
          targetTasks.push({
            reservationId: res.id,
            part: 'primary',
            startTime: res.start_time,
            endTime: res.end_time,
            startTimeMs: startMs,
            endTimeMs: endMs,
            price: res.price,
            category: (plan.category === 'wet' ? 'wet' : 'dry') as 'wet' | 'dry',
            weight: plan.weight || 1.0,
            originalTherapistId: res.therapist_id,
            excludeTherapistId: null
          })
        } else {
          fixedReservations.push({
            therapist_id: res.therapist_id,
            start_time_ms: startMs,
            end_time_ms: endMs,
            weight: plan.weight || 1.0
          })
        }
      }
    })

    // 7. 각 마사지사의 기준 누적 포인트 및 고정 스케줄 초기화
    const pointsMap = new Map<number, number>()
    const busyPeriodsMap = new Map<number, Array<{ start: number; end: number }>>()

    therapistIds.forEach(id => {
      pointsMap.set(id, 0)
      busyPeriodsMap.set(id, [])
    })

    fixedReservations.forEach((item: any) => {
      if (!item.therapist_id) return
      const current = pointsMap.get(item.therapist_id) || 0
      pointsMap.set(item.therapist_id, current + item.weight)
      
      const periods = busyPeriodsMap.get(item.therapist_id) || []
      periods.push({ start: item.start_time_ms, end: item.end_time_ms })
      busyPeriodsMap.set(item.therapist_id, periods)
    })

    // 8. 대상 Task들 정렬 (시작 시간 오름차순, 예약 금액 내림차순)
    targetTasks.sort((a, b) => {
      if (a.startTimeMs !== b.startTimeMs) {
        return a.startTimeMs - b.startTimeMs
      }
      return b.price - a.price // 높은 금액 우선
    })

    // 9. 순차적 Greedy 배정 실행
    const updatesMap = new Map<number, Record<string, any>>() // resId -> updatePayload
    const changesMap = new Map<number, string[]>() // resId -> string[] of human-readable changes

    for (const task of targetTasks) {
      // 해당 서비스 종류(wet/dry)에 매칭되는 마사지사들만 필터링
      const candidateTherapists = therapists.filter(t => {
        if (task.category === 'dry') {
          return t.massage_type === 'dry' || t.massage_type === 'both'
        } else {
          return t.massage_type === 'wet' || t.massage_type === 'both'
        }
      })

      // 근무 가능 여부 대조
      const availableCandidates = candidateTherapists.filter(t => {
        // 콤보의 동일 고객 상대 파트에 지정된 경우 제외
        if (task.excludeTherapistId && t.id === task.excludeTherapistId) {
          return false
        }

        const type = scheduleMap.get(t.id)
        if (type === 'full') return true

        const startMinutes = new Date(task.startTime).getHours() * 60 + new Date(task.startTime).getMinutes()
        const endMinutes = new Date(task.endTime).getHours() * 60 + new Date(task.endTime).getMinutes()

        if (type === 'am_half') return startMinutes >= 990 // 16:30 이후만 가능
        if (type === 'pm_half') return endMinutes <= 990 // 16:30 이전만 가능

        return false // off 또는 미정
      })

      // 바쁜 시간 겹침 검사
      const freeCandidates = availableCandidates.filter(t => {
        const busy = busyPeriodsMap.get(t.id) || []
        return !busy.some(period => task.startTimeMs < period.end && task.endTimeMs > period.start)
      })

      if (freeCandidates.length === 0) {
        // 가용한 마사지사가 전혀 없는 경우 기존 배정 유지 (busy 스케줄에 기존 배정 추가)
        if (task.originalTherapistId) {
          const periods = busyPeriodsMap.get(task.originalTherapistId) || []
          periods.push({ start: task.startTimeMs, end: task.endTimeMs })
          busyPeriodsMap.set(task.originalTherapistId, periods)
        }
        continue
      }

      // 포인트 및 요일 우선순위에 따라 정렬
      freeCandidates.sort((a, b) => {
        const ptA = pointsMap.get(a.id) || 0
        const ptB = pointsMap.get(b.id) || 0
        if (ptA !== ptB) {
          return ptA - ptB
        }

        const priorityA = priorityMap.get(a.id)?.get(task.category) ?? Infinity
        const priorityB = priorityMap.get(b.id)?.get(task.category) ?? Infinity
        return priorityA - priorityB
      })

      const selectedTherapist = freeCandidates[0]

      // 누적 포인트 업데이트
      const currentPts = pointsMap.get(selectedTherapist.id) || 0
      pointsMap.set(selectedTherapist.id, currentPts + task.weight)

      // 바쁜 시간 기간에 추가
      const periods = busyPeriodsMap.get(selectedTherapist.id) || []
      periods.push({ start: task.startTimeMs, end: task.endTimeMs })
      busyPeriodsMap.set(selectedTherapist.id, periods)

      // 원래 마사지사 배정과 다른 경우만 변경 사항으로 등록
      if (selectedTherapist.id !== task.originalTherapistId) {
        if (!updatesMap.has(task.reservationId)) {
          updatesMap.set(task.reservationId, {})
        }
        const record = updatesMap.get(task.reservationId)!
        if (task.part === 'primary') {
          record.therapist_id = selectedTherapist.id
        } else {
          record.secondary_therapist_id = selectedTherapist.id
        }

        if (!changesMap.has(task.reservationId)) {
          changesMap.set(task.reservationId, [])
        }
        
        const oldName = therapists.find(t => t.id === task.originalTherapistId)?.name || (language === 'ko' ? '미지정' : 'Unassigned')
        const newName = selectedTherapist.name
        
        const partLabel = task.part === 'secondary'
          ? (language === 'ko' ? '습식 마사지사' : 'Wet Therapist')
          : (task.excludeTherapistId ? (language === 'ko' ? '건식 마사지사' : 'Dry Therapist') : (language === 'ko' ? '마사지사' : 'Therapist'))
          
        changesMap.get(task.reservationId)!.push(`${partLabel}: [${oldName}] -> [${newName}]`)
      }
    }

    // 10. DB에 업데이트 반영 및 이력 로그 기록
    let updatedCount = 0
    if (updatesMap.size > 0) {
      for (const [resId, payload] of Array.from(updatesMap.entries())) {
        const { error } = await supabase
          .from('reservations')
          .update(payload)
          .eq('id', resId)

        if (error) {
          console.error(`Reassign save error for reservation ${resId}:`, error)
        } else {
          updatedCount++
          const resChanges = changesMap.get(resId) || []
          const changeStr = resChanges.join(', ')
          // 재배정 이력 로그 생성
          const detailMsg = `[시스템 자동 재배정] 예약 상세 변경으로 인해 마사지사를 자동 재조정함. (${changeStr})`
          await supabase.from('reservation_logs').insert({
            reservation_id: resId,
            action: 'update',
            log_type: 'reservation',
            details: detailMsg
          })
        }
      }
    }

    return { success: true, updatedCount }

  } catch (err: any) {
    console.error('Unexpected reassignTherapists error:', err)
    return { success: false, error: err.message || '예기치 못한 시스템 재배정 오류' }
  }
}
