'use client'

import React, { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { History, ShieldAlert, RefreshCw } from 'lucide-react'

interface HistoryManagerProps {
  supabase: SupabaseClient
}

interface LogItem {
  id: number
  reservation_id: number
  action: 'create' | 'update' | 'cancel'
  performed_at: string
  details: string
  employee?: { name: string } | null
  reservations?: { customer_name: string } | null
}

export default function HistoryManager({ supabase }: HistoryManagerProps) {
  const [logs, setLogs] = useState<LogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await supabase
        .from('reservation_logs')
        .select(`
          id,
          reservation_id,
          action,
          performed_at,
          details,
          employee:performed_by (
            name
          ),
          reservations:reservation_id (
            customer_name
          )
        `)
        .order('performed_at', { ascending: false })

      if (error) throw error
      if (data) {
        setLogs(data as unknown as LogItem[])
      }
    } catch (err: any) {
      console.error('Fetch logs error:', err)
      setErrorMsg(err.message || '변경 이력 로그를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold tracking-tight text-slate-200 flex items-center gap-1.5 uppercase">
          <History className="w-4 h-4 text-indigo-500" /> 예약 변경 및 취소 전체 이력 (관리자 전용)
        </h3>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-100 transition-all text-xs gap-1"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 text-xs rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
          ⚠️ {errorMsg}
          <p className="mt-1 text-[10px] text-slate-500">
            * 데이터베이스에 reservation_logs 테이블이 정상적으로 생성되어 있는지 관리자에게 확인해 주세요.
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-xs text-slate-500 animate-pulse font-medium">
          이력 데이터를 불러오는 중...
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/20 py-16 text-center">
          <ShieldAlert className="w-9 h-9 text-slate-700 mx-auto mb-2.5" />
          <p className="text-xs text-slate-400">변경 혹은 취소된 예약 이력이 존재하지 않습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/30">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="p-4 w-40">작업 일시</th>
                <th className="p-4 w-28 text-center">구분</th>
                <th className="p-4 w-32">수행한 직원</th>
                <th className="p-4 w-36">예약 ID (고객명)</th>
                <th className="p-4">상세 변경 내용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60 text-slate-300">
              {logs.map((log) => {
                const actionColors = {
                  create: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  update: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                  cancel: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }
                const actionLabel = {
                  create: '신규 등록',
                  update: '예약 수정',
                  cancel: '예약 취소'
                }

                const employeeName = log.employee?.name || '시스템'
                const customerName = log.reservations?.customer_name || '정보 없음'

                return (
                  <tr key={log.id} className="hover:bg-slate-900/10 transition-colors">
                    <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                      {formatDateTime(log.performed_at)}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${actionColors[log.action]}`}>
                        {actionLabel[log.action]}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-200">
                      {employeeName}
                    </td>
                    <td className="p-3.5 text-slate-400">
                      <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 mr-1.5 text-slate-500 font-mono">
                        ID: {log.reservation_id}
                      </span>
                      <span className="font-semibold text-slate-300">{customerName}</span>
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
