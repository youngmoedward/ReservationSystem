'use client'

import React, { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { UserSim, useUserSim } from '@/app/providers'
import { UserPlus, Trash2, Key, Users, Ban, Edit, X } from 'lucide-react'
import { useLanguage } from '@/app/LanguageContext'
import { formatUSPhone, stripPhone } from '@/utils/phoneFormatter'

interface EmployeeManagerProps {
  supabase: SupabaseClient
  currentUserId: string
  onRefresh: () => void
}

export default function EmployeeManager({
  supabase,
  currentUserId,
  onRefresh
}: EmployeeManagerProps) {
  const { refreshUsers } = useUserSim()
  const { t, language } = useLanguage()
  const [employees, setEmployees] = useState<UserSim[]>([])
  
  // 가입 폼 상태
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('password123') // 기본 비밀번호 지정
  const [role, setRole] = useState<'manager' | 'staff'>('staff')
  const [isAddingEmployee, setIsAddingEmployee] = useState(false)

  // 수정 폼 상태
  const [editingEmployee, setEditingEmployee] = useState<UserSim | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'manager' | 'staff'>('staff')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 변경 이력 로그 작성 공통 헬퍼
  const writeLog = async (action: 'create' | 'update' | 'delete', details: string) => {
    try {
      await supabase.from('reservation_logs').insert({
        log_type: 'employee',
        action,
        performed_by: currentUserId || null,
        details
      })
    } catch (logErr) {
      console.error('Failed to write audit log:', logErr)
    }
  }

  // 1. 직원 목록 로드
  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employee')
        .select('id, name, role, phone, email')
        .order('created_at', { ascending: true })
      
      if (error) throw error
      if (data) setEmployees(data as UserSim[])
    } catch (err) {
      console.error('Fetch employees error:', err)
    }
  }

  useEffect(() => {
    fetchEmployees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. 신규 직원 계정 추가 (Supabase Auth + employee 테이블 동기화)
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password) {
      setErrorMsg(t('employee.required_fields'))
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      // Step A: 관리자 전용 계정 생성 API 호출 (Rate Limit 완전 회피)
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
          role
        })
      })

      const resData = await res.json()
      if (!res.ok) {
        throw new Error(resData.error || t('employee.uuid_error'))
      }

      const newUserId = resData.userId

      // Step B: 가입 완료된 UUID를 외래키로 삼아 employee 테이블에 데이터 주입
      const { error: dbError } = await supabase
        .from('employee')
        .insert({
          id: newUserId,
          name,
          role,
          phone: stripPhone(phone) || null,
          email: email.trim() || null
        })

      if (dbError) {
        console.error('DB Insert error:', dbError)
        throw new Error(t('employee.db_error').replace('{email}', email).replace('{msg}', dbError.message))
      }

      // 감사 로그 추가
      await writeLog(
        'create',
        JSON.stringify({
          key: 'log.employee.add',
          params: {
            name,
            email: email.trim(),
            role: role === 'manager' ? 'trans:log.employee.val.role_manager' : 'trans:log.employee.val.role_staff'
          }
        })
      )

      setSuccessMsg(
        t('employee.add_success')
          .replace('{name}', name)
          .replace('{password}', password)
      )
      setName('')
      setEmail('')
      setPhone('')
      setRole('staff')
      setIsAddingEmployee(false) // 모달 닫기
      
      // 목록 리로드
      fetchEmployees()
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || (language === 'ko' ? '직원 계정 등록 도중 오류가 발생했습니다.' : 'An error occurred while registering the staff account.'))
    } finally {
      setLoading(false)
    }
  }

  // 3. 직원 정보 수정 처리
  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEmployee) return

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { error } = await supabase
        .from('employee')
        .update({
          name: editName,
          role: editRole,
          phone: stripPhone(editPhone) || null,
          email: editEmail.trim() || null
        })
        .eq('id', editingEmployee.id)

      if (error) throw error

      const changesList: any[] = []
      if (editingEmployee.name !== editName.trim()) {
        changesList.push({
          key: 'log.employee.val.change_name',
          params: { old: editingEmployee.name, new: editName.trim() }
        })
      }
      if (editingEmployee.role !== editRole) {
        const oldRoleTrans = editingEmployee.role === 'manager' ? 'trans:log.employee.val.role_manager' : 'trans:log.employee.val.role_staff'
        const newRoleTrans = editRole === 'manager' ? 'trans:log.employee.val.role_manager' : 'trans:log.employee.val.role_staff'
        changesList.push({
          key: 'log.employee.val.change_role',
          params: { old: oldRoleTrans, new: newRoleTrans }
        })
      }
      if ((editingEmployee.email || '') !== editEmail.trim()) {
        changesList.push({
          key: 'log.employee.val.change_email',
          params: { old: editingEmployee.email || '', new: editEmail.trim() }
        })
      }
      if (stripPhone(editingEmployee.phone || '') !== stripPhone(editPhone)) {
        changesList.push({
          key: 'log.employee.val.change_phone',
          params: { old: formatUSPhone(editingEmployee.phone || ''), new: formatUSPhone(editPhone) }
        })
      }

      const details = JSON.stringify({
        key: 'log.employee.update',
        params: {
          name: editingEmployee.name,
          changes: changesList
        }
      })

      await writeLog('update', details)

      setSuccessMsg(t('employee.edit_success').replace('{name}', editName))
      setEditingEmployee(null)
      
      fetchEmployees()
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || (language === 'ko' ? '직원 정보 수정 도중 오류가 발생했습니다.' : 'An error occurred while updating the staff info.'))
    } finally {
      setLoading(false)
    }
  }

  // 4. 비밀번호 초기화 핸들러
  const handleResetPassword = async (id: string, employeeName: string) => {
    const promptMsg = t('employee.reset_prompt').replace('{name}', employeeName)
    const newPassword = prompt(promptMsg)
    if (newPassword === null) return // 취소됨

    const finalPassword = newPassword.trim() || 'password123'

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { error } = await supabase.rpc('reset_user_password', {
        user_uuid: id,
        new_password: finalPassword
      })

      if (error) throw error

      await writeLog(
        'update',
        JSON.stringify({
          key: 'log.employee.reset_password',
          params: { name: employeeName }
        })
      )

      setSuccessMsg(
        t('employee.reset_success')
          .replace('{name}', employeeName)
          .replace('{password}', finalPassword)
      )
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || (language === 'ko' ? '비밀번호 초기화 도중 오류가 발생했습니다.' : 'An error occurred while resetting the password.'))
    } finally {
      setLoading(false)
    }
  }

  // 5. 직원 삭제 핸들러
  const handleDeleteEmployee = async (id: string, employeeName: string) => {
    if (id === currentUserId) {
      alert(t('employee.self_delete_error'))
      return
    }

    if (!confirm(t('employee.delete_confirm').replace('{name}', employeeName))) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('employee')
        .delete()
        .eq('id', id)

      if (error) throw error

      await writeLog(
        'delete',
        JSON.stringify({
          key: 'log.employee.delete',
          params: { name: employeeName }
        })
      )

      setSuccessMsg(t('employee.delete_success').replace('{name}', employeeName))
      
      fetchEmployees()
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      alert(err.message || (language === 'ko' ? '직원 삭제에 실패했습니다.' : 'Failed to delete employee.'))
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (emp: UserSim) => {
    setEditingEmployee(emp)
    setEditName(emp.name || '')
    setEditRole(emp.role === 'manager' ? 'manager' : 'staff')
    setEditPhone(formatUSPhone(emp.phone || ''))
    setEditEmail(emp.email || '')
  }

  return (
    <div className="space-y-6 relative">
      {/* 직원 목록 관리 */}
      <div className="rounded-2xl border border-stone-200 bg-stone-100/40 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-bold tracking-tight text-stone-800 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-emerald-700" /> {t('employee.list_title')} ({employees.length}{language === 'ko' ? '명' : ''})
          </h3>
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null)
              setSuccessMsg(null)
              setIsAddingEmployee(true)
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {t('employee.add')}
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-100/50 touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="min-w-[700px] w-full divide-y divide-stone-200">
            <thead className="bg-stone-200/50 text-[10px] font-bold text-stone-600 uppercase tracking-wider text-left">
              <tr>
                <th className="px-4 py-3">{t('employee.info_label')}</th>
                <th className="px-4 py-3">{t('employee.email')}</th>
                <th className="px-4 py-3">{t('employee.phone')}</th>
                <th className="px-4 py-3">{t('employee.role')}</th>
                <th className="px-4 py-3 text-right">{t('list.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-xs text-stone-700">
              {employees.map((emp) => {
                const isMe = emp.id === currentUserId
                return (
                  <tr key={emp.id} className="hover:bg-stone-100 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-800 flex items-center gap-1.5">
                        {emp.name} {isMe && <span className="text-[10px] text-emerald-700 font-bold">({language === 'ko' ? '나' : 'Me'})</span>}
                      </div>
                      <div className="font-mono text-stone-400 text-[9px] mt-0.5">{emp.id}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-700 font-medium">{emp.email || '-'}</td>
                    <td className="px-4 py-3 text-stone-700 font-medium">{emp.phone ? formatUSPhone(emp.phone) : '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        emp.role === 'manager'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {emp.role === 'manager' ? t('user.role.manager') : t('user.role.staff')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3.5">
                        <button
                          type="button"
                          onClick={() => startEdit(emp)}
                          className="p-1 rounded-lg hover:bg-emerald-50 text-stone-500 hover:text-emerald-750 transition-colors"
                          title={t('employee.edit_tooltip')}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(emp.id, emp.name)}
                          className="p-1 rounded-lg hover:bg-amber-50 text-stone-500 hover:text-amber-750 transition-colors"
                          title={t('employee.reset_tooltip')}
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        {isMe ? (
                          <span className="p-1 text-stone-300 cursor-not-allowed" title={t('employee.self_delete_tooltip')}>
                            <Ban className="w-4 h-4" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                            className="p-1 rounded-lg hover:bg-rose-50 text-stone-500 hover:text-rose-750 transition-colors"
                            title={t('employee.delete_tooltip')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 신규 직원 계정 추가 모달 */}
      {isAddingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-stone-50 border border-stone-200 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => {
                setIsAddingEmployee(false)
                setErrorMsg(null)
                setSuccessMsg(null)
              }}
              className="absolute top-4 right-4 p-2.5 rounded-xl text-stone-500 hover:text-stone-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-stone-800 mb-6 flex items-center gap-1.5 uppercase">
              <UserPlus className="w-4 h-4 text-emerald-700" /> {t('employee.add_title')}
            </h3>
            
            <form onSubmit={handleAddEmployee} className="space-y-4">
              {errorMsg && (
                <div className="p-3 text-xs rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                  ⚠️ {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="p-3 text-xs rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {successMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('employee.name')}</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={language === 'ko' ? '예: 홍길동' : 'e.g. John Doe'}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('employee.email')} (ID)</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. staff1@jjimjil.com"
                  className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('employee.phone')}</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(formatUSPhone(e.target.value))}
                  placeholder="e.g. 123-456-7890"
                  maxLength={12}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('login.password')}</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                    <Key className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={language === 'ko' ? '비밀번호 설정' : 'Set password'}
                    className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3.5 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('employee.role')}</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'manager' | 'staff')}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3 py-3 text-sm text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors"
                >
                  <option value="staff">{t('employee.role.staff_desc')}</option>
                  <option value="manager">{t('employee.role.manager_desc')}</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingEmployee(false)
                    setErrorMsg(null)
                    setSuccessMsg(null)
                  }}
                  className="flex-1 bg-stone-200 border border-stone-200 rounded-xl py-3 text-xs font-bold text-stone-600 hover:text-stone-800 transition-all"
                >
                  {language === 'ko' ? '취소' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm py-3 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {loading ? t('employee.creating') : t('employee.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 직원 정보 수정 모달 */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-stone-50 border border-stone-200 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setEditingEmployee(null)}
              className="absolute top-4 right-4 p-2.5 rounded-xl text-stone-500 hover:text-stone-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-stone-800 mb-6 flex items-center gap-1.5">
              <Edit className="w-4 h-4 text-emerald-700" /> {t('employee.edit_title')}
            </h3>

            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('employee.name')}</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-sm text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('employee.email')}</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. staff1@jjimjil.com"
                  className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-sm text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('employee.phone')}</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatUSPhone(e.target.value))}
                  placeholder="e.g. 123-456-7890"
                  maxLength={12}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-sm text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">{t('employee.role')}</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'manager' | 'staff')}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-sm text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors"
                >
                  <option value="staff">{t('employee.role.staff_desc')}</option>
                  <option value="manager">{t('employee.role.manager_desc')}</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="flex-1 bg-stone-200 border border-stone-200 rounded-xl py-3 text-xs font-bold text-stone-600 hover:text-stone-800 transition-all"
                >
                  {language === 'ko' ? '취소' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm py-3 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {loading ? t('employee.saving') : t('employee.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


