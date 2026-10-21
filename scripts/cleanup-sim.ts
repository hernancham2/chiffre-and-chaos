// Borra las cuentas y partidas creadas por scripts/simulate.ts (correos @sim.local).
import { sql } from '../server/db'

const users = await sql`select id, email, role from "user" where email like '%@sim.local' order by created_at`
console.log('usuarios de simulación:', users.map((u) => `${u.email}(${u.role})`).join(', '))
const games = await sql`select count(*)::int as n from game_results where host_user_id in (select id from "user" where email like '%@sim.local')`
console.log('partidas guardadas por la simulación:', games[0].n)
await sql`delete from game_results where host_user_id in (select id from "user" where email like '%@sim.local')`
await sql`delete from "user" where email like '%@sim.local'`
const [{ n }] = await sql`select count(*)::int as n from "user"`
console.log('usuarios restantes:', n)
await sql.end()
