import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access'

// Permisos propios del juego, además de los de usuarios/sesiones del plugin admin.
export const statement = {
  ...defaultStatements,
  question: ['create', 'update', 'delete'],
  settings: ['update'],
  room: ['close'],
} as const

export const ac = createAccessControl(statement)

export const adminRole = ac.newRole({
  question: ['create', 'update', 'delete'],
  settings: ['update'],
  room: ['close'],
  ...adminAc.statements,
})

export const userRole = ac.newRole({ ...userAc.statements })

export const roles = { admin: adminRole, user: userRole }
