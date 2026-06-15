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
  log_type: 'reservation' | 'schedule'
  employee?: { name: string } | null
  reservations?: { customer_name: string } | null
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
          details,
          log_type,
          employee:performed_by (
            name
          ),
          reservations:reservation_id (
            customer_name
          )
        `)
        .gte('performed_at', `${fromDateFilter}T00:00:00.000Z`)
        .lte('performed_at', `${toDateFilter}T23:59:59.999Z`)
        .order('performed_at', { ascending: false })

      if (logTypeFilter !== 'all') {
        query = query.eq('log_type', logTypeFilter)
      }

      const { data, error } = await query

      if (error) throw error
      if (data) {
        setLogs(data as unknown as LogItem[])
      }
    } catch (err: any) {
      console.error('Fetch logs error:', err)
      setErrorMsg(err.message || (language === 'ko' ? '변경 이력 로그를 불러오는 중 오류가 발생했습니다.' : 'An error occurred while loading audit history logs.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logTypeFilter, fromDateFilter, toDateFilter])

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

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      {/* 헤더 및 새로고침 */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold tracking-tight text-slate-200 flex items-center gap-1.5 uppercase">
          <History className="w-4 h-4 text-indigo-500" /> {t('history.title_admin')}
        </h3>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-100 transition-all text-xs gap-1"
          title={t('history.refresh')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('history.refresh')}
        </button>
      </div>

      {/* 필터 제어 영역 */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-950/30 border border-slate-850 p-4 rounded-xl text-xs">
        {/* 이력 종류 필터 */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-500" /> {t('history.filter.type')}
          </span>
          <select
            value={logTypeFilter}
            onChange={(e) => setLogTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-medium w-full sm:w-44"
          >
            <option value="all">{t('history.filter.all')}</option>
            <option value="reservation">{t('history.filter.reservation')}</option>
            <option value="schedule">{t('history.filter.schedule')}</option>
          </select>
        </div>

        {/* 날짜 범위 필터 */}
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-550" /> {t('history.filter.period')}
          </span>
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <div className="relative flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-1.5 transition-colors focus-within:border-indigo-500 cursor-pointer w-full sm:w-36 min-h-[32px]">
              <input
                type="date"
                value={fromDateFilter}
                onChange={(e) => setFromDateFilter(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              />
              <span className="text-slate-200 text-xs font-semibold">{fromDateFilter ? toUIDateString(fromDateFilter) : ''}</span>
            </div>
            <span className="text-slate-600">~</span>
            <div className="relative flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-1.5 transition-colors focus-within:border-indigo-500 cursor-pointer w-full sm:w-36 min-h-[32px]">
              <input
                type="date"
                value={toDateFilter}
                onChange={(e) => setToDateFilter(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              />
              <span className="text-slate-200 text-xs font-semibold">{toDateFilter ? toUIDateString(toDateFilter) : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 text-xs rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
          ⚠️ {errorMsg}
          <p className="mt-1 text-[10px] text-slate-500">
            {language === 'ko' 
              ? '* 데이터베이스에 테이블 컬럼(log_type 등)이 정상 생성되어 있는지 확인해 주세요.' 
              : '* Please make sure the database table column (log_type etc.) is properly created.'}
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-xs text-slate-500 animate-pulse font-medium">
          {t('history.loading')}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/20 py-16 text-center">
          <ShieldAlert className="w-9 h-9 text-slate-700 mx-auto mb-2.5" />
          <p className="text-xs text-slate-400">{t('history.no_records')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/30 shadow-inner">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="p-4 w-40">{t('history.table.time')}</th>
                <th className="p-4 w-28 text-center">{t('history.table.type')}</th>
                <th className="p-4 w-28 text-center">{t('history.table.action')}</th>
                <th className="p-4 w-32">{t('history.table.user')}</th>
                <th className="p-4 w-44">{t('history.table.target')}</th>
                <th className="p-4">{t('history.table.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60 text-slate-300">
              {logs.map((log) => {
                // 이력 종류별 뱃지
                const logTypeLabels = {
                  reservation: { text: t('history.type.reservation'), class: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/15' },
                  schedule: { text: t('history.type.schedule'), class: 'bg-amber-500/10 text-amber-400 border-amber-500/15' }
                }

                // 액션 뱃지
                const actionLabels: Record<string, { text: string; class: string }> = {
                  create: { text: t('history.action.create'), class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
                  update: { text: t('history.action.update'), class: 'bg-blue-500/10 text-blue-450 border-blue-500/20' },
                  delete: { text: t('history.action.delete'), class: 'bg-slate-800 text-slate-400 border-slate-750' },
                  cancel: { text: t('history.action.cancel'), class: 'bg-rose-500/10 text-rose-450 border-rose-500/20' }
                }

                const logTypeData = logTypeLabels[log.log_type] || { text: t('history.type.other'), class: 'bg-slate-800 text-slate-450 border-slate-750' }
                const actionData = actionLabels[log.action] || { text: log.action, class: 'bg-slate-800 text-slate-300 border-slate-750' }

                const performerName = log.employee?.name || t('history.system')
                const customerName = log.reservations?.customer_name || null

                return (
                  <tr key={log.id} className="hover:bg-slate-900/10 transition-colors">
                    <td className="p-3.5 font-mono text-slate-400 text-[11px]">
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
                    <td className="p-3.5 font-semibold text-slate-200">
                      {performerName}
                    </td>
                    <td className="p-3.5 text-slate-400">
                      {log.log_type === 'reservation' ? (
                        <>
                          <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 mr-1.5 text-slate-500 font-mono">
                            ID: {log.reservation_id}
                          </span>
                          <span className="font-semibold text-slate-300">{customerName || t('history.no_info')}</span>
                        </>
                      ) : (
                        <span className="text-slate-500 font-medium">{t('history.target.schedule')}</span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-300 leading-relaxed font-medium">
                      {log.details || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

