import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  Archive, ArrowDown, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown,
  CalendarDays, CircleHelp, Flame, Leaf, ListChecks, MoreHorizontal, Moon, Plus, Sparkles, Sun,
  Trash2, X,
} from 'lucide-react'

type Habit = {
  id: string
  name: string
  createdAt: string
  archivedAt?: string
  completedDates: string[]
  kind?: 'build' | 'avoid'
  lapseDates?: string[]
}
type Task = { id: string; title: string; dueDate: string; dueTime?: string; done: boolean; createdAt: string; googleEventId?: string; googleEventUrl?: string }
type Store = { habits: Habit[]; tasks: Task[] }
type View = 'today' | 'week' | 'month' | 'habits' | 'tasks' | 'recovery'
type Theme = 'dark' | 'light'
type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string }
type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void }
type CalendarToken = { accessToken: string; expiresAt: number }

declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient: (options: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void }) => GoogleTokenClient
      revoke: (token: string, callback: (response: { successful?: boolean }) => void) => void
    } } }
  }
}

const STORAGE_KEY = 'ritmo-habitos-v1'
const THEME_KEY = 'ritmo-theme'
const GOOGLE_CLIENT_KEY = 'ritmo-google-client-id'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function parseKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}
function shiftDate(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
function startOfWeek(date: Date) {
  const monday = new Date(date)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}
function sameDay(a: Date, b: Date) { return dateKey(a) === dateKey(b) }
function readStore(): Store {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
  if (value) {
    const parsed = JSON.parse(value) as Partial<Store>
    return { habits: (parsed.habits ?? []).map(habit => ({ kind: 'build', lapseDates: [], ...habit })), tasks: parsed.tasks ?? [] }
  }
  } catch { /* Recover gracefully from invalid local data. */ }
  return { habits: [], tasks: [] }
}
function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}
function readGoogleClientId() {
  try { return localStorage.getItem(GOOGLE_CLIENT_KEY) ?? '' } catch { return '' }
}
function shortDate(date: Date) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(date).replace('.', '')
}
function longDate(date: Date) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}
function expectedOn(habit: Habit, date: Date) {
  const key = dateKey(date)
  return key >= habit.createdAt && (!habit.archivedAt || key <= habit.archivedAt)
}
function dayTotals(habits: Habit[], date: Date) {
  const eligible = habits.filter(habit => habit.kind !== 'avoid' && expectedOn(habit, date))
  return { total: eligible.length, done: eligible.filter(habit => habit.completedDates.includes(dateKey(date))).length }
}
function currentStreak(habit: Habit, today: Date) {
  let cursor = new Date(today)
  if (!habit.completedDates.includes(dateKey(cursor))) cursor = shiftDate(cursor, -1)
  let count = 0
  while (habit.completedDates.includes(dateKey(cursor)) && expectedOn(habit, cursor)) {
    count += 1
    cursor = shiftDate(cursor, -1)
  }
  return count
}
function periodStats(habits: Habit[], dates: Date[]) {
  let done = 0
  let total = 0
  for (const date of dates) {
    const result = dayTotals(habits, date)
    done += result.done
    total += result.total
  }
  return { done, total, percent: total ? Math.round(done / total * 100) : 0 }
}

export default function App() {
  const [store, setStore] = useState<Store>(readStore)
  const storeRef = useRef(store)
  const [view, setView] = useState<View>('today')
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [filterId, setFilterId] = useState('all')
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [habitName, setHabitName] = useState('')
  const [habitKind, setHabitKind] = useState<'build' | 'avoid'>('build')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState(dateKey(new Date()))
  const [taskDueTime, setTaskDueTime] = useState('09:00')
  const [googleClientId, setGoogleClientId] = useState(readGoogleClientId)
  const [calendarToken, setCalendarToken] = useState<CalendarToken | null>(null)
  const [calendarMessage, setCalendarMessage] = useState('')
  const [calendarBusyIds, setCalendarBusyIds] = useState<string[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [toast, setToast] = useState('')
  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const activeHabits = store.habits.filter(habit => !habit.archivedAt)
  const buildHabits = activeHabits.filter(habit => habit.kind !== 'avoid')
  const avoidHabits = activeHabits.filter(habit => habit.kind === 'avoid')
  const openTasks = store.tasks.filter(task => !task.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const archivedHabits = store.habits.filter(habit => habit.archivedAt)
  const visibleHabits = filterId === 'all' ? buildHabits : buildHabits.filter(habit => habit.id === filterId)
  const selectedHabit = store.habits.find(habit => habit.id === activeId)
  const todayTotals = dayTotals(buildHabits, selectedDate)
  const completion = todayTotals.total ? Math.round(todayTotals.done / todayTotals.total * 100) : 0
  const streaks = buildHabits.map(habit => currentStreak(habit, today))
  const bestStreak = Math.max(0, ...streaks)
  const nativePlatform = Capacitor.isNativePlatform()
  const calendarConnected = Boolean(calendarToken && calendarToken.expiresAt > Date.now() + 30_000)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171d19' : '#f8f8f5')
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* Theme still applies for this session. */ }
  }, [theme])

  useEffect(() => {
    if (!calendarToken) return
    const timeout = window.setTimeout(() => setCalendarToken(null), Math.max(0, calendarToken.expiresAt - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [calendarToken])

  function persist(habits: Habit[]) {
    persistStore({ ...store, habits })
  }
  function persistStore(next: Store) {
    storeRef.current = next
    setStore(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {
      notify('No se pudo guardar en este dispositivo.')
    }
  }
  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }
  function openAdd(kind: 'build' | 'avoid' = 'build') { setHabitName(''); setHabitKind(kind); setActiveId(null); setModal('add') }
  function openEdit(habit: Habit) { setHabitName(habit.name); setHabitKind(habit.kind ?? 'build'); setActiveId(habit.id); setModal('edit') }
  function saveHabit(event: React.FormEvent) {
    event.preventDefault()
    const name = habitName.trim()
    if (!name) return
    if (modal === 'edit' && activeId) {
      persist(store.habits.map(habit => habit.id === activeId ? { ...habit, name, kind: habitKind } : habit))
      notify('Hábito actualizado')
    } else {
      persist([{ id: crypto.randomUUID(), name, kind: habitKind, createdAt: dateKey(new Date()), completedDates: [], lapseDates: [] }, ...store.habits])
      notify(habitKind === 'avoid' ? 'Seguimiento creado' : 'Nuevo hábito creado')
    }
    setModal(null)
  }
  function toggleHabit(habit: Habit, date: Date) {
    const key = dateKey(date)
    if (key > todayKey || key < habit.createdAt || (habit.archivedAt && key > habit.archivedAt)) return
    const completedDates = habit.completedDates.includes(key)
      ? habit.completedDates.filter(item => item !== key)
      : [...habit.completedDates, key]
    persist(store.habits.map(item => item.id === habit.id ? { ...item, completedDates } : item))
  }
  function archiveHabit(habit: Habit) {
    persist(store.habits.map(item => item.id === habit.id ? { ...item, archivedAt: todayKey } : item))
    notify('Hábito archivado. Su historial se conserva.')
  }
  function reactivateHabit(habit: Habit) {
    persist(store.habits.map(item => item.id === habit.id ? { ...item, archivedAt: undefined } : item))
    notify('Hábito reactivado')
  }
  function deleteHabit(habit: Habit) {
    persist(store.habits.filter(item => item.id !== habit.id))
    setModal(null)
    setActiveId(null)
    notify('Hábito e historial eliminados')
  }
  function addTask(event: React.FormEvent) {
    event.preventDefault()
    const title = taskTitle.trim()
    if (!title) return
    persistStore({ ...store, tasks: [{ id: crypto.randomUUID(), title, dueDate: taskDueDate || todayKey, dueTime: taskDueTime || '09:00', done: false, createdAt: todayKey }, ...store.tasks] })
    setTaskTitle('')
    notify('Tarea guardada')
  }
  function updateTask(task: Task, changes: Partial<Task>) { persistStore({ ...store, tasks: store.tasks.map(item => item.id === task.id ? { ...item, ...changes } : item) }) }
  function removeTask(task: Task) { persistStore({ ...store, tasks: store.tasks.filter(item => item.id !== task.id) }) }
  function recordLapse(habit: Habit) {
    const lapseDates = habit.lapseDates ?? []
    if (lapseDates.includes(todayKey)) return
    persist(store.habits.map(item => item.id === habit.id ? { ...item, lapseDates: [...lapseDates, todayKey] } : item))
    notify('Día registrado. Mañana puedes volver a empezar.')
  }
  function undoLapse(habit: Habit) { persist(store.habits.map(item => item.id === habit.id ? { ...item, lapseDates: (item.lapseDates ?? []).filter(date => date !== todayKey) } : item)) }
  function cleanDays(habit: Habit) {
    const last = [...(habit.lapseDates ?? [])].sort().at(-1)
    const from = last ? shiftDate(parseKey(last), 1) : parseKey(habit.createdAt)
    return Math.max(0, Math.floor((new Date(todayKey).getTime() - new Date(dateKey(from)).getTime()) / 86400000))
  }
  function cleanHistory(habit: Habit) {
    let start = parseKey(habit.createdAt)
    return [...(habit.lapseDates ?? [])].sort().map(date => {
      const end = parseKey(date)
      const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
      start = shiftDate(end, 1)
      return { date, days }
    })
  }
  function calendarLink(task: Task) {
    const start = new Date(`${task.dueDate}T${task.dueTime || '09:00'}:00`)
    const end = new Date(start.getTime() + 30 * 60000)
    const format = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`
    const params = new URLSearchParams({ action: 'TEMPLATE', text: task.title, dates: `${format(start)}/${format(end)}`, ctz: Intl.DateTimeFormat().resolvedOptions().timeZone, details: 'Creado desde Ritmo' })
    return `https://calendar.google.com/calendar/render?${params}`
  }
  function saveGoogleClientId() {
    const clientId = googleClientId.trim()
    setGoogleClientId(clientId)
    setCalendarToken(null)
    try {
      if (clientId) localStorage.setItem(GOOGLE_CLIENT_KEY, clientId)
      else localStorage.removeItem(GOOGLE_CLIENT_KEY)
      setCalendarMessage(clientId ? 'ID de cliente guardado en este dispositivo.' : 'Se ha quitado el ID de cliente.')
    } catch { setCalendarMessage('No se pudo guardar la configuración en este dispositivo.') }
  }
  function requestCalendarAccess(onAccess: (accessToken: string) => void, clientId = googleClientId) {
    const configuredClientId = clientId.trim()
    if (!configuredClientId) {
      setCalendarMessage('Añade primero el ID de cliente OAuth de tu proyecto de Google Cloud.')
      return
    }
    if (calendarToken && calendarToken.expiresAt > Date.now() + 30_000) {
      onAccess(calendarToken.accessToken)
      return
    }
    const oauth = window.google?.accounts.oauth2
    if (!oauth) {
      setCalendarMessage('No se pudo cargar Google Identity Services. Comprueba tu conexión y vuelve a intentarlo.')
      return
    }
    const client = oauth.initTokenClient({
      client_id: configuredClientId,
      scope: CALENDAR_SCOPE,
      callback: response => {
        if (response.error || !response.access_token) {
          setCalendarMessage('No se concedió acceso al calendario. Puedes intentarlo de nuevo cuando quieras.')
          return
        }
        const token = { accessToken: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 }
        setCalendarToken(token)
        setCalendarMessage('Google Calendar conectado en esta sesión.')
        onAccess(token.accessToken)
      },
    })
    client.requestAccessToken({ prompt: 'select_account' })
  }
  function connectCalendar() {
    const clientId = googleClientId.trim()
    saveGoogleClientId()
    requestCalendarAccess(() => setCalendarMessage('Google Calendar conectado en esta sesión.'), clientId)
  }
  function disconnectCalendar() {
    const oauth = window.google?.accounts.oauth2
    if (calendarToken && oauth) {
      oauth.revoke(calendarToken.accessToken, () => setCalendarMessage('Se ha retirado el acceso de Google Calendar.'))
    } else {
      setCalendarMessage('Se ha cerrado la sesión de Calendar en Ritmo. Para retirar el permiso concedido, revócalo también desde tu cuenta de Google.')
    }
    setCalendarToken(null)
  }
  async function sendTaskToCalendar(task: Task, accessToken: string) {
    if (task.googleEventId) {
      setCalendarMessage('Esta tarea ya está añadida a Google Calendar.')
      return
    }
    const start = new Date(`${task.dueDate}T${task.dueTime || '09:00'}:00`)
    const end = new Date(start.getTime() + 30 * 60_000)
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: task.title,
          description: 'Creado desde Ritmo',
          start: { dateTime: start.toISOString(), timeZone },
          end: { dateTime: end.toISOString(), timeZone },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
        }),
      })
      const event = await response.json() as { id?: string; htmlLink?: string; error?: { message?: string } }
      if (!response.ok || !event.id) throw new Error(event.error?.message ?? 'Google no pudo crear el evento.')
      const current = storeRef.current
      persistStore({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, googleEventId: event.id, googleEventUrl: event.htmlLink } : item) })
      setCalendarMessage(`«${task.title}» se ha creado en Google Calendar con un aviso 10 minutos antes.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el evento.'
      setCalendarMessage(`${message} Revisa la configuración de Calendar y prueba otra vez.`)
    } finally {
      setCalendarBusyIds(ids => ids.filter(id => id !== task.id))
    }
  }
  function addTaskToCalendar(task: Task) {
    if (calendarBusyIds.includes(task.id)) return
    if (!googleClientId.trim()) {
      setCalendarMessage('Guarda un ID de cliente OAuth para poder conectar Google Calendar.')
      return
    }
    if ((!calendarToken || calendarToken.expiresAt <= Date.now() + 30_000) && !window.google?.accounts.oauth2) {
      setCalendarMessage('No se pudo cargar Google Identity Services. Comprueba tu conexión y vuelve a intentarlo.')
      return
    }
    setCalendarBusyIds(ids => [...ids, task.id])
    requestCalendarAccess(accessToken => { void sendTaskToCalendar(task, accessToken) })
    window.setTimeout(() => setCalendarBusyIds(ids => ids.filter(id => id !== task.id)), 90_000)
  }
  function shiftPeriod(amount: number) {
    if (view === 'week') setSelectedDate(date => shiftDate(date, amount * 7))
    else setSelectedDate(date => new Date(date.getFullYear(), date.getMonth() + amount, 1))
  }
  function switchView(next: View) {
    setView(next)
    setSelectedDate(new Date())
    setFilterId('all')
  }

  const dateTitle = selectedDate.toDateString() === today.toDateString()
    ? 'Hoy'
    : new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(selectedDate)
  const weekStart = startOfWeek(selectedDate)
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index))
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  const monthLength = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate()
  const monthDates = Array.from({ length: monthLength }, (_, index) => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), index + 1))
  const summaryHabits = filterId === 'all' ? store.habits.filter(habit => habit.kind !== 'avoid') : store.habits.filter(habit => habit.id === filterId && habit.kind !== 'avoid')
  const summaryDates = view === 'week' ? weekDates.filter(date => dateKey(date) <= todayKey) : monthDates.filter(date => dateKey(date) <= todayKey)
  const summary = periodStats(summaryHabits, summaryDates)
  const displayedDates = view === 'week' ? weekDates : monthDates
  const doneLabel = completion === 100 && todayTotals.total > 0 ? '¡Todo hecho!' : completion > 0 ? 'Vas muy bien' : 'Un paso cada día'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#hoy" onClick={() => switchView('today')}>
          <span className="brand-mark"><Leaf size={21} strokeWidth={2.1} /></span>
          <span>ritmo<span className="brand-period">.</span></span>
        </a>
        <p className="nav-caption">TU ESPACIO</p>
        <nav className="side-nav" aria-label="Navegación principal">
          <NavButton active={view === 'today'} icon={<CheckCheck size={18} />} label="Hoy" onClick={() => switchView('today')} />
          <NavButton active={view === 'tasks'} icon={<ListChecks size={18} />} label="Pendientes" onClick={() => switchView('tasks')} />
          <NavButton active={view === 'week'} icon={<ListChecks size={18} />} label="Semana" onClick={() => switchView('week')} />
          <NavButton active={view === 'month'} icon={<span className="calendar-icon">▦</span>} label="Mes" onClick={() => switchView('month')} />
          <NavButton active={view === 'habits'} icon={<Leaf size={18} />} label="Mis hábitos" onClick={() => switchView('habits')} />
          <NavButton active={view === 'recovery'} icon={<Flame size={18} />} label="Días limpios" onClick={() => switchView('recovery')} />
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><Sparkles size={17} /><span>Los pequeños pasos también cuentan.</span></div>
          <div className="profile"><div className="avatar">T</div><div><strong>Tu espacio</strong><span>Solo en este dispositivo</span></div><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Mi espacio <span>/</span> <strong>{view === 'today' ? 'Hoy' : view === 'week' ? 'Semana' : view === 'month' ? 'Mes' : view === 'tasks' ? 'Pendientes' : view === 'recovery' ? 'Días limpios' : 'Mis hábitos'}</strong></div>
          <div className="topbar-actions"><button className="theme-toggle" type="button" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'Oscuro' : 'Claro'}</span></button><div className="topbar-date"><span className="online-dot" /> Guardado en tu dispositivo</div></div>
        </header>

        <div className="content-wrap">
          {view === 'today' && <>
            <section className="greeting-row">
              <div><p className="eyebrow">{longDate(selectedDate)}</p><h1>{dateTitle === 'Hoy' ? 'Un día a tu ritmo' : `Tu día, ${dateTitle}`}</h1><p className="subtitle">Un poco de constancia cambia mucho. ¿Qué te gustaría cuidar hoy?</p></div>
              <button className="button-primary add-top" onClick={() => openAdd('build')}><Plus size={17} /> Nuevo hábito</button>
            </section>
            <section className="overview-grid">
              <div className="progress-card">
                <div className="progress-copy"><span className="card-kicker">TUS HÁBITOS DE HOY</span><div className="progress-number">{todayTotals.done}<span> / {todayTotals.total}</span></div><p>{doneLabel}{todayTotals.total ? ` · ${completion}% completado` : ' · empieza con un hábito sencillo'}</p></div>
                <div className="ring" style={{ '--progress': `${completion}%` } as React.CSSProperties}><div><strong>{completion}<small>%</small></strong><span>completado</span></div></div>
                <div className="leaf-decoration leaf-one">✳</div><div className="leaf-decoration leaf-two">✳</div>
              </div>
              <div className="streak-card"><div className="streak-icon"><Flame size={19} fill="currentColor" /></div><div className="card-kicker">RACHA MÁS LARGA</div><div className="streak-number">{bestStreak}<span> días</span></div><p>{bestStreak ? 'La constancia se construye así.' : 'Tu próxima racha empieza hoy.'}</p><div className="streak-dots">{Array.from({ length: 7 }, (_, index) => <span className={index < Math.min(bestStreak, 7) ? 'filled' : ''} key={index} />)}</div></div>
            </section>
            <section className="habits-section">
              <div className="section-heading"><div><h2>Mis hábitos</h2><p>{selectedDate.toDateString() === today.toDateString() ? 'Cada pequeño check es un paso hacia ti.' : 'Consulta o actualiza el registro de este día.'}</p></div><button className="text-button" onClick={() => switchView('habits')}>Ver todos <ArrowRight size={15} /></button></div>
              {buildHabits.length === 0 ? <EmptyState onAdd={() => openAdd('build')} /> : <div className="habit-list">{visibleHabits.map((habit, index) => <HabitRow key={habit.id} habit={habit} index={index} date={selectedDate} today={today} onToggle={toggleHabit} onEdit={openEdit} onArchive={archiveHabit} />)}</div>}
              {buildHabits.length > 0 && <button className="add-habit-row" onClick={() => openAdd('build')}><span><Plus size={17} /></span> Añadir otro hábito</button>}
            </section>
            <TaskPanel tasks={openTasks} title={taskTitle} dueDate={taskDueDate} dueTime={taskDueTime} onTitle={setTaskTitle} onDueDate={setTaskDueDate} onDueTime={setTaskDueTime} onAdd={addTask} onToggle={task => updateTask(task, { done: true })} onRemove={removeTask} calendarLink={calendarLink} calendarConfigured={Boolean(googleClientId.trim()) && !nativePlatform} calendarConnected={calendarConnected && !nativePlatform} busyTaskIds={calendarBusyIds} onAddToCalendar={addTaskToCalendar} compact />
            {avoidHabits.length > 0 && <section className="focus-card"><div><span className="card-kicker">CUIDARTE TAMBIÉN ES AVANZAR</span><h2>{avoidHabits.length} seguimiento{avoidHabits.length === 1 ? '' : 's'} de días limpios</h2><p>Tu progreso está en Días limpios.</p></div><button className="button-quiet" onClick={() => switchView('recovery')}>Ver progreso <ArrowRight size={15} /></button></section>}
            <section className="week-preview"><div className="section-heading compact"><div><h2>Esta semana</h2><p>Tu ritmo, día a día</p></div><button className="text-button" onClick={() => switchView('week')}>Ver resumen <ArrowRight size={15} /></button></div><div className="week-strip">{weekDates.map((date, index) => { const total = dayTotals(activeHabits, date); const pct = total.total ? total.done / total.total * 100 : 0; return <button className={`week-day ${sameDay(date, today) ? 'is-today' : ''} ${dateKey(date) > todayKey ? 'future' : ''}`} key={index} onClick={() => setSelectedDate(date)}><span>{weekdays[index]}</span><strong>{date.getDate()}</strong><i><b style={{ width: `${pct}%` }} /></i></button> })}</div></section>
          </>}

          {(view === 'week' || view === 'month') && <>
            <section className="greeting-row summary-header"><div><p className="eyebrow">UNA MIRADA A TU PROGRESO</p><h1>{view === 'week' ? 'Tu semana, en equilibrio' : 'Un mes de pequeños pasos'}</h1><p className="subtitle">Cada día cuenta. Mira todo lo que has ido construyendo.</p></div></section>
            <div className="period-toolbar"><div className="period-switch"><button aria-label="Periodo anterior" onClick={() => shiftPeriod(-1)}><ArrowLeft size={17} /></button><strong>{view === 'week' ? `${shortDate(weekDates[0])} — ${shortDate(weekDates[6])}` : `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`}</strong><button aria-label="Periodo siguiente" disabled={(view === 'week' ? dateKey(weekDates[6]) : dateKey(monthStart)) >= todayKey} onClick={() => shiftPeriod(1)}><ArrowRight size={17} /></button></div><button className="today-shortcut" onClick={() => setSelectedDate(new Date())}>Volver a hoy</button></div>
            <div className="summary-grid"><div className="summary-main-card"><div className="summary-main-top"><div><span className="card-kicker">CUMPLIMIENTO DEL {view === 'week' ? 'PERIODO' : 'MES'}</span><div className="summary-percent">{summary.percent}<span>%</span></div><p>{summary.done} de {summary.total} hábitos completados</p></div><div className="summary-emblem"><Sparkles size={27} /></div></div><div className="summary-progress"><span style={{ width: `${summary.percent}%` }} /></div><p className="summary-encouragement">{summary.percent >= 80 ? '¡Qué bonito ritmo llevas!' : summary.percent >= 40 ? 'Vas construyendo una rutina que es tuya.' : 'Cada intento cuenta. Sigue a tu ritmo.'}</p></div><div className="summary-side-card"><div className="side-stat-icon"><Flame size={18} /></div><span className="card-kicker">TU MEJOR RACHA</span><strong>{Math.max(0, ...summaryHabits.map(habit => currentStreak(habit, today)))}<small> días</small></strong><p>La magia está en volver a empezar.</p><div className="side-stat-divider" /><span className="card-kicker">DÍAS REGISTRADOS</span><b className="registered-days">{summaryDates.filter(date => dayTotals(summaryHabits, date).total > 0).length} <small>/ {view === 'week' ? 7 : monthLength} días</small></b></div></div>
            <section className="chart-card"><div className="section-heading chart-heading"><div><h2>Tu actividad</h2><p>Hábitos completados cada día</p></div><select className="habit-filter" value={filterId} onChange={event => setFilterId(event.target.value)}><option value="all">Todos los hábitos</option>{store.habits.map(habit => <option key={habit.id} value={habit.id}>{habit.name}</option>)}</select></div><div className={`bar-chart ${view === 'month' ? 'monthly-chart' : ''}`} style={view === 'month' ? { gridTemplateColumns: `repeat(${displayedDates.length}, minmax(0, 1fr))` } : undefined}>{displayedDates.map((date, index) => { const stat = dayTotals(summaryHabits, date); const percentage = stat.total ? Math.round(stat.done / stat.total * 100) : 0; const future = dateKey(date) > todayKey; const active = dateKey(date) === todayKey; return <div className={`chart-column ${future ? 'future' : ''} ${active ? 'current' : ''}`} key={index}><div className="bar-space"><span className="bar-value">{future || !stat.total ? '' : `${percentage}%`}</span><div className="bar-track"><i style={{ height: future || !stat.total ? '4px' : `${Math.max(percentage, 5)}%` }} /></div></div><span className="chart-label">{view === 'week' ? weekdays[index] : date.getDate()}</span></div> })}</div><div className="chart-legend"><span><i /> Progreso diario</span><span><i className="today-legend" /> Hoy</span></div></section>
            <section className="detail-card"><div className="section-heading"><div><h2>Progreso por hábito</h2><p>Un vistazo a cada uno de tus hábitos</p></div></div>{summaryHabits.length ? <div className="habit-progress-list">{summaryHabits.map((habit, index) => { const dates = displayedDates.filter(date => dateKey(date) <= todayKey && expectedOn(habit, date)); const done = dates.filter(date => habit.completedDates.includes(dateKey(date))).length; const percent = dates.length ? Math.round(done / dates.length * 100) : 0; const streak = currentStreak(habit, today); return <div className="habit-progress-row" key={habit.id}><span className={`habit-mini-icon color-${index % 5}`}><Leaf size={16} /></span><div className="habit-progress-name"><strong>{habit.name}</strong><span>{done} de {dates.length} días</span></div><div className="habit-progress-meter"><i style={{ width: `${percent}%` }} /></div><strong className="habit-progress-pct">{percent}%</strong>{streak > 0 && <span className="mini-streak"><Flame size={13} />{streak}</span>}</div> })}</div> : <div className="empty-inline">Todavía no hay hábitos en este periodo.</div>}</section>
          </>}

          {view === 'tasks' && <><section className="greeting-row"><div><p className="eyebrow">UN PASO A LA VEZ</p><h1>Tus tareas pendientes</h1><p className="subtitle">Saca las cosas de tu cabeza y ponlas en un lugar tranquilo.</p></div></section><CalendarConnection clientId={googleClientId} onClientId={setGoogleClientId} onSave={saveGoogleClientId} connected={calendarConnected} onConnect={connectCalendar} onDisconnect={disconnectCalendar} message={calendarMessage} nativePlatform={nativePlatform} /><TaskPanel tasks={store.tasks.slice().sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate))} title={taskTitle} dueDate={taskDueDate} dueTime={taskDueTime} onTitle={setTaskTitle} onDueDate={setTaskDueDate} onDueTime={setTaskDueTime} onAdd={addTask} onToggle={task => updateTask(task, { done: !task.done })} onRemove={removeTask} calendarLink={calendarLink} calendarConfigured={Boolean(googleClientId.trim()) && !nativePlatform} calendarConnected={calendarConnected && !nativePlatform} busyTaskIds={calendarBusyIds} onAddToCalendar={addTaskToCalendar} /> </>}

          {view === 'recovery' && <><section className="greeting-row"><div><p className="eyebrow">SIN CULPA, UN DÍA A LA VEZ</p><h1>Días limpios</h1><p className="subtitle">Registra el tiempo desde tu último consumo o conducta. Un tropiezo no borra lo que has avanzado.</p></div><button className="button-primary add-top" onClick={() => openAdd('avoid')}><Plus size={17} /> Nuevo seguimiento</button></section><div className="recovery-intro"><Flame size={19} /><span>El contador se reinicia al registrar un día y conserva las rachas anteriores en tu historial.</span></div>{avoidHabits.length ? <div className="recovery-list">{avoidHabits.map(habit => { const days = cleanDays(habit); const lapsedToday = (habit.lapseDates ?? []).includes(todayKey); const lastLapse = [...(habit.lapseDates ?? [])].sort().at(-1); const history = cleanHistory(habit); return <article className="recovery-card" key={habit.id}><div className="recovery-card-top"><div><span className="card-kicker">SEGUIMIENTO</span><h2>{habit.name}</h2></div><div className="recovery-days"><strong>{days}</strong><span>{days === 1 ? 'día limpio' : 'días limpios'}</span></div></div><div className="recovery-meta">{lastLapse ? `Último reinicio: ${shortDate(parseKey(lastLapse))}` : `Desde ${shortDate(parseKey(habit.createdAt))}`} · {history.length} reinicios registrados</div>{history.length > 0 && <details className="recovery-history"><summary>Ver rachas anteriores</summary><ul>{history.slice().reverse().map(item => <li key={item.date}>{item.days} {item.days === 1 ? 'día limpio' : 'días limpios'} hasta el {shortDate(parseKey(item.date))}</li>)}</ul></details>}<div className="recovery-actions"><button className="button-danger" onClick={() => recordLapse(habit)} disabled={lapsedToday}>{lapsedToday ? 'Día registrado' : 'Registrar un tropiezo'}</button>{lapsedToday && <button className="button-quiet" onClick={() => undoLapse(habit)}>Deshacer</button>}<button className="icon-action" aria-label={`Editar ${habit.name}`} onClick={() => openEdit(habit)}><MoreHorizontal size={18} /></button><button className="icon-action" aria-label={`Archivar ${habit.name}`} onClick={() => archiveHabit(habit)}><Archive size={16} /></button><button className="icon-action delete-action" aria-label={`Eliminar ${habit.name} y su historial`} onClick={() => { setActiveId(habit.id); setModal('delete') }}><Trash2 size={15} /></button></div></article>})}</div> : <div className="empty-state"><div className="empty-illustration"><Flame size={25} /></div><h3>Un espacio para empezar cuando tú quieras</h3><p>Elige un hábito que quieras dejar y empezaremos a contar los días.</p><button className="button-primary" onClick={() => openAdd('avoid')}><Plus size={16} /> Crear seguimiento</button></div>}</>}

          {view === 'habits' && <>
            <section className="greeting-row"><div><p className="eyebrow">TU ESPACIO PERSONAL</p><h1>Hábitos que te hacen bien</h1><p className="subtitle">No se trata de hacerlo perfecto, sino de hacerlo tuyo.</p></div><button className="button-primary add-top" onClick={() => openAdd('build')}><Plus size={17} /> Nuevo hábito</button></section>
            <div className="manage-stat-row"><div><span className="manage-stat-icon"><Leaf size={17} /></span><strong>{buildHabits.length}</strong><span>hábitos activos</span></div><div><span className="manage-stat-icon archive"><Archive size={17} /></span><strong>{archivedHabits.length}</strong><span>en pausa</span></div><div className="manage-message"><Sparkles size={17} /><span>Un hábito pequeño puede cambiar un día entero.</span></div></div>
            <section className="habits-section manage-section"><div className="section-heading"><div><h2>En tu rutina</h2><p>Los hábitos que te acompañan cada día.</p></div></div>{buildHabits.length ? <div className="manage-list">{buildHabits.map((habit, index) => <ManageRow key={habit.id} habit={habit} index={index} onEdit={openEdit} onArchive={archiveHabit} onDelete={item => { setActiveId(item.id); setModal('delete') }} />)}</div> : <EmptyState onAdd={() => openAdd('build')} />}</section>
            {archivedHabits.length > 0 && <section className="archived-section"><button className="archive-toggle" onClick={() => setShowArchived(!showArchived)}><Archive size={17} /><span>Hábitos archivados</span><span className="archive-count">{archivedHabits.length}</span><ChevronDown className={showArchived ? 'rotated' : ''} size={17} /></button>{showArchived && <div className="manage-list archived-list">{archivedHabits.map((habit, index) => <ManageRow key={habit.id} habit={habit} index={index} archived onEdit={openEdit} onArchive={reactivateHabit} onDelete={item => { setActiveId(item.id); setModal('delete') }} />)}</div>}</section>}
            <aside className="privacy-note"><CircleHelp size={17} /><p><strong>Tus datos son solo tuyos.</strong> Hábitos, tareas y seguimientos se guardan en este dispositivo. Nadie más puede verlos.</p><a className="privacy-policy-link" href="./privacy.html">Privacidad</a></aside>
          </>}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Navegación principal"><NavButton active={view === 'today'} icon={<CheckCheck size={20} />} label="Hoy" onClick={() => switchView('today')} /><NavButton active={view === 'tasks'} icon={<ListChecks size={20} />} label="Tareas" onClick={() => switchView('tasks')} /><NavButton active={view === 'week'} icon={<CalendarDays size={20} />} label="Semana" onClick={() => switchView('week')} /><NavButton active={view === 'month'} icon={<span className="calendar-icon">▦</span>} label="Mes" onClick={() => switchView('month')} /><NavButton active={view === 'habits'} icon={<Leaf size={20} />} label="Hábitos" onClick={() => switchView('habits')} /><NavButton active={view === 'recovery'} icon={<Flame size={20} />} label="Limpio" onClick={() => switchView('recovery')} /></nav>

      {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null) }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" aria-label="Cerrar" onClick={() => setModal(null)}><X size={18} /></button>{modal === 'delete' ? <><div className="modal-icon danger"><Trash2 size={20} /></div><p className="eyebrow">ELIMINAR HÁBITO</p><h2 id="modal-title">¿Eliminar «{selectedHabit?.name}»?</h2><p className="modal-description">También se borrará todo su historial. Esta acción no se puede deshacer.</p><div className="modal-actions"><button className="button-quiet" onClick={() => setModal(null)}>Cancelar</button><button className="button-danger" onClick={() => selectedHabit && deleteHabit(selectedHabit)}>Eliminar hábito</button></div></> : <form onSubmit={saveHabit}><div className="modal-icon">{habitKind === 'avoid' ? <Flame size={20} /> : <Leaf size={20} />}</div><p className="eyebrow">{modal === 'edit' ? 'UN CAMBIO A TU MEDIDA' : 'UN PASO A TU RITMO'}</p><h2 id="modal-title">{modal === 'edit' ? 'Editar seguimiento' : '¿Qué quieres trabajar?'}</h2><p className="modal-description">Puedes crear una rutina que te ayude o llevar la cuenta de días sin un hábito.</p><label className="form-label" htmlFor="habit-kind">Tipo de seguimiento</label><select id="habit-kind" className="habit-input" value={habitKind} onChange={event => setHabitKind(event.target.value as 'build' | 'avoid')}><option value="build">Crear un hábito positivo</option><option value="avoid">Dejar un mal hábito</option></select><label className="form-label" htmlFor="habit-name">Nombre</label><input id="habit-name" className="habit-input" autoFocus maxLength={60} placeholder={habitKind === 'avoid' ? 'Ej. No fumar' : 'Ej. Leer 10 minutos'} value={habitName} onChange={event => setHabitName(event.target.value)} /><div className="modal-actions"><button type="button" className="button-quiet" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="button-primary" disabled={!habitName.trim()}>{modal === 'edit' ? 'Guardar cambios' : 'Crear seguimiento'} <ArrowRight size={16} /></button></div></form>}</section></div>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-illustration"><Leaf size={25} /><span>✳</span></div><h3>Aquí empieza tu ritmo</h3><p>Añade un hábito pequeño que te gustaría cuidar cada día.</p><button className="button-primary" onClick={onAdd}><Plus size={16} /> Crear mi primer hábito</button></div>
}

function CalendarConnection({ clientId, onClientId, onSave, connected, onConnect, onDisconnect, message, nativePlatform }: { clientId: string; onClientId: (value: string) => void; onSave: () => void; connected: boolean; onConnect: () => void; onDisconnect: () => void; message: string; nativePlatform: boolean }) {
  if (nativePlatform) return <section className="calendar-connection"><div className="calendar-connection-heading"><div><span className="card-kicker">CALENDARIO</span><h2>Google Calendar</h2></div></div><p>La conexión directa de Google se ofrece en la versión web abierta en Safari o Chrome. Google bloquea los flujos OAuth dentro de las WebView de aplicaciones nativas.</p><a className="calendar-web-link" href="https://diegofdz2204.github.io/ritmo-habitos/" target="_blank" rel="noreferrer">Abrir Ritmo en el navegador</a><p className="calendar-security">En esta app puedes seguir preparando eventos con el icono de calendario junto a cada tarea.</p></section>
  return <section className="calendar-connection"><div className="calendar-connection-heading"><div><span className="card-kicker">CALENDARIO</span><h2>Google Calendar</h2></div><span className={`calendar-status ${connected ? 'is-connected' : ''}`}><i />{connected ? 'Conectado en esta sesión' : 'Sin conectar'}</span></div><p>Conecta tu cuenta para crear eventos con recordatorio. Ritmo solo enviará a Google las tareas que elijas añadir.</p><label className="form-label" htmlFor="google-client-id">ID de cliente OAuth web</label><div className="calendar-config-row"><input id="google-client-id" className="habit-input" autoComplete="off" spellCheck={false} placeholder="123...apps.googleusercontent.com" value={clientId} onChange={event => onClientId(event.target.value)} /><button className="button-quiet calendar-config-save" onClick={onSave}>Guardar ID</button></div><div className="calendar-connection-actions"><button className="button-primary" disabled={!clientId.trim()} onClick={onConnect}>{connected ? 'Actualizar conexión' : 'Conectar Google Calendar'}</button>{connected && <button className="button-quiet" onClick={onDisconnect}>Desconectar</button>}<a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Configurar en Google Cloud</a></div><p className="calendar-security">Necesitas habilitar Google Calendar API y autorizar como origen JavaScript <code>https://diegofdz2204.github.io</code>. El permiso solicitado es solo para crear eventos; el token se mantiene en memoria durante esta sesión.</p>{message && <p className="calendar-message" role="status">{message}</p>}</section>
}

function TaskPanel({ tasks, title, dueDate, dueTime, onTitle, onDueDate, onDueTime, onAdd, onToggle, onRemove, calendarLink, calendarConfigured, calendarConnected, busyTaskIds, onAddToCalendar, compact = false }: { tasks: Task[]; title: string; dueDate: string; dueTime: string; onTitle: (value: string) => void; onDueDate: (value: string) => void; onDueTime: (value: string) => void; onAdd: (event: React.FormEvent) => void; onToggle: (task: Task) => void; onRemove: (task: Task) => void; calendarLink: (task: Task) => string; calendarConfigured: boolean; calendarConnected: boolean; busyTaskIds: string[]; onAddToCalendar: (task: Task) => void; compact?: boolean }) {
  const visibleTasks = compact ? tasks.slice(0, 4) : tasks
  return <section className={`tasks-panel ${compact ? 'compact' : ''}`}><div className="section-heading"><div><h2>{compact ? 'Tareas para hoy' : 'Pendientes'}</h2><p>{compact ? `${tasks.length} por hacer` : 'Organiza tus tareas y define cuándo quieres recordarlas.'}</p></div></div><form className="task-form" onSubmit={onAdd}><input className="habit-input" aria-label="Nueva tarea" placeholder="Ej. Llamar al dentista" maxLength={120} value={title} onChange={event => onTitle(event.target.value)} /><input className="habit-input task-date" type="date" aria-label="Fecha de la tarea" value={dueDate} onChange={event => onDueDate(event.target.value)} /><input className="habit-input task-time" type="time" aria-label="Hora de la tarea" value={dueTime} onChange={event => onDueTime(event.target.value)} /><button className="button-primary" type="submit" disabled={!title.trim()}><Plus size={16} /> Añadir</button></form>{visibleTasks.length ? <div className="task-list">{visibleTasks.map(task => <article className={`task-row ${task.done ? 'task-done' : ''}`} key={task.id}><button className={`task-check ${task.done ? 'checked' : ''}`} aria-label={task.done ? `Reabrir ${task.title}` : `Completar ${task.title}`} aria-pressed={task.done} onClick={() => onToggle(task)}>{task.done && <Check size={15} />}</button><div className="task-copy"><strong>{task.title}</strong><span>{task.dueDate === dateKey(new Date()) ? 'Hoy' : new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parseKey(task.dueDate))} · {task.dueTime || '09:00'}</span></div>{task.googleEventUrl ? <a className="calendar-link calendar-saved" href={task.googleEventUrl} target="_blank" rel="noreferrer" aria-label={`Ver evento de Google Calendar: ${task.title}`} title="Ver evento en Google Calendar"><CalendarDays size={16} /></a> : calendarConfigured ? <button className="calendar-link" disabled={busyTaskIds.includes(task.id)} onClick={() => onAddToCalendar(task)} aria-label={`Añadir ${task.title} a Google Calendar`} title={calendarConnected ? 'Crear evento en Google Calendar' : 'Autorizar y crear evento en Google Calendar'}><CalendarDays size={16} /></button> : <a className="calendar-link" href={calendarLink(task)} target="_blank" rel="noreferrer" aria-label={`Abrir evento preparado para ${task.title}`} title="Abrir Google Calendar"><CalendarDays size={16} /></a>}<button className="icon-action" aria-label={`Eliminar tarea ${task.title}`} onClick={() => onRemove(task)}><Trash2 size={15} /></button></article>)}</div> : <p className="empty-inline">No tienes tareas pendientes. Puedes dejar este espacio vacío.</p>}{compact && tasks.length > 4 && <p className="task-more">Y {tasks.length - 4} tareas más en Pendientes.</p>}<p className="calendar-note">{calendarConfigured ? 'Al añadir el evento, se envían a Google el título y la fecha de esa tarea. Ritmo solicita permiso solo para crear eventos y muestra un aviso 10 minutos antes.' : 'Puedes abrir un evento preparado manualmente. Para crearlo directamente desde Ritmo, configura el cliente OAuth de Google Calendar en Pendientes.'}</p></section>
}

function HabitRow({ habit, index, date, today, onToggle, onEdit, onArchive }: { habit: Habit; index: number; date: Date; today: Date; onToggle: (habit: Habit, date: Date) => void; onEdit: (habit: Habit) => void; onArchive: (habit: Habit) => void }) {
  const done = habit.completedDates.includes(dateKey(date))
  const canToggle = dateKey(date) <= dateKey(today) && expectedOn(habit, date)
  return <article className={`habit-row ${done ? 'is-done' : ''}`}><button className={`habit-check color-${index % 5} ${done ? 'checked' : ''}`} aria-label={done ? `Marcar ${habit.name} como pendiente` : `Completar ${habit.name}`} aria-pressed={done} disabled={!canToggle} onClick={() => onToggle(habit, date)}>{done && <Check size={18} strokeWidth={2.5} />}</button><div className="habit-row-main"><strong>{habit.name}</strong><span>{done ? '¡Un paso más para ti!' : 'Hoy puede ser un buen día para empezar.'}</span></div><span className="habit-streak"><Flame size={14} /> {currentStreak(habit, today)} <small>días</small></span><div className="row-actions"><button aria-label="Editar hábito" onClick={() => onEdit(habit)}><MoreHorizontal size={18} /></button><button aria-label="Archivar hábito" onClick={() => onArchive(habit)}><Archive size={16} /></button></div></article>
}

function ManageRow({ habit, index, archived = false, onEdit, onArchive, onDelete }: { habit: Habit; index: number; archived?: boolean; onEdit: (habit: Habit) => void; onArchive: (habit: Habit) => void; onDelete: (habit: Habit) => void }) {
  const streak = currentStreak(habit, new Date())
  return <article className={`manage-row ${archived ? 'is-archived' : ''}`}><span className={`manage-habit-icon color-${index % 5}`}><Leaf size={17} /></span><div className="manage-name"><strong>{habit.name}</strong><span>{archived ? `En pausa desde el ${shortDate(parseKey(habit.archivedAt!))} · historial guardado` : `${streak ? `${streak} días de racha · ` : ''}Desde el ${shortDate(parseKey(habit.createdAt))}`}</span></div>{!archived && streak > 0 && <span className="manage-streak"><Flame size={14} /> {streak}</span>}<div className="manage-actions"><button aria-label={archived ? 'Reactivar hábito' : 'Editar hábito'} title={archived ? 'Reactivar hábito' : 'Editar hábito'} onClick={() => archived ? onArchive(habit) : onEdit(habit)}>{archived ? <ArrowDown size={17} /> : <MoreHorizontal size={19} />}</button>{!archived && <button aria-label="Archivar hábito" title="Archivar hábito" onClick={() => onArchive(habit)}><Archive size={16} /></button>}<button className="delete-action" aria-label="Eliminar hábito" title="Eliminar hábito" onClick={() => onDelete(habit)}><Trash2 size={16} /></button></div></article>
}

