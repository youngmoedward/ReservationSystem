'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

export interface UserSim {
  id: string
  name: string
  role: 'manager' | 'staff' | 'therapist'
  therapistId?: number
  phone?: string
  email?: string
}

export const DUMMY_USERS: UserSim[] = [
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: '관리자(홍길동)', role: 'manager' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', name: '직원A(이순신)', role: 'staff' },
  { id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', name: '직원B(강감찬)', role: 'staff' },
  { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', name: '김테라(마사지사)', role: 'therapist', therapistId: 1 },
  { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', name: '이마사(마사지사)', role: 'therapist', therapistId: 2 },
]

interface UserContextProps {
  currentUser: UserSim
  setCurrentUser: (user: UserSim) => void
  users: UserSim[]
  refreshUsers: () => Promise<void>
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextProps | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<UserSim>(DUMMY_USERS[0])
  const [users, setUsers] = useState<UserSim[]>(DUMMY_USERS)

  const supabase = createClient()

  const logout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('sim_user')
    window.location.href = '/login'
  }

  const refreshUsers = async () => {
    try {
      // Get authenticated user
      const { data: { user: authUser } } = await supabase.auth.getUser()

      // Fetch employees
      const { data: empData, error: empError } = await supabase
        .from('employee')
        .select('id, name, role, phone, email')
        .order('name', { ascending: true })
      
      // Fetch therapists (both legacy and linked ones)
      const { data: thData, error: thError } = await supabase
        .from('therapists')
        .select('id, name, user_id, phone, email')
        .order('name', { ascending: true })

      if (empError) throw empError
      if (thError) throw thError

      const dynamicUsers: UserSim[] = []
      
      if (empData) {
        empData.forEach((emp: any) => {
          dynamicUsers.push({
            id: emp.id,
            name: emp.name,
            role: emp.role,
            phone: emp.phone || undefined,
            email: emp.email || undefined
          })
        })
      }
      
      if (thData) {
        thData.forEach((th: any) => {
          dynamicUsers.push({
            id: th.user_id || `mock-therapist-${th.id}`,
            name: `${th.name}(마사지사)`,
            role: 'therapist',
            therapistId: th.id,
            phone: th.phone || undefined,
            email: th.email || undefined
          })
        })
      }

      if (dynamicUsers.length > 0) {
        setUsers(dynamicUsers)
        
        // Match user logic
        let matchedUser: UserSim | undefined

        // First priority: Real authenticated user
        if (authUser) {
          matchedUser = dynamicUsers.find(u => u.id === authUser.id || u.email === authUser.email)
        }



        // Second priority: Previously simulated user override from localStorage
        if (!matchedUser) {
          const saved = localStorage.getItem('sim_user')
          if (saved) {
            try {
              const parsed = JSON.parse(saved)
              matchedUser = dynamicUsers.find(u => u.id === parsed.id)
            } catch (e) {
              console.error(e)
            }
          }
        }
        
        // Third priority: fallback to state user
        if (!matchedUser) {
          matchedUser = dynamicUsers.find(u => u.id === currentUser.id)
        }

        if (matchedUser) {
          setCurrentUserState(matchedUser)
        } else {
          const firstManager = dynamicUsers.find(u => u.role === 'manager') || dynamicUsers[0]
          setCurrentUserState(firstManager)
        }
      }
    } catch (err) {
      console.error('Failed to load dynamic simulator users, using dummy data:', err)
    }
  }

  useEffect(() => {
    refreshUsers()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        refreshUsers()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setCurrentUser = (user: UserSim) => {
    setCurrentUserState(user)
    localStorage.setItem('sim_user', JSON.stringify(user))
  }

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser, users, refreshUsers, logout }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUserSim() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUserSim must be used within a UserProvider')
  }
  return context
}

