'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '../providers'
import { useLanguage } from '@/app/LanguageContext'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { ShieldCheck, Key, RefreshCw, AlertCircle, CheckCircle2, Save } from 'lucide-react'

export interface SystemRole {
  id?: number
  role_key: string
  role_name: string
  username: string
  password: string
}

const DEFAULT_ROLES: SystemRole[] = [
  { role_key: 'msg1', role_name: '건식 마사지사 (Dry Therapist)', username: 'msg1', password: 'msg123' },
  { role_key: 'msg2', role_name: '습식 마사지사 (Wet Therapist)', username: 'msg2', password: 'msg234' },
  { role_key: 'staff', role_name: '직원 (Staff)', username: 'staff', password: 'staff123' },
  { role_key: 'leader', role_name: '스태프 리더 (Staff Leader)', username: 'leader', password: 'leader123' },
  { role_key: 'manager', role_name: '총괄 관리자 (Manager)', username: 'manager', password: '12345!' },
]

export default function RoleManagementPage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { language } = useLanguage()

  const [roles, setRoles] = useState<SystemRole[]>(DEFAULT_ROLES)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 1. system_roles 테이블에서 5개 권한 계정 정보 가져오기
  const fetchRoles = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await supabase
        .from('system_roles')
        .select('*')
        .order('id', { ascending: true })

      if (error) {
        console.warn('system_roles table not ready yet, using default roles list:', error.message)
      } else if (data && data.length > 0) {
        const merged = DEFAULT_ROLES.map(def => {
          const found = data.find((d: any) => d.role_key === def.role_key)
          return found ? (found as SystemRole) : def
        })
        setRoles(merged)
      }
    } catch (err: any) {
      console.warn('Error fetching roles:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRoles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. 입력값 변경 (username / password)
  const handleInputChange = (roleKey: string, field: 'username' | 'password', value: string) => {
    setRoles(prev =>
      prev.map(r => (r.role_key === roleKey ? { ...r, [field]: value } : r))
    )
  }

  // 3. 개별 권한 계정 정보 저장
  const handleSaveRole = async (targetRole: SystemRole) => {
    setSavingKey(targetRole.role_key)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { error } = await supabase
        .from('system_roles')
        .upsert({
          role_key: targetRole.role_key,
          role_name: targetRole.role_name,
          username: targetRole.username.trim(),
          password: targetRole.password.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'role_key' })

      if (error) {
        if (error.message.includes('relation "public.system_roles" does not exist') || error.code === '42P01') {
          throw new Error(
            language === 'ko'
              ? 'system_roles 테이블이 DB에 생성되어 있지 않습니다. SQL 마이그레이션을 실행해주세요.'
              : 'system_roles table does not exist in Database.'
          )
        }
        throw error
      }

      setSuccessMsg(
        language === 'ko'
          ? `[${targetRole.role_name}] 계정 정보가 성공적으로 변경되었습니다.`
          : `[${targetRole.role_name}] account updated!`
      )
      setTimeout(() => setSuccessMsg(null), 3500)
    } catch (err: any) {
      console.error('Save role error:', err)
      setErrorMsg(err.message || (language === 'ko' ? '권한 정보 저장 중 오류가 발생했습니다.' : 'Failed to save role.'))
    } finally {
      setSavingKey(null)
    }
  }

  // Manager 권한 접근 제한
  if (currentUser.role !== 'manager') {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl max-w-lg mx-auto mt-10 shadow-sm">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 animate-bounce text-rose-600" />
          <h3 className="text-base font-extrabold">
            {language === 'ko' ? '접근 권한이 없습니다.' : 'Access Denied.'}
          </h3>
          <p className="text-xs mt-1 text-rose-600">
            {language === 'ko'
              ? '권한 관리 메뉴는 Manager(총괄 관리자) 전용 메뉴입니다.'
              : 'Role Management is only accessible for Managers.'}
          </p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 타이틀 */}
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-blue-950 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-700" />
              {language === 'ko' ? '5개 고정 권한 계정 & 비밀번호 관리' : '5 Fixed Role Accounts & Password Management'}
            </h2>
            <p className="text-xs text-stone-500 mt-1 font-semibold">
              {language === 'ko'
                ? '로그인 전용 5개 권한 계정(msg1, msg2, staff, leader, manager)의 아이디 및 비밀번호를 관리합니다.'
                : 'Manage credentials for the 5 login roles: msg1, msg2, staff, leader, and manager.'}
            </p>
          </div>
          <button
            onClick={fetchRoles}
            className="p-2 rounded-xl text-stone-600 bg-stone-100 hover:bg-stone-200 border border-stone-300 transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 상태 메시지 */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs flex items-center gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2 shadow-xs animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-bold">{successMsg}</span>
          </div>
        )}

        {/* 5개 권한 계정 카드 리스트 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {roles.map(role => {
            const isManager = role.role_key === 'manager'
            const isLeader = role.role_key === 'leader'
            const isStaff = role.role_key === 'staff'
            const isSaving = savingKey === role.role_key

            return (
              <div
                key={role.role_key}
                className={`bg-white border rounded-2xl p-5 shadow-sm space-y-4 relative overflow-hidden transition-all hover:shadow-md ${
                  isManager
                    ? 'border-purple-300 ring-1 ring-purple-200/80 bg-purple-50/20'
                    : isLeader
                      ? 'border-emerald-300 bg-emerald-50/10'
                      : isStaff
                        ? 'border-sky-300 bg-sky-50/10'
                        : 'border-amber-300 bg-amber-50/10'
                }`}
              >
                {/* 상단 뱃지 & 역할명 */}
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-purple-100 text-purple-800 font-extrabold text-xs">
                      <Key className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-stone-900">
                        {role.role_name}
                      </h4>
                      <span className="text-[10px] font-mono font-bold text-stone-400">
                        Role Key: {role.role_key}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    isManager
                      ? 'bg-purple-100 text-purple-900 border-purple-300'
                      : isLeader
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : isStaff
                          ? 'bg-sky-100 text-sky-900 border-sky-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    {role.role_key.toUpperCase()}
                  </span>
                </div>

                {/* 입력 폼 */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1 uppercase tracking-wider">
                      {language === 'ko' ? '로그인 ID' : 'Login ID'}
                    </label>
                    <input
                      type="text"
                      value={role.username}
                      onChange={(e) => handleInputChange(role.role_key, 'username', e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:bg-white focus:ring-1 focus:ring-purple-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1 uppercase tracking-wider">
                      {language === 'ko' ? '비밀번호 (Password)' : 'Password'}
                    </label>
                    <input
                      type="text"
                      value={role.password}
                      onChange={(e) => handleInputChange(role.role_key, 'password', e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-stone-800 focus:bg-white focus:ring-1 focus:ring-purple-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 저장 버튼 */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleSaveRole(role)}
                    disabled={isSaving}
                    className="w-full py-2.5 bg-stone-900 hover:bg-purple-900 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving
                      ? (language === 'ko' ? '저장 중...' : 'Saving...')
                      : (language === 'ko' ? '수정사항 저장' : 'Save Changes')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
