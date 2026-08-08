import { SupabaseClient } from '@supabase/supabase-js'

export interface OperatingHoursInfo {
  open_time: string // 'HH:MM' 포맷
  close_time: string // 'HH:MM' 포맷
  is_closed: boolean
  is_exception: boolean
  description?: string | null
}

// 시간 문자열(HH:MM:SS)을 HH:MM 포맷으로 정리하는 헬퍼 함수
function formatTimeHHMM(timeStr: string | null | undefined, defaultVal: string): string {
  if (!timeStr) return defaultVal
  const parts = timeStr.split(':')
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
  }
  return defaultVal
}

/**
 * 특정 날짜(YYYY-MM-DD)의 영업시간 정보를 계산합니다.
 * exceptions 테이블에 예외 데이터가 있으면 이를 우선 적용하고, 없으면 default 요일별 영업시간을 조회합니다.
 */
export async function getOperatingHoursForDate(
  supabase: SupabaseClient,
  dateStr: string
): Promise<OperatingHoursInfo> {
  const fallbackVal: OperatingHoursInfo = {
    open_time: '09:00',
    close_time: '21:00',
    is_closed: false,
    is_exception: false,
    description: null
  }

  try {
    // 1. 해당 날짜의 예외 설정(exceptions) 조회
    const { data: exception, error: exError } = await supabase
      .from('operating_hours_exceptions')
      .select('*')
      .eq('date', dateStr)
      .maybeSingle()

    if (exError) {
      console.error('getOperatingHoursForDate exception fetch error:', exError)
    }

    if (exception) {
      return {
        open_time: formatTimeHHMM(exception.open_time, '09:00'),
        close_time: formatTimeHHMM(exception.close_time, '21:00'),
        is_closed: !!exception.is_closed,
        is_exception: true,
        description: exception.description || null
      }
    }

    // 2. 예외가 없을 경우, 요일 구하기 (0: 월요일, ..., 6: 일요일)
    const d = new Date(`${dateStr}T00:00:00`)
    const jsDay = d.getDay()
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1

    // 3. default 영업시간 테이블 조회
    const { data: defaultHours, error: dfError } = await supabase
      .from('operating_hours_default')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    if (dfError) {
      console.error('getOperatingHoursForDate defaultHours fetch error:', dfError)
    }

    if (defaultHours) {
      return {
        open_time: formatTimeHHMM(defaultHours.open_time, '09:00'),
        close_time: formatTimeHHMM(defaultHours.close_time, '21:00'),
        is_closed: !!defaultHours.is_closed,
        is_exception: false,
        description: null
      }
    }

    return fallbackVal
  } catch (err) {
    console.error('Unexpected error in getOperatingHoursForDate:', err)
    return fallbackVal
  }
}
