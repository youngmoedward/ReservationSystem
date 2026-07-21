'use client'

import React, { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { History, ShieldAlert, RefreshCw, Calendar, Filter } from 'lucide-react'
import { useLanguage } from '@/app/LanguageContext'
import { toUIDateString } from '@/utils/booking/dateUtils'

interface HistoryManagerProps {
  supabase: SupabaseClient
}

interface LogItem {
  id: number
  reservation_id: number | null
  action: string
  performed_at: string
  details: string
  log_type: 'reservation' | 'schedule' | 'therapist' | 'employee' | 'priority'
  employee?: { name: string } | null
  reservations?: { customer_name: string; start_time: string } | null
}

export default function HistoryManager({ supabase }: HistoryManagerProps) {
  const { t, language } = useLanguage()

  // 기본 날짜 계산 (현재 월 1일 ~ 다음 달 말일)
  const getInitialDates = () => {
    const today = new Date()
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1)
    const toDate = new Date(today.getFullYear(), today.getMonth() + 2, 0) // 다음 달 말일
    
    // YYYY-MM-DD 포맷
    const toDateStr = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    return {
      from: toDateStr(fromDate),
      to: toDateStr(toDate)
    }
  }

  const initialDates = getInitialDates()
  const [logs, setLogs] = useState<LogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 검색 필터 상태
  const [logTypeFilter, setLogTypeFilter] = useState<string>('all')
  const [fromDateFilter, setFromDateFilter] = useState<string>(initialDates.from)
  const [toDateFilter, setToDateFilter] = useState<string>(initialDates.to)

  // 페이징 상태
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 15

  const fetchLogs = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      let query = supabase
        .from('reservation_logs')
        .select(`
          id,
          reservation_id,
          action,
          performed_at,
          performed_by,
          details,
          log_type,
          employee:performed_by (
            name
          ),
          reservations:reservation_id (
            customer_name,
            start_time
          )
        `, { count: 'exact' })
        .gte('performed_at', `${fromDateFilter}T00:00:00.000Z`)
        .lte('performed_at', `${toDateFilter}T23:59:59.999Z`)
        .order('performed_at', { ascending: false })
        .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1)

      if (logTypeFilter !== 'all') {
        query = query.eq('log_type', logTypeFilter)
      }

      let { data, error, count } = await query

      // 조인 관계 오류 시 단순 쿼리로 2차 Fallback
      if (error) {
        console.warn('Primary log query failed, falling back to simple select:', error.message)
        let fallbackQuery = supabase
          .from('reservation_logs')
          .select('id, reservation_id, action, performed_at, performed_by, details, log_type', { count: 'exact' })
          .gte('performed_at', `${fromDateFilter}T00:00:00.000Z`)
          .lte('performed_at', `${toDateFilter}T23:59:59.999Z`)
          .order('performed_at', { ascending: false })
          .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1)

        if (logTypeFilter !== 'all') {
          fallbackQuery = fallbackQuery.eq('log_type', logTypeFilter)
        }

        const res2 = await fallbackQuery
        if (res2.error) throw res2.error
        data = res2.data as any
        count = res2.count
      }

      if (data) {
        setLogs(data as unknown as LogItem[])
      }
      if (count !== null) {
        setTotalCount(count)
      }
    } catch (err: any) {
      console.error('Fetch logs error:', err)
      setErrorMsg(err.message || (language === 'ko' ? '변경 이력 로그를 불러오는 중 오류가 발생했습니다.' : 'An error occurred while loading audit history logs.'))
    } finally {
      setLoading(false)
    }
  }

  // 필터 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1)
  }, [logTypeFilter, fromDateFilter, toDateFilter])

  // 페이지 및 필터 감지하여 로그 갱신
  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, logTypeFilter, fromDateFilter, toDateFilter])

  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')
    return `${month}-${date}-${year} ${hours}:${minutes}:${seconds}`
  }

  const translateDutyStatus = (statusKr: string) => {
    switch (statusKr) {
      case '근무': return language === 'ko' ? '근무' : 'On Duty'
      case '휴무': return language === 'ko' ? '휴무' : 'Off Duty'
      case '오전반차': return language === 'ko' ? '오전반차' : 'AM Half Duty'
      case '오후반차': return language === 'ko' ? '오후반차' : 'PM Half Duty'
      case '미정': return language === 'ko' ? '미정' : 'Undecided'
      default: return statusKr
    }
  }

  const renderDetailsText = (details: string | null): string => {
    if (!details) return '-'

    // 1. JSON 형식인 경우 처리 (신규 마사지사, 직원, 예약 변경 등)
    try {
      const data = JSON.parse(details)
      if (data && data.key) {
        let template = t(data.key)
        
        let params = { ...data.params }
        if (params.changes && Array.isArray(params.changes)) {
          // 각 변경 항목 번역
          const translatedChanges = params.changes.map((change: any) => {
            if (change && typeof change === 'object' && change.key) {
              let changeTemplate = t(change.key)
              Object.entries(change.params || {}).forEach(([k, v]) => {
                changeTemplate = changeTemplate.replace(`{${k}}`, String(v))
              })
              return changeTemplate
            }
            return String(change)
          })
          params.changes = translatedChanges.join(', ')
        }

        // 템플릿 치환
        Object.entries(params).forEach(([k, v]) => {
          let valStr = String(v)
          if (valStr.startsWith('trans:')) {
            valStr = t(valStr.substring(6))
          }
          template = template.replace(`{${k}}`, valStr)
        })
        return template
      }
    } catch (e) {
      // JSON 파싱 실패시 -> 레거시 텍스트이거나 스케줄 변경 로그
    }

    // 2. 스케줄 변경 이력 정규식 기반 다국어 처리
    if (language === 'en') {
      let matched = details.match(/^(.+)의 (.+) 근무 일정을 \[(.+)\]로 변경함\. \(이전: (.+)\)$/)
      if (matched) {
        const [, name, date, status, prev] = matched
        const statusEn = translateDutyStatus(status)
        const prevEn = translateDutyStatus(prev)
        return `${name}'s duty schedule for ${date} changed to [${statusEn}]. (Previous: ${prevEn})`
      }

      matched = details.match(/^(.+)의 (.+) 근무 일정을 \[(.+)\]로 설정함\.$/)
      if (matched) {
        const [, name, date, status] = matched
        const statusEn = translateDutyStatus(status)
        return `${name}'s duty schedule for ${date} set to [${statusEn}].`
      }

      matched = details.match(/^(.+)의 (.+) 근무 일정을 \[(.+)\]으로 초기화함\.$/)
      if (matched) {
        const [, name, date, status] = matched
        const statusEn = translateDutyStatus(status)
        return `${name}'s duty schedule for ${date} reset to [${statusEn}].`
      }
    }

    return details
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-100/40 p-5 space-y-4">
      {/* 헤더 및 새로고침 */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
        <h3 className="text-sm font-bold tracking-tight text-stone-800 flex items-center gap-1.5 uppercase">
          <History className="w-4 h-4 text-emerald-700" /> {t('history.title_admin')}
        </h3>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center justify-center p-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-600 hover:text-stone-800 transition-all text-xs gap-1"
          title={t('history.refresh')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('history.refresh')}
        </button>
      </div>

      {/* 필터 제어 영역 */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-stone-100/50 border border-stone-200 p-4 rounded-xl text-xs">
        {/* 이력 종류 필터 */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-stone-500 font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-stone-500" /> {t('history.filter.type')}
          </span>
          <select
            value={logTypeFilter}
            onChange={(e) => setLogTypeFilter(e.target.value)}
            className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-emerald-500/80 font-medium w-full sm:w-44"
          >
            <option value="all">{t('history.filter.all')}</option>
            <option value="reservation">{t('history.filter.reservation')}</option>
            <option value="schedule">{t('history.filter.schedule')}</option>
            <option value="therapist">{t('history.filter.therapist')}</option>
            <option value="employee">{t('history.filter.employee')}</option>
            <option value="priority">{language === 'ko' ? '우선순위 관리' : 'Priority'}</option>
          </select>
        </div>

        {/* 날짜 범위 필터 */}
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <span className="text-stone-500 font-semibold flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-stone-400" /> {t('history.filter.period')}
          </span>
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <div className="relative flex items-center gap-1.5 bg-white border border-stone-200 hover:border-stone-300 rounded-xl px-3 py-1.5 transition-colors focus-within:border-emerald-500/80 cursor-pointer w-full sm:w-36 min-h-[32px]">
              <input
                type="date"
                value={fromDateFilter}
                onChange={(e) => setFromDateFilter(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              />
              <span className="text-stone-800 text-xs font-semibold">{fromDateFilter ? toUIDateString(fromDateFilter) : ''}</span>
            </div>
            <span className="text-stone-400">~</span>
            <div className="relative flex items-center gap-1.5 bg-white border border-stone-200 hover:border-stone-300 rounded-xl px-3 py-1.5 transition-colors focus-within:border-emerald-500/80 cursor-pointer w-full sm:w-36 min-h-[32px]">
              <input
                type="date"
                value={toDateFilter}
                onChange={(e) => setToDateFilter(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              />
              <span className="text-stone-800 text-xs font-semibold">{toDateFilter ? toUIDateString(toDateFilter) : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 text-xs rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
          ⚠️ {errorMsg}
          <p className="mt-1 text-[10px] text-stone-400">
            {language === 'ko' 
              ? '* 데이터베이스에 테이블 컬럼(log_type 등)이 정상 생성되어 있는지 확인해 주세요.' 
              : '* Please make sure the database table column (log_type etc.) is properly created.'}
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-xs text-stone-400 animate-pulse font-medium">
          {t('history.loading')}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 py-16 text-center">
          <ShieldAlert className="w-9 h-9 text-stone-300 mx-auto mb-2.5" />
          <p className="text-xs text-stone-500">{t('history.no_records')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 shadow-inner font-sans">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-100 text-[10px] font-bold text-stone-600 uppercase tracking-wider">
                  <th className="p-4 w-40">{t('history.table.time')}</th>
                  <th className="p-4 w-28 text-center">{t('history.table.type')}</th>
                  <th className="p-4 w-28 text-center">{t('history.table.action')}</th>
                  <th className="p-4 w-32">{t('history.table.user')}</th>
                  <th className="p-4 w-44">{t('history.table.target')}</th>
                  <th className="p-4">{t('history.table.details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-stone-700">
                {logs.map((log) => {
                  // 이력 종류별 뱃지
                  const logTypeLabels: Record<string, { text: string; class: string }> = {
                    reservation: { text: t('history.type.reservation'), class: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold' },
                    schedule: { text: t('history.type.schedule'), class: 'bg-amber-50 text-amber-700 border border-amber-200 font-bold' },
                    therapist: { text: t('history.type.therapist'), class: 'bg-stone-100 text-stone-700 border border-stone-300 font-bold' },
                    employee: { text: t('history.type.employee'), class: 'bg-stone-200 text-stone-600 border border-stone-300 font-bold' },
                    priority: { text: language === 'ko' ? '우선순위' : 'Priority', class: 'bg-purple-50 text-purple-700 border border-purple-200 font-bold' }
                  }

                  // 액션 뱃지
                  const actionLabels: Record<string, { text: string; class: string }> = {
                    create: { text: t('history.action.create'), class: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold' },
                    update: { text: t('history.action.update'), class: 'bg-blue-50 text-blue-700 border border-blue-200 font-bold' },
                    delete: { text: t('history.action.delete'), class: 'bg-stone-200 text-stone-600 border border-stone-300 font-bold' },
                    cancel: { text: t('history.action.cancel'), class: 'bg-rose-50 text-rose-700 border border-rose-200 font-bold' }
                  }

                  const logTypeData = logTypeLabels[log.log_type] || { text: t('history.type.other'), class: 'bg-stone-100 text-stone-500 border-stone-300' }
                  const actionData = actionLabels[log.action] || { text: log.action, class: 'bg-stone-100 text-stone-700 border border-stone-300' }

                  const getPerformerName = () => {
                    if (log.employee?.name) return log.employee.name
                    if ((log as any).performed_by && typeof (log as any).performed_by === 'string') {
                      return (log as any).performed_by
                    }
                    if (log.details && log.details.includes('[수행자:')) {
                      const match = log.details.match(/\[수행자:\s*([^\]]+)\]/)
                      if (match) return match[1]
                    }
                    return t('history.system')
                  }
                  const performerName = getPerformerName()

                  return (
                    <tr key={log.id} className="hover:bg-stone-100 transition-colors">
                      <td className="p-3.5 font-mono text-stone-400 text-[11px]">
                        {formatDateTime(log.performed_at)}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold border ${logTypeData.class}`}>
                          {logTypeData.text}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold border ${actionData.class}`}>
                          {actionData.text}
                        </span>
                      </td>
                      <td className="p-3.5 font-semibold text-stone-800">
                        {performerName}
                      </td>
                      <td className="p-3.5 text-stone-500">
                        {log.log_type === 'reservation' ? (
                          log.reservations ? (
                            <span className="font-semibold text-stone-600">
                              {log.reservations.customer_name} ({toUIDateString(new Date(log.reservations.start_time))})
                            </span>
                          ) : (
                            <span className="text-stone-400 font-medium">{t('history.no_info')}</span>
                          )
                        ) : log.log_type === 'schedule' ? (
                          <span className="text-stone-400 font-medium">{t('history.target.schedule')}</span>
                        ) : log.log_type === 'therapist' ? (
                          <span className="text-stone-400 font-medium">{t('history.type.therapist')}</span>
                        ) : log.log_type === 'employee' ? (
                          <span className="text-stone-400 font-medium">{t('history.type.employee')}</span>
                        ) : log.log_type === 'priority' ? (
                          <span className="text-stone-400 font-medium">{language === 'ko' ? '우선순위 관리' : 'Priorities'}</span>
                        ) : (
                          <span className="text-stone-400 font-medium">{t('history.type.other')}</span>
                        )}
                      </td>
                      <td className="p-3.5 text-stone-700 leading-relaxed font-medium">
                        {renderDetailsText(log.details)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 페이징 네비게이션 UI */}
          <div className="flex items-center justify-between border-t border-stone-200 pt-4 px-1 text-xs font-sans">
            <span className="text-stone-500">
              {t('history.pagination.page')
                .replace('{current}', String(currentPage))
                .replace('{total}', String(Math.ceil(totalCount / itemsPerPage) || 1))}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1 || loading}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-stone-700 transition-colors"
              >
                {t('history.pagination.prev')}
              </button>
              <button
                disabled={currentPage * itemsPerPage >= totalCount || loading}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-stone-700 transition-colors"
              >
                {t('history.pagination.next')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
