import { useMemo, useState } from 'react'
import {
  Archive, ArrowDown, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown,
  CircleHelp, Flame, Leaf, ListChecks, MoreHorizontal, Plus, Sparkles,
  Trash2, X,
} from 'lucide-react'

type Habit = {
  id: string
  name: string
  createdAt: string
  archivedAt?: string
  completedDates: string[]
}
type Store = { habits: Habit[] }
type View = 'today' | 'week' | 'month' | 'habits'

const STORAGE_KEY = 'ritmo-habitos-v1'
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
    if (value) return JSON.parse(value) as Store
  } catch { /* Recover gracefully from invalid local data. */ }
  return { habits: [] }
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
  const eligible = habits.filter(habit => expectedOn(habit, date))
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
  const [view, setView] = useState<View>('today')
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [filterId, setFilterId] = useState('all')
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [habitName, setHabitName] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [toast, setToast] = useState('')
  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const activeHabits = store.habits.filter(habit => !habit.archivedAt)
  const archivedHabits = store.habits.filter(habit => habit.archivedAt)
  const visibleHabits = filterId === 'all' ? activeHabits : activeHabits.filter(habit => habit.id === filterId)
  const selectedHabit = store.habits.find(habit => habit.id === activeId)
  const todayTotals = dayTotals(activeHabits, selectedDate)
  const completion = todayTotals.total ? Math.round(todayTotals.done / todayTotals.total * 100) : 0
  const streaks = activeHabits.map(habit => currentStreak(habit, today))
  const bestStreak = Math.max(0, ...streaks)

  function persist(habits: Habit[]) {
    const next = { habits }
    setStore(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {
      notify('No se pudo guardar en este dispositivo.')
    }
  }
  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }
  function openAdd() { setHabitName(''); setActiveId(null); setModal('add') }
  function openEdit(habit: Habit) { setHabitName(habit.name); setActiveId(habit.id); setModal('edit') }
  function saveHabit(event: React.FormEvent) {
    event.preventDefault()
    const name = habitName.trim()
    if (!name) return
    if (modal === 'edit' && activeId) {
      persist(store.habits.map(habit => habit.id === activeId ? { ...habit, name } : habit))
      notify('Hábito actualizado')
    } else {
      persist([{ id: crypto.randomUUID(), name, createdAt: dateKey(new Date()), completedDates: [] }, ...store.habits])
      notify('Nuevo hábito creado')
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
  const summaryHabits = filterId === 'all' ? store.habits : store.habits.filter(habit => habit.id === filterId)
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
          <NavButton active={view === 'week'} icon={<ListChecks size={18} />} label="Semana" onClick={() => switchView('week')} />
          <NavButton active={view === 'month'} icon={<span className="calendar-icon">▦</span>} label="Mes" onClick={() => switchView('month')} />
          <NavButton active={view === 'habits'} icon={<Leaf size={18} />} label="Mis hábitos" onClick={() => switchView('habits')} />
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><Sparkles size={17} /><span>Los pequeños pasos también cuentan.</span></div>
          <div className="profile"><div className="avatar">T</div><div><strong>Tu espacio</strong><span>Solo en este dispositivo</span></div><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Mi espacio <span>/</span> <strong>{view === 'today' ? 'Hoy' : view === 'week' ? 'Semana' : view === 'month' ? 'Mes' : 'Mis hábitos'}</strong></div>
          <div className="topbar-date"><span className="online-dot" /> Guardado en tu dispositivo</div>
        </header>

        <div className="content-wrap">
          {view === 'today' && <>
            <section className="greeting-row">
              <div><p className="eyebrow">{longDate(selectedDate)}</p><h1>{dateTitle === 'Hoy' ? 'Un día a tu ritmo' : `Tu día, ${dateTitle}`}</h1><p className="subtitle">Un poco de constancia cambia mucho. ¿Qué te gustaría cuidar hoy?</p></div>
              <button className="button-primary add-top" onClick={openAdd}><Plus size={17} /> Nuevo hábito</button>
            </section>
            <section className="overview-grid">
              <div className="progress-card">
                <div className="progress-copy"><span className="card-kicker">TU PROGRESO DE HOY</span><div className="progress-number">{todayTotals.done}<span> / {todayTotals.total}</span></div><p>{doneLabel}{todayTotals.total ? ` · ${completion}% completado` : ' · empieza con un hábito sencillo'}</p></div>
                <div className="ring" style={{ '--progress': `${completion}%` } as React.CSSProperties}><div><strong>{completion}<small>%</small></strong><span>completado</span></div></div>
                <div className="leaf-decoration leaf-one">✳</div><div className="leaf-decoration leaf-two">✳</div>
              </div>
              <div className="streak-card"><div className="streak-icon"><Flame size={19} fill="currentColor" /></div><div className="card-kicker">RACHA MÁS LARGA</div><div className="streak-number">{bestStreak}<span> días</span></div><p>{bestStreak ? 'La constancia se construye así.' : 'Tu próxima racha empieza hoy.'}</p><div className="streak-dots">{Array.from({ length: 7 }, (_, index) => <span className={index < Math.min(bestStreak, 7) ? 'filled' : ''} key={index} />)}</div></div>
            </section>
            <section className="habits-section">
              <div className="section-heading"><div><h2>Mis hábitos</h2><p>{selectedDate.toDateString() === today.toDateString() ? 'Cada pequeño check es un paso hacia ti.' : 'Consulta o actualiza el registro de este día.'}</p></div><button className="text-button" onClick={() => switchView('habits')}>Ver todos <ArrowRight size={15} /></button></div>
              {activeHabits.length === 0 ? <EmptyState onAdd={openAdd} /> : <div className="habit-list">{visibleHabits.map((habit, index) => <HabitRow key={habit.id} habit={habit} index={index} date={selectedDate} today={today} onToggle={toggleHabit} onEdit={openEdit} onArchive={archiveHabit} />)}</div>}
              {activeHabits.length > 0 && <button className="add-habit-row" onClick={openAdd}><span><Plus size={17} /></span> Añadir otro hábito</button>}
            </section>
            <section className="week-preview"><div className="section-heading compact"><div><h2>Esta semana</h2><p>Tu ritmo, día a día</p></div><button className="text-button" onClick={() => switchView('week')}>Ver resumen <ArrowRight size={15} /></button></div><div className="week-strip">{weekDates.map((date, index) => { const total = dayTotals(activeHabits, date); const pct = total.total ? total.done / total.total * 100 : 0; return <button className={`week-day ${sameDay(date, today) ? 'is-today' : ''} ${dateKey(date) > todayKey ? 'future' : ''}`} key={index} onClick={() => setSelectedDate(date)}><span>{weekdays[index]}</span><strong>{date.getDate()}</strong><i><b style={{ width: `${pct}%` }} /></i></button> })}</div></section>
          </>}

          {(view === 'week' || view === 'month') && <>
            <section className="greeting-row summary-header"><div><p className="eyebrow">UNA MIRADA A TU PROGRESO</p><h1>{view === 'week' ? 'Tu semana, en equilibrio' : 'Un mes de pequeños pasos'}</h1><p className="subtitle">Cada día cuenta. Mira todo lo que has ido construyendo.</p></div></section>
            <div className="period-toolbar"><div className="period-switch"><button aria-label="Periodo anterior" onClick={() => shiftPeriod(-1)}><ArrowLeft size={17} /></button><strong>{view === 'week' ? `${shortDate(weekDates[0])} — ${shortDate(weekDates[6])}` : `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`}</strong><button aria-label="Periodo siguiente" disabled={(view === 'week' ? dateKey(weekDates[6]) : dateKey(monthStart)) >= todayKey} onClick={() => shiftPeriod(1)}><ArrowRight size={17} /></button></div><button className="today-shortcut" onClick={() => setSelectedDate(new Date())}>Volver a hoy</button></div>
            <div className="summary-grid"><div className="summary-main-card"><div className="summary-main-top"><div><span className="card-kicker">CUMPLIMIENTO DEL {view === 'week' ? 'PERIODO' : 'MES'}</span><div className="summary-percent">{summary.percent}<span>%</span></div><p>{summary.done} de {summary.total} hábitos completados</p></div><div className="summary-emblem"><Sparkles size={27} /></div></div><div className="summary-progress"><span style={{ width: `${summary.percent}%` }} /></div><p className="summary-encouragement">{summary.percent >= 80 ? '¡Qué bonito ritmo llevas!' : summary.percent >= 40 ? 'Vas construyendo una rutina que es tuya.' : 'Cada intento cuenta. Sigue a tu ritmo.'}</p></div><div className="summary-side-card"><div className="side-stat-icon"><Flame size={18} /></div><span className="card-kicker">TU MEJOR RACHA</span><strong>{Math.max(0, ...summaryHabits.map(habit => currentStreak(habit, today)))}<small> días</small></strong><p>La magia está en volver a empezar.</p><div className="side-stat-divider" /><span className="card-kicker">DÍAS REGISTRADOS</span><b className="registered-days">{summaryDates.filter(date => dayTotals(summaryHabits, date).total > 0).length} <small>/ {view === 'week' ? 7 : monthLength} días</small></b></div></div>
            <section className="chart-card"><div className="section-heading chart-heading"><div><h2>Tu actividad</h2><p>Hábitos completados cada día</p></div><select className="habit-filter" value={filterId} onChange={event => setFilterId(event.target.value)}><option value="all">Todos los hábitos</option>{store.habits.map(habit => <option key={habit.id} value={habit.id}>{habit.name}</option>)}</select></div><div className={`bar-chart ${view === 'month' ? 'monthly-chart' : ''}`} style={view === 'month' ? { gridTemplateColumns: `repeat(${displayedDates.length}, minmax(0, 1fr))` } : undefined}>{displayedDates.map((date, index) => { const stat = dayTotals(summaryHabits, date); const percentage = stat.total ? Math.round(stat.done / stat.total * 100) : 0; const future = dateKey(date) > todayKey; const active = dateKey(date) === todayKey; return <div className={`chart-column ${future ? 'future' : ''} ${active ? 'current' : ''}`} key={index}><div className="bar-space"><span className="bar-value">{future || !stat.total ? '' : `${percentage}%`}</span><div className="bar-track"><i style={{ height: future || !stat.total ? '4px' : `${Math.max(percentage, 5)}%` }} /></div></div><span className="chart-label">{view === 'week' ? weekdays[index] : date.getDate()}</span></div> })}</div><div className="chart-legend"><span><i /> Progreso diario</span><span><i className="today-legend" /> Hoy</span></div></section>
            <section className="detail-card"><div className="section-heading"><div><h2>Progreso por hábito</h2><p>Un vistazo a cada uno de tus hábitos</p></div></div>{summaryHabits.length ? <div className="habit-progress-list">{summaryHabits.map((habit, index) => { const dates = displayedDates.filter(date => dateKey(date) <= todayKey && expectedOn(habit, date)); const done = dates.filter(date => habit.completedDates.includes(dateKey(date))).length; const percent = dates.length ? Math.round(done / dates.length * 100) : 0; const streak = currentStreak(habit, today); return <div className="habit-progress-row" key={habit.id}><span className={`habit-mini-icon color-${index % 5}`}><Leaf size={16} /></span><div className="habit-progress-name"><strong>{habit.name}</strong><span>{done} de {dates.length} días</span></div><div className="habit-progress-meter"><i style={{ width: `${percent}%` }} /></div><strong className="habit-progress-pct">{percent}%</strong>{streak > 0 && <span className="mini-streak"><Flame size={13} />{streak}</span>}</div> })}</div> : <div className="empty-inline">Todavía no hay hábitos en este periodo.</div>}</section>
          </>}

          {view === 'habits' && <>
            <section className="greeting-row"><div><p className="eyebrow">TU ESPACIO PERSONAL</p><h1>Hábitos que te hacen bien</h1><p className="subtitle">No se trata de hacerlo perfecto, sino de hacerlo tuyo.</p></div><button className="button-primary add-top" onClick={openAdd}><Plus size={17} /> Nuevo hábito</button></section>
            <div className="manage-stat-row"><div><span className="manage-stat-icon"><Leaf size={17} /></span><strong>{activeHabits.length}</strong><span>hábitos activos</span></div><div><span className="manage-stat-icon archive"><Archive size={17} /></span><strong>{archivedHabits.length}</strong><span>en pausa</span></div><div className="manage-message"><Sparkles size={17} /><span>Un hábito pequeño puede cambiar un día entero.</span></div></div>
            <section className="habits-section manage-section"><div className="section-heading"><div><h2>En tu rutina</h2><p>Los hábitos que te acompañan cada día.</p></div></div>{activeHabits.length ? <div className="manage-list">{activeHabits.map((habit, index) => <ManageRow key={habit.id} habit={habit} index={index} onEdit={openEdit} onArchive={archiveHabit} onDelete={item => { setActiveId(item.id); setModal('delete') }} />)}</div> : <EmptyState onAdd={openAdd} />}</section>
            {archivedHabits.length > 0 && <section className="archived-section"><button className="archive-toggle" onClick={() => setShowArchived(!showArchived)}><Archive size={17} /><span>Hábitos archivados</span><span className="archive-count">{archivedHabits.length}</span><ChevronDown className={showArchived ? 'rotated' : ''} size={17} /></button>{showArchived && <div className="manage-list archived-list">{archivedHabits.map((habit, index) => <ManageRow key={habit.id} habit={habit} index={index} archived onEdit={openEdit} onArchive={reactivateHabit} onDelete={item => { setActiveId(item.id); setModal('delete') }} />)}</div>}</section>}
            <aside className="privacy-note"><CircleHelp size={17} /><p><strong>Tus datos son solo tuyos.</strong> Los hábitos y registros se guardan en este dispositivo. Nadie más puede verlos.</p></aside>
          </>}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Navegación principal"><NavButton active={view === 'today'} icon={<CheckCheck size={20} />} label="Hoy" onClick={() => switchView('today')} /><NavButton active={view === 'week'} icon={<ListChecks size={20} />} label="Semana" onClick={() => switchView('week')} /><NavButton active={view === 'month'} icon={<span className="calendar-icon">▦</span>} label="Mes" onClick={() => switchView('month')} /><NavButton active={view === 'habits'} icon={<Leaf size={20} />} label="Hábitos" onClick={() => switchView('habits')} /></nav>

      {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null) }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" aria-label="Cerrar" onClick={() => setModal(null)}><X size={18} /></button>{modal === 'delete' ? <><div className="modal-icon danger"><Trash2 size={20} /></div><p className="eyebrow">ELIMINAR HÁBITO</p><h2 id="modal-title">¿Eliminar «{selectedHabit?.name}»?</h2><p className="modal-description">También se borrará todo su historial. Esta acción no se puede deshacer.</p><div className="modal-actions"><button className="button-quiet" onClick={() => setModal(null)}>Cancelar</button><button className="button-danger" onClick={() => selectedHabit && deleteHabit(selectedHabit)}>Eliminar hábito</button></div></> : <form onSubmit={saveHabit}><div className="modal-icon"><Leaf size={20} /></div><p className="eyebrow">{modal === 'edit' ? 'UN CAMBIO A TU MEDIDA' : 'UN PASO PARA TI'}</p><h2 id="modal-title">{modal === 'edit' ? 'Editar hábito' : '¿Qué quieres incorporar?'}</h2><p className="modal-description">Elige algo sencillo que quieras repetir cada día.</p><label className="form-label" htmlFor="habit-name">Nombre del hábito</label><input id="habit-name" className="habit-input" autoFocus maxLength={60} placeholder="Ej. Leer 10 minutos" value={habitName} onChange={event => setHabitName(event.target.value)} /><div className="modal-actions"><button type="button" className="button-quiet" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="button-primary" disabled={!habitName.trim()}>{modal === 'edit' ? 'Guardar cambios' : 'Crear hábito'} <ArrowRight size={16} /></button></div></form>}</section></div>}
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

function HabitRow({ habit, index, date, today, onToggle, onEdit, onArchive }: { habit: Habit; index: number; date: Date; today: Date; onToggle: (habit: Habit, date: Date) => void; onEdit: (habit: Habit) => void; onArchive: (habit: Habit) => void }) {
  const done = habit.completedDates.includes(dateKey(date))
  const canToggle = dateKey(date) <= dateKey(today) && expectedOn(habit, date)
  return <article className={`habit-row ${done ? 'is-done' : ''}`}><button className={`habit-check color-${index % 5} ${done ? 'checked' : ''}`} aria-label={done ? `Marcar ${habit.name} como pendiente` : `Completar ${habit.name}`} aria-pressed={done} disabled={!canToggle} onClick={() => onToggle(habit, date)}>{done && <Check size={18} strokeWidth={2.5} />}</button><div className="habit-row-main"><strong>{habit.name}</strong><span>{done ? '¡Un paso más para ti!' : 'Hoy puede ser un buen día para empezar.'}</span></div><span className="habit-streak"><Flame size={14} /> {currentStreak(habit, today)} <small>días</small></span><div className="row-actions"><button aria-label="Editar hábito" onClick={() => onEdit(habit)}><MoreHorizontal size={18} /></button><button aria-label="Archivar hábito" onClick={() => onArchive(habit)}><Archive size={16} /></button></div></article>
}

function ManageRow({ habit, index, archived = false, onEdit, onArchive, onDelete }: { habit: Habit; index: number; archived?: boolean; onEdit: (habit: Habit) => void; onArchive: (habit: Habit) => void; onDelete: (habit: Habit) => void }) {
  const streak = currentStreak(habit, new Date())
  return <article className={`manage-row ${archived ? 'is-archived' : ''}`}><span className={`manage-habit-icon color-${index % 5}`}><Leaf size={17} /></span><div className="manage-name"><strong>{habit.name}</strong><span>{archived ? `En pausa desde el ${shortDate(parseKey(habit.archivedAt!))} · historial guardado` : `${streak ? `${streak} días de racha · ` : ''}Desde el ${shortDate(parseKey(habit.createdAt))}`}</span></div>{!archived && streak > 0 && <span className="manage-streak"><Flame size={14} /> {streak}</span>}<div className="manage-actions"><button aria-label={archived ? 'Reactivar hábito' : 'Editar hábito'} title={archived ? 'Reactivar hábito' : 'Editar hábito'} onClick={() => archived ? onArchive(habit) : onEdit(habit)}>{archived ? <ArrowDown size={17} /> : <MoreHorizontal size={19} />}</button>{!archived && <button aria-label="Archivar hábito" title="Archivar hábito" onClick={() => onArchive(habit)}><Archive size={16} /></button>}<button className="delete-action" aria-label="Eliminar hábito" title="Eliminar hábito" onClick={() => onDelete(habit)}><Trash2 size={16} /></button></div></article>
}
